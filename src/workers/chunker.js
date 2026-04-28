import { createConsumer } from '../kafka/consumer.js';
import { getObject, uploadObject } from '../storage/client.js';
import { query } from '../db/pool.js';
import logger from '../utils/logger.js';
import { Kafka } from 'kafkajs';

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '1000');
const MAX_BATCH_RETRIES = parseInt(process.env.MAX_BATCH_RETRIES || '3', 10);
const TOPIC_BATCHES_RECEIVED = process.env.KAFKA_TOPIC_BATCHES_RECEIVED || 'batches.received';
const TOPIC_CHUNKS_READY = process.env.KAFKA_TOPIC_CHUNKS_READY || 'chunks.ready';

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'integrahub-chunker-retry',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const producer = kafka.producer();
let producerConnected = false;

async function ensureProducer() {
  if (!producerConnected) {
    await producer.connect();
    producerConnected = true;
  }
}

async function publishChunkReady(chunkPayload) {
  await ensureProducer();

  await producer.send({
    topic: TOPIC_CHUNKS_READY,
    messages: [{
      key: chunkPayload.cnpj,
      value: JSON.stringify(chunkPayload),
      headers: {
        'event-type': 'chunk.ready',
        'batch-id': chunkPayload.batchId,
        'chunk-index': String(chunkPayload.chunkIndex),
      }
    }]
  });
}

async function scheduleBatchRetry(event, attempts, errorMessage, errorCode, errorContext) {
  await ensureProducer();

  await producer.send({
    topic: TOPIC_BATCHES_RECEIVED,
    messages: [{
      key: event.cnpj,
      value: JSON.stringify({
        ...event,
        retryAttempt: attempts,
        retriedAt: new Date().toISOString(),
      }),
      headers: {
        'event-type': 'batch.retry',
        'batch-id': event.batchId,
        attempt: String(attempts),
        'error-code': errorCode || '',
        'error-message': errorMessage.slice(0, 200),
        'error-phase': errorContext.phase || 'unknown',
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

export async function startChunkerWorker() {
  const consumer = await createConsumer('chunker-workers', ['batches.received']);
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const event = JSON.parse(message.value.toString());
      const { batchId, cnpj, loadType, retryAttempt = 0 } = event;
      let phase = 'start';
      
      logger.info({ event: 'chunker.start', batchId, cnpj, retryAttempt }, 'Processing batch');
      
      try {
        phase = 'load_batch_metadata';
        // Get batch metadata
        const batchResult = await query(
          'SELECT payload_uri, pharmacy_id FROM batches WHERE batch_id = $1',
          [batchId]
        );
        
        if (batchResult.rows.length === 0) {
          logger.error({ batchId }, 'Batch not found');
          return;
        }
        
        const { payload_uri, pharmacy_id } = batchResult.rows[0];
        
        phase = 'update_batch_processing';
        // Update batch status
        await query(
          `UPDATE batches
           SET status = $1,
               error_message = NULL,
               error_code = NULL,
               error_context = NULL,
               last_error_at = NULL,
               updated_at = NOW()
           WHERE batch_id = $2`,
          ['PROCESSING', batchId]
        );
        
        phase = 'download_payload';
        // Stream payload from storage
        const stream = await getObject(payload_uri);
        let buffer = '';
        
        stream.on('data', (chunk) => {
          buffer += chunk.toString();
        });
        
        await new Promise((resolve, reject) => {
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        
        phase = 'parse_payload';
        const products = JSON.parse(buffer);
        logger.info({ batchId, totalProducts: products.length }, 'Payload loaded');
        
        phase = 'generate_chunks';
        // Generate chunks
        for (let i = 0; i < products.length; i += CHUNK_SIZE) {
          const chunkProducts = products.slice(i, i + CHUNK_SIZE);
          const chunkIndex = Math.floor(i / CHUNK_SIZE);
          
          phase = 'upload_chunk';
          // Upload chunk to storage
          const chunkKey = `chunks/${cnpj}/${batchId}/${chunkIndex}.json`;
          const chunkBuffer = Buffer.from(JSON.stringify(chunkProducts));
          await uploadObject(chunkKey, chunkBuffer);
          
          phase = 'insert_chunk_metadata';
          // Store chunk metadata in database
          const chunkResult = await query(
            `INSERT INTO batch_chunks (batch_id, chunk_uri, chunk_index, items_count, status)
             VALUES ($1, $2, $3, $4, 'PENDING')
             ON CONFLICT (batch_id, chunk_index) DO UPDATE SET chunk_uri = EXCLUDED.chunk_uri
             RETURNING chunk_id`,
            [batchId, chunkKey, chunkIndex, chunkProducts.length]
          );
          
          const chunkId = chunkResult.rows[0].chunk_id;
          
          phase = 'publish_chunk_ready';
          // Publish chunk ready event
          await publishChunkReady({
            chunkId,
            batchId,
            pharmacyId: pharmacy_id,
            cnpj,
            loadType,
            chunkUri: chunkKey,
            itemsCount: chunkProducts.length,
            chunkIndex,
            totalChunks: Math.ceil(products.length / CHUNK_SIZE)
          });
          
          logger.info({
            batchId,
            chunkId,
            chunkIndex,
            itemsCount: chunkProducts.length
          }, 'Chunk published');
        }
        
        logger.info({ batchId, chunksCreated: Math.ceil(products.length / CHUNK_SIZE) }, 'Chunking completed');
        
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        const errorCode = getErrorCode(error);
        const errorContext = {
          batchId,
          cnpj,
          loadType,
          retryAttempt,
          phase,
          chunkSize: CHUNK_SIZE,
          detail: error?.detail || null,
          schema: error?.schema || null,
          table: error?.table || null,
          column: error?.column || null,
          constraint: error?.constraint || null,
          where: error?.where || null,
          stack: error?.stack ? String(error.stack).slice(0, 4000) : null,
        };

        logger.error({
          error: errorMessage,
          errorCode,
          errorContext,
          stack: error.stack,
          batchId,
          cnpj,
          phase,
          retryAttempt
        }, 'Chunker error');

        const attempts = Number(retryAttempt) + 1;
        const shouldRetry = attempts < MAX_BATCH_RETRIES;

        if (shouldRetry) {
          await query(
            `UPDATE batches
             SET status = $1,
                 error_message = $2,
                 error_code = $3,
                 error_context = $4::jsonb,
                 last_error_at = NOW(),
                 updated_at = NOW()
             WHERE batch_id = $5`,
            ['RECEIVED', errorMessage, errorCode, JSON.stringify({ ...errorContext, attempts, willRetry: true }), batchId]
          );

          await scheduleBatchRetry(event, attempts, errorMessage, errorCode, errorContext);

          logger.warn({
            event: 'chunker.retry_scheduled',
            batchId,
            cnpj,
            attempts,
            maxRetries: MAX_BATCH_RETRIES,
            phase
          }, 'Batch retry scheduled');

          return;
        }
        
        await query(
          `UPDATE batches
           SET status = $1,
               error_message = $2,
               error_code = $3,
               error_context = $4::jsonb,
               last_error_at = NOW(),
               updated_at = NOW()
           WHERE batch_id = $5`,
          ['FAILED', errorMessage, errorCode, JSON.stringify({ ...errorContext, attempts, willRetry: false }), batchId]
        );
      }
    }
  });
  
  return consumer;
}

// Standalone mode (for Kubernetes pods)
if (import.meta.url === `file://${process.argv[1]}`) {
  startChunkerWorker().catch(console.error);
}
