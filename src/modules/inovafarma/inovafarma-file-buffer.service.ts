import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ProcessProductsQueue } from '../../jobs/process-products/process-products.queue';
import { ProcessProductsJobPayload } from './dto/process-products-job.dto';

@Injectable()
export class InovafarmaFileBufferService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InovafarmaFileBufferService.name);
  private readonly pendingDir: string;
  private readonly failedDir: string;
  private readonly batchSize: number;
  private readonly intervalMs: number;
  private drainInterval?: NodeJS.Timeout;
  private draining = false;

  constructor(private readonly configService: ConfigService, private readonly queue: ProcessProductsQueue) {
    const configuredDir =
      this.configService.get<string>('INOVAFARMA_BUFFER_DIR') ?? path.join('.data', 'inovafarma-buffer');
    this.pendingDir = path.isAbsolute(configuredDir) ? configuredDir : path.join(process.cwd(), configuredDir);
    this.failedDir = path.join(this.pendingDir, 'failed');
    this.batchSize = this.configService.get<number>('INOVAFARMA_BUFFER_BATCH_SIZE') ?? 25;
    this.intervalMs = this.configService.get<number>('INOVAFARMA_BUFFER_INTERVAL_MS') ?? 1000;
  }

  async onModuleInit() {
    await fs.mkdir(this.pendingDir, { recursive: true });
    await fs.mkdir(this.failedDir, { recursive: true });

    this.logger.log(
      `Buffer de arquivo habilitado em ${this.pendingDir} (batch ${this.batchSize}, intervalo ${this.intervalMs}ms)`,
    );

    this.drainInterval = setInterval(() => {
      this.drain().catch((error) => this.logger.error({ error }, 'Falha ao drenar buffer de arquivos'));
    }, this.intervalMs);
  }

  async onModuleDestroy() {
    if (this.drainInterval) {
      clearInterval(this.drainInterval);
    }
  }

  async buffer(payload: ProcessProductsJobPayload) {
    const fileName = `${Date.now()}-${randomUUID()}.json`;
    const filePath = path.join(this.pendingDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(payload));
    return fileName;
  }

  triggerImmediateDrain() {
    void this.drain();
  }

  private async drain() {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      const files = (await fs.readdir(this.pendingDir)).filter((file) => file.endsWith('.json')).sort();
      const batch = files.slice(0, this.batchSize);
      if (!batch.length) {
        return;
      }

      for (const file of batch) {
        const filePath = path.join(this.pendingDir, file);
        let payload: ProcessProductsJobPayload | undefined;
        try {
          const raw = await fs.readFile(filePath, 'utf8');
          payload = JSON.parse(raw) as ProcessProductsJobPayload;
        } catch (error) {
          this.logger.error({ error, file }, 'Arquivo do buffer corrompido; movendo para failed/');
          await this.moveToFailed(filePath, file);
          continue;
        }

        try {
          await this.queue.add(payload);
          await fs.rm(filePath);
        } catch (error) {
          this.logger.warn(
            { error, file },
            'Falha ao publicar job do buffer; arquivo mantido para nova tentativa',
          );
        }
      }
    } catch (error) {
      this.logger.error({ error }, 'Erro ao varrer buffer de arquivos');
    } finally {
      this.draining = false;
    }
  }

  private async moveToFailed(filePath: string, fileName: string) {
    try {
      await fs.rename(filePath, path.join(this.failedDir, fileName));
    } catch (renameError) {
      this.logger.error({ error: renameError, file: fileName }, 'Falha ao mover arquivo corrompido');
    }
  }
}
