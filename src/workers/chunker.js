import { createConsumer } from '../kafka/consumer.js';
import { publishBatchReceived } from '../kafka/producer.js';
import { getObject, uploadObject } from '../storage/client.js';
import { query } from '../db/pool.js';
import logger from '../utils/logger.js';

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '1000');
const TOPIC_CHUNKS_READY = process.env.KAFKA_TOPIC_CHUNKS_READY || 'chunks.ready';

export async function startChunkerWorker() {
  const consumer = await createConsumer('chunker-workers', ['batches.received']);
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const event = JSON.parse(message.value.toString());
      const { batchId, cnpj, loadType } = event;
      
      logger.info({ event: 'chunker.start', batchId, cnpj }, 'Processing batch');
      
      try {
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
        
        // Update batch status
        await query(
          'UPDATE batches SET status = $1, updated_at = NOW() WHERE batch_id = $2',
          ['PROCESSING', batchId]
        );
        
        // Stream payload from storage
        const stream = await getObject(payload_uri);
        const chunks = [];
        let buffer = '';
        
        stream.on('data', (chunk) => {
          buffer += chunk.toString();
        });
        
        await new Promise((resolve, reject) => {
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        
        const products = JSON.parse(buffer);
        logger.info({ batchId, totalProducts: products.length }, 'Payload loaded');
        
        // Generate chunks
        for (let i = 0; i < products.length; i += CHUNK_SIZE) {
          const chunkProducts = products.slice(i, i + CHUNK_SIZE);
          const chunkIndex = Math.floor(i / CHUNK_SIZE);
          
          // Upload chunk to storage
          const chunkKey = `chunks/${cnpj}/${batchId}/${chunkIndex}.json`;
          const chunkBuffer = Buffer.from(JSON.stringify(chunkProducts));
          await uploadObject(chunkKey, chunkBuffer);
          
          // Store chunk metadata in database
          const chunkResult = await query(
            `INSERT INTO batch_chunks (batch_id, chunk_uri, chunk_index, items_count, status)
             VALUES ($1, $2, $3, $4, 'PENDING')
             RETURNING chunk_id`,
            [batchId, chunkKey, chunkIndex, chunkProducts.length]
          );
          
          const chunkId = chunkResult.rows[0].chunk_id;
          
          // Publish chunk ready event
          const { Kafka } = await import('kafkajs');
          const kafka = new Kafka({
            clientId: 'chunker-worker',
            brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
          });
          const producer = kafka.producer();
          await producer.connect();
          
          await producer.send({
            topic: TOPIC_CHUNKS_READY,
            messages: [{
              key: cnpj,
              value: JSON.stringify({
                chunkId,
                batchId,
                pharmacyId: pharmacy_id,
                cnpj,
                loadType,
                chunkUri: chunkKey,
                itemsCount: chunkProducts.length,
                chunkIndex,
                totalChunks: Math.ceil(products.length / CHUNK_SIZE)
              })
            }]
          });
          
          await producer.disconnect();
          
          logger.info({
            batchId,
            chunkId,
            chunkIndex,
            itemsCount: chunkProducts.length
          }, 'Chunk published');
        }
        
        logger.info({ batchId, chunksCreated: Math.ceil(products.length / CHUNK_SIZE) }, 'Chunking completed');
        
      } catch (error) {
        logger.error({ error: error.message, stack: error.stack, batchId }, 'Chunker error');
        
        await query(
          'UPDATE batches SET status = $1, updated_at = NOW() WHERE batch_id = $2',
          ['FAILED', batchId]
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
