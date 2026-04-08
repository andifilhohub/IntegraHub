import { createConsumer } from '../kafka/consumer.js';
import { getObject } from '../storage/client.js';
import { query } from '../db/pool.js';
import logger from '../utils/logger.js';

const TOPIC_SALES_RECEIVED = process.env.KAFKA_TOPIC_SALES_RECEIVED || 'sales.received';

export async function startSalesWorker() {
  const consumer = await createConsumer('sales-workers', [TOPIC_SALES_RECEIVED]);

  await consumer.run({
    eachMessage: async ({ message }) => {
      let saleId;

      try {
        const event = JSON.parse(message.value.toString());
        saleId = event.saleId;

        if (!saleId) {
          logger.error({ event }, 'Sale event missing saleId');
          return;
        }

        const saleResult = await query(
          'SELECT payload_uri FROM sales WHERE sale_id = $1',
          [saleId]
        );

        if (saleResult.rows.length === 0) {
          logger.error({ saleId }, 'Sale not found');
          return;
        }

        const payloadUri = saleResult.rows[0].payload_uri || event.payloadUri;
        if (!payloadUri) {
          logger.error({ saleId }, 'payload_uri not found for sale');
          return;
        }

        await query(
          'UPDATE sales SET status = $1, updated_at = NOW() WHERE sale_id = $2',
          ['PROCESSING', saleId]
        );

        const stream = await getObject(payloadUri);
        let buffer = '';

        stream.on('data', (chunk) => {
          buffer += chunk.toString();
        });

        await new Promise((resolve, reject) => {
          stream.on('end', resolve);
          stream.on('error', reject);
        });

        const payload = JSON.parse(buffer);

        await query(
          'UPDATE sales SET status = $1, raw_json = $2::jsonb, updated_at = NOW() WHERE sale_id = $3',
          ['PENDING', JSON.stringify(payload), saleId]
        );

        logger.info({ saleId }, 'Sale processed');
      } catch (error) {
        logger.error({ error: error.message, stack: error.stack, saleId }, 'Sales worker error');

        if (saleId) {
          await query(
            'UPDATE sales SET status = $1, updated_at = NOW() WHERE sale_id = $2',
            ['FAILED', saleId]
          );
        }
      }
    }
  });

  return consumer;
}

// Standalone mode
if (import.meta.url === `file://${process.argv[1]}`) {
  startSalesWorker().catch(console.error);
}
