import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessProductsQueue } from './process-products.queue';

@Module({
  imports: [ConfigModule],
  providers: [ProcessProductsQueue],
  exports: [ProcessProductsQueue],
})
export class ProcessProductsModule {}
