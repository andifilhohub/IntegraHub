import { Body, Controller, Headers, ParseArrayPipe, Post, UseGuards } from '@nestjs/common';
import { HmacGuard } from '../auth/hmac.guard';
import { IngestProductDto } from './dto/ingest-product.dto';
import { InovafarmaService } from './inovafarma.service';
import { LoadType } from './dto/process-products-job.dto';

@Controller('inovafarma')
export class InovafarmaController {
  constructor(private readonly inovafarmaService: InovafarmaService) {}

  @Post('products')
  @UseGuards(HmacGuard)
  async emitProducts(
    @Body(new ParseArrayPipe({ items: IngestProductDto })) products: IngestProductDto[],
    @Headers('x-inova-load-type') rawLoadType?: string | string[],
  ) {
    const headerValue =
      typeof rawLoadType === 'string'
        ? rawLoadType
        : Array.isArray(rawLoadType)
        ? rawLoadType[0]
        : undefined;
    const normalizedLoadType = headerValue?.toLowerCase();
    const loadType: LoadType = normalizedLoadType === 'full' ? 'full' : 'delta';
    return this.inovafarmaService.ingest(products, loadType);
  }
}
