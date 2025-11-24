import { Controller, Get, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductQueryDto } from '../../common/dto/product-query.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  find(@Query() query: ProductQueryDto) {
    return this.productsService.search(query);
  }
}
