import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PharmaciesModule } from '../pharmacies/pharmacies.module';

@Module({
  imports: [PrismaModule, PharmaciesModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
