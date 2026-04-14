import { createConsumer } from '../kafka/consumer.js';
import { bulkUpsertProducts, markInactiveProductsWindow } from '../db/bulk-operations.js';
import { query } from '../db/pool.js';
import { getObject } from '../storage/client.js';
import logger from '../utils/logger.js';
import { Kafka } from 'kafkajs';

const MAX_CHUNK_RETRIES = parseInt(process.env.MAX_CHUNK_RETRIES || '3', 10);
const TOPIC_CHUNKS_READY = process.env.KAFKA_TOPIC_CHUNKS_READY || 'chunks.ready';
const TOPIC_CHUNKS_FAILED = process.env.KAFKA_TOPIC_CHUNKS_FAILED || 'chunks.failed';

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'integrahub-upsert-retry',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const retryProducer = kafka.producer();
let retryProducerConnected = false;

async function ensureRetryProducer() {
  if (!retryProducerConnected) {
    await retryProducer.connect();
    retryProducerConnected = true;
  }
}

async function scheduleChunkRetry(chunkData, attempts) {
  await ensureRetryProducer();

  const nextAttempt = attempts + 1;
  const retryPayload = {
    ...chunkData,
    retryAttempt: nextAttempt,
    maxRetries: MAX_CHUNK_RETRIES,
    retriedAt: new Date().toISOString(),
  };

  await retryProducer.send({
    topic: TOPIC_CHUNKS_READY,
    messages: [{
      key: chunkData.cnpj,
      value: JSON.stringify(retryPayload),
      headers: {
        'event-type': 'chunk.retry',
        'chunk-id': chunkData.chunkId,
        'batch-id': chunkData.batchId,
        attempt: String(nextAttempt),
      }
    }]
  });
}

async function publishChunkFailed(chunkData, attempts, errorMessage, errorCode, errorContext) {
  await ensureRetryProducer();

  await retryProducer.send({
    topic: TOPIC_CHUNKS_FAILED,
    messages: [{
      key: chunkData.cnpj,
      value: JSON.stringify({
        ...chunkData,
        attempts,
        maxRetries: MAX_CHUNK_RETRIES,
        errorMessage,
        errorCode,
        errorContext,
        failedAt: new Date().toISOString(),
      }),
      headers: {
        'event-type': 'chunk.failed.final',
        'chunk-id': chunkData.chunkId,
        'batch-id': chunkData.batchId,
      }
    }]
  });
}

function getErrorMessage(error) {
  if (!error) return 'unknown error';
  return String(error.message || error).slice(0, 2000);
}

function getErrorCode(error) {
  if (!error) return null;
  return error.code ? String(error.code).slice(0, 100) : null;
}

function buildErrorContext(error, chunkData) {
  return {
    batchId: chunkData.batchId,
    chunkId: chunkData.chunkId,
    chunkIndex: chunkData.chunkIndex,
    chunkUri: chunkData.chunkUri,
    pharmacyId: chunkData.pharmacyId,
    cnpj: chunkData.cnpj,
    loadType: chunkData.loadType,
    detail: error?.detail || null,
    schema: error?.schema || null,
    table: error?.table || null,
    column: error?.column || null,
    constraint: error?.constraint || null,
    where: error?.where || null,
  };
}

export async function processChunk(chunkData) {
  const { chunkId, batchId, pharmacyId, cnpj, loadType, chunkUri, itemsCount, chunkIndex, totalChunks } = chunkData;
  
  logger.info({
    event: 'upsert.start',
    chunkId,
    batchId,
    itemsCount
  }, 'Processing chunk');
  
  try {
    // Update chunk status
    await query(
      `UPDATE batch_chunks 
       SET status = 'PROCESSING',
           error_message = NULL,
           error_code = NULL,
           error_context = NULL,
           last_error_at = NULL,
           updated_at = NOW() 
       WHERE chunk_id = $1`,
      [chunkId]
    );
    
    // Download chunk from storage
    const stream = await getObject(chunkUri);
    let buffer = '';
    
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
    });
    
    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    
    const products = JSON.parse(buffer);
    
    // Bulk upsert products
    const { upserted } = await bulkUpsertProducts(pharmacyId, products, loadType, batchId);
    
    // Update chunk status
    await query(
      `UPDATE batch_chunks 
       SET status = 'COMPLETED',
           processed_at = NOW(),
           error_message = NULL,
           error_code = NULL,
           error_context = NULL,
           last_error_at = NULL,
           updated_at = NOW() 
       WHERE chunk_id = $1`,
      [chunkId]
    );
    
    // Update batch progress
    await query(
      `UPDATE batches 
       SET items_processed = items_processed + $1, updated_at = NOW() 
       WHERE batch_id = $2`,
      [upserted, batchId]
    );
    
    logger.info({
      event: 'upsert.complete',
      chunkId,
      batchId,
      upserted
    }, 'Chunk processed');
    
    // Check if this was the last chunk
    const completedChunks = await query(
      `SELECT COUNT(*) as completed 
       FROM batch_chunks 
       WHERE batch_id = $1 AND status = 'COMPLETED'`,
      [batchId]
    );
    
    if (parseInt(completedChunks.rows[0].completed) === totalChunks) {
      // All chunks processed
      if (loadType === 'full') {
        const windowMinutes = parseInt(process.env.FULL_WINDOW_MINUTES || '10', 10);
        const result = await markInactiveProductsWindow(pharmacyId, batchId, windowMinutes);
        logger.info(
          { batchId, ...result, windowMinutes },
          result.skipped ? 'Skipped inactivation' : 'Marked inactive products'
        );
      }
      
      await query(
        `UPDATE batches 
         SET status = 'COMPLETED',
             error_message = NULL,
             error_code = NULL,
             error_context = NULL,
             last_error_at = NULL,
             updated_at = NOW() 
         WHERE batch_id = $1`,
        [batchId]
      );
      
      logger.info({ event: 'batch.complete', batchId }, 'Batch completed');
    }
    
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const errorCode = getErrorCode(error);
    const errorContext = buildErrorContext(error, chunkData);

    logger.error({
      error: errorMessage,
      errorCode,
      errorContext,
      stack: error.stack,
      chunkId,
      batchId,
      cnpj,
      chunkUri,
      chunkIndex
    }, 'Upsert error');
    
    // Update chunk and capture current attempts for retry decision.
    const chunkUpdate = await query(
      `UPDATE batch_chunks 
       SET status = 'FAILED',
           attempts = attempts + 1,
           error_message = $2,
           error_code = $3,
           error_context = $4::jsonb,
           last_error_at = NOW(),
           updated_at = NOW() 
       WHERE chunk_id = $1
       RETURNING attempts`,
      [chunkId, errorMessage, errorCode, JSON.stringify(errorContext)]
    );

    const attempts = chunkUpdate.rows[0]?.attempts || 1;
    const shouldRetry = attempts < MAX_CHUNK_RETRIES;

    if (shouldRetry) {
      await query(
        `UPDATE batch_chunks
         SET status = 'PENDING', updated_at = NOW()
         WHERE chunk_id = $1`,
        [chunkId]
      );

      await query(
        `UPDATE batches
         SET status = 'PROCESSING',
             error_message = $2,
             error_code = $3,
             error_context = $4::jsonb,
             last_error_at = NOW(),
             updated_at = NOW()
         WHERE batch_id = $1`,
        [batchId, errorMessage, errorCode, JSON.stringify({ ...errorContext, attempts, willRetry: true })]
      );

      await scheduleChunkRetry(chunkData, attempts);

      logger.warn({
        event: 'upsert.retry_scheduled',
        chunkId,
        batchId,
        attempts,
        maxRetries: MAX_CHUNK_RETRIES
      }, 'Chunk retry scheduled');

      return;
    }

    await query(
      `UPDATE batches 
       SET items_failed = items_failed + $1,
           status = 'PARTIAL_FAIL',
           error_message = $3,
           error_code = $4,
           error_context = $5::jsonb,
           last_error_at = NOW(),
           updated_at = NOW() 
       WHERE batch_id = $2`,
      [itemsCount, batchId, errorMessage, errorCode, JSON.stringify({ ...errorContext, attempts, willRetry: false })]
    );

    await publishChunkFailed(chunkData, attempts, errorMessage, errorCode, errorContext);

    logger.error({
      event: 'upsert.retry_exhausted',
      chunkId,
      batchId,
      attempts,
      maxRetries: MAX_CHUNK_RETRIES
    }, 'Chunk failed after max retries');
  }
}

export async function startUpsertWorker(workerId = 0) {
  const consumer = await createConsumer(
    'upsert-workers', // Same group = auto load balancing
    ['chunks.ready']
  );
  
  logger.info({ workerId }, 'Upsert worker started');
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message || !message.value) {
        logger.warn({ topic, partition }, 'Received empty message');
        return;
      }

      const chunkData = JSON.parse(message.value.toString());
      await processChunk(chunkData);
    }
  });
  
  return consumer;
}

// Standalone mode (for Kubernetes pods or separate processes)
if (import.meta.url === `file://${process.argv[1]}`) {
  const workerId = process.env.WORKER_ID || process.pid;
  startUpsertWorker(workerId).catch(console.error);
}
