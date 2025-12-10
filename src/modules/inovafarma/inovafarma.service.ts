import { BadRequestException, Injectable } from '@nestjs/common';
import { IngestProductDto } from './dto/ingest-product.dto';
import { LoadType, ProcessProductsJobPayload } from './dto/process-products-job.dto';
import { InovafarmaFileBufferService } from './inovafarma-file-buffer.service';

@Injectable()
export class InovafarmaService {
  constructor(private readonly fileBuffer: InovafarmaFileBufferService) {}

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

    const fileId = await this.fileBuffer.buffer(payload);
    this.fileBuffer.triggerImmediateDrain();
    return { status: 'queued', buffered: true, fileId, count: products.length };
  }
}
