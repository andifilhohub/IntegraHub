import { Worker } from 'worker_threads';
import os from 'os';
import { startChunkerWorker } from './chunker.js';
import { startUpsertWorker } from './upsert.js';
import logger from '../utils/logger.js';

const MAX_WORKERS = parseInt(process.env.MAX_UPSERT_WORKERS) || os.cpus().length;
const MIN_WORKERS = parseInt(process.env.MIN_UPSERT_WORKERS) || 2;
const SCALE_CHECK_INTERVAL = parseInt(process.env.SCALE_CHECK_INTERVAL) || 30000; // 30s

class WorkerOrchestrator {
  constructor() {
    this.upsertWorkers = [];
    this.chunkerWorker = null;
  }

  async start() {
    logger.info({ event: 'orchestrator.start' }, 'Starting worker orchestrator');
    
    // Start chunker worker (single instance)
    this.chunkerWorker = await startChunkerWorker();
    logger.info('✅ Chunker worker started');
    
    // Start initial upsert workers
    for (let i = 0; i < MIN_WORKERS; i++) {
      await this.addUpsertWorker();
    }
    
    // Start auto-scaling monitor (future: use Kafka lag metrics)
    this.startAutoScaling();
    
    logger.info({
      chunkerWorkers: 1,
      upsertWorkers: this.upsertWorkers.length,
      maxWorkers: MAX_WORKERS
    }, '✅ Worker orchestrator ready');
  }

  async addUpsertWorker() {
    if (this.upsertWorkers.length >= MAX_WORKERS) {
      logger.warn({ current: this.upsertWorkers.length, max: MAX_WORKERS }, 'Max workers reached');
      return null;
    }
    
    const workerId = this.upsertWorkers.length;
    
    try {
      const consumer = await startUpsertWorker(workerId);
      
      this.upsertWorkers.push({
        id: workerId,
        consumer,
        startedAt: new Date()
      });
      
      logger.info({ workerId, totalWorkers: this.upsertWorkers.length }, '✅ Upsert worker added');
      
      return workerId;
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to add worker');
      return null;
    }
  }

  async removeUpsertWorker() {
    if (this.upsertWorkers.length <= MIN_WORKERS) {
      logger.warn({ current: this.upsertWorkers.length, min: MIN_WORKERS }, 'Min workers reached');
      return false;
    }
    
    const worker = this.upsertWorkers.pop();
    
    try {
      await worker.consumer.disconnect();
      logger.info({ workerId: worker.id, totalWorkers: this.upsertWorkers.length }, 'Worker removed');
      return true;
    } catch (error) {
      logger.error({ error: error.message, workerId: worker.id }, 'Failed to remove worker');
      return false;
    }
  }

  startAutoScaling() {
    setInterval(async () => {
      try {
        // TODO: Implement Kafka lag detection
        // For now, maintain MIN_WORKERS
        // In production, use: const lag = await getKafkaTopicLag('chunks.ready', 'upsert-workers');
        
        const lag = 0; // Placeholder
        const currentWorkers = this.upsertWorkers.length;
        
        // Scale up if lag > threshold
        if (lag > 10000 && currentWorkers < MAX_WORKERS) {
          logger.info({ lag, currentWorkers }, 'Scaling up workers');
          await this.addUpsertWorker();
        }
        
        // Scale down if lag is low
        else if (lag < 1000 && currentWorkers > MIN_WORKERS) {
          logger.info({ lag, currentWorkers }, 'Scaling down workers');
          await this.removeUpsertWorker();
        }
        
      } catch (error) {
        logger.error({ error: error.message }, 'Auto-scaling check failed');
      }
    }, SCALE_CHECK_INTERVAL);
    
    logger.info({ interval: SCALE_CHECK_INTERVAL }, 'Auto-scaling monitor started');
  }

  async shutdown() {
    logger.info('Shutting down orchestrator...');
    
    // Disconnect chunker
    if (this.chunkerWorker) {
      await this.chunkerWorker.disconnect();
    }
    
    // Disconnect all upsert workers
    for (const worker of this.upsertWorkers) {
      await worker.consumer.disconnect();
    }
    
    logger.info('Orchestrator shutdown complete');
  }
}

// Singleton instance
const orchestrator = new WorkerOrchestrator();

export default orchestrator;

// Standalone mode
if (import.meta.url === `file://${process.argv[1]}`) {
  orchestrator.start().catch(console.error);
  
  process.on('SIGTERM', async () => {
    await orchestrator.shutdown();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    await orchestrator.shutdown();
    process.exit(0);
  });
}
