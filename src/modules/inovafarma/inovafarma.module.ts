import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProcessProductsModule } from '../../jobs/process-products/process-products.module';
import { InovafarmaController } from './inovafarma.controller';
import { InovafarmaFileBufferService } from './inovafarma-file-buffer.service';
import { InovafarmaService } from './inovafarma.service';

@Module({
  imports: [AuthModule, ProcessProductsModule],
  controllers: [InovafarmaController],
  providers: [InovafarmaService, InovafarmaFileBufferService],
})
export class InovafarmaModule {}
