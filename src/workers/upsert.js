import { createConsumer } from '../kafka/consumer.js';
import { bulkUpsertProducts, markInactiveProducts } from '../db/bulk-operations.js';
import { query } from '../db/pool.js';
import { getObject } from '../storage/client.js';
import logger from '../utils/logger.js';

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
       SET status = 'PROCESSING', updated_at = NOW() 
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
       SET status = 'COMPLETED', processed_at = NOW(), updated_at = NOW() 
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
        const inactivated = await markInactiveProducts(pharmacyId, batchId);
        logger.info({ batchId, inactivated }, 'Marked inactive products');
      }
      
      await query(
        `UPDATE batches 
         SET status = 'COMPLETED', updated_at = NOW() 
         WHERE batch_id = $1`,
        [batchId]
      );
      
      logger.info({ event: 'batch.complete', batchId }, 'Batch completed');
    }
    
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
      chunkId,
      batchId
    }, 'Upsert error');
    
    // Update chunk status
    await query(
      `UPDATE batch_chunks 
       SET status = 'FAILED', attempts = attempts + 1, updated_at = NOW() 
       WHERE chunk_id = $1`,
      [chunkId]
    );
    
    // Update batch
    await query(
      `UPDATE batches 
       SET items_failed = items_failed + $1, status = 'PARTIAL_FAIL', updated_at = NOW() 
       WHERE batch_id = $2`,
      [itemsCount, batchId]
    );
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
