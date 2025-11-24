import { BadRequestException, Injectable } from '@nestjs/common';
import { ProcessProductsQueue } from '../../jobs/process-products/process-products.queue';
import { IngestProductDto } from './dto/ingest-product.dto';
import { LoadType, ProcessProductsJobPayload } from './dto/process-products-job.dto';

@Injectable()
export class InovafarmaService {
  constructor(private readonly queue: ProcessProductsQueue) {}

  async ingest(products: IngestProductDto[], loadType: LoadType = 'delta') {
    if (!products.length) {
      throw new BadRequestException('Nenhum produto foi enviado');
    }

    const cnpjs = new Set(products.map((product) => product.pharmacy.cnpj));
    if (cnpjs.size > 1) {
      throw new BadRequestException('Todos os produtos devem pertencer à mesma farmácia');
    }

    const firstPharmacy = products[0].pharmacy;
    const payload: ProcessProductsJobPayload = {
      pharmacy: firstPharmacy,
      products: products.map(({ pharmacy, ...rest }) => rest),
      receivedAt: new Date().toISOString(),
      loadType,
    };

    await this.queue.add(payload);
    return { status: 'queued', count: products.length };
  }
}
