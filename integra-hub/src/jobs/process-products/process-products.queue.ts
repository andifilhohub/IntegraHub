import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ProcessProductsJobPayload } from '../../modules/inovafarma/dto/process-products-job.dto';
import { PROCESS_PRODUCTS_QUEUE_NAME } from './process-products.constants';

@Injectable()
export class ProcessProductsQueue implements OnModuleDestroy {
  private queue: Queue;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL não configurado');
    }
    const redisOptions = {
      maxRetriesPerRequest: null,
    };

    this.queue = new Queue(PROCESS_PRODUCTS_QUEUE_NAME, {
      connection: new IORedis(redisUrl, redisOptions),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }

  add(payload: ProcessProductsJobPayload) {
    return this.queue.add('products', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
