import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export function logBatchReceived(batchId, cnpj, loadType, size) {
  logger.info({
    event: 'batch.received',
    batchId,
    cnpj,
    loadType,
    payloadSize: size
  }, 'Batch received');
}

export function logBatchError(batchId, cnpj, error) {
  logger.error({
    event: 'batch.error',
    batchId,
    cnpj,
    error: error.message,
    stack: error.stack
  }, 'Batch processing error');
}

export default logger;
