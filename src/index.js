import Fastify from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { ingestProducts } from './api/ingest.js';
import { getProductsHandler } from './api/products.js';
import { connectProducer, disconnectProducer } from './kafka/producer.js';
import { ensureBucket } from './storage/client.js';
import logger from './utils/logger.js';

dotenv.config();

const fastify = Fastify({
  logger: logger,
  bodyLimit: parseInt(process.env.MAX_PAYLOAD_SIZE || '209715200'), // 200MB
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false,
  requestTimeout: 120000, // 120 seconds
  keepAliveTimeout: 130000,
});

// Plugins
await fastify.register(compress, { global: true });
await fastify.register(cors, {
  origin: true,
  credentials: true
});

// Routes
fastify.post('/v1/inovafarma/products', {
  config: {
    rawBody: true
  },
  bodyLimit: 209715200, // 200MB per route
}, ingestProducts);

fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Rota de produtos para Chatwoot
fastify.get('/v1/products', getProductsHandler);

// Startup
async function start() {
  try {
    // Initialize dependencies
    await ensureBucket();
    await connectProducer();
    
    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    console.log(`🚀 Server listening on http://${host}:${port}`);
    console.log(`📊 Health check: http://${host}:${port}/health`);
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`${signal} received, shutting down gracefully...`);
  
  try {
    await disconnectProducer();
    await fastify.close();
    console.log('Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
