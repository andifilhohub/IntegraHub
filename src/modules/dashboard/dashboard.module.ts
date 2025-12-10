import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { InovafarmaFileBufferService } from '../inovafarma/inovafarma-file-buffer.service';
import { ProcessProductsQueue } from '../../jobs/process-products/process-products.queue';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [DashboardService, InovafarmaFileBufferService, ProcessProductsQueue],
})
export class DashboardModule {}
