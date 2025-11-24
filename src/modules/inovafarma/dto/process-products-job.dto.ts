import { IngestProductDto, PharmacyInfoDto } from './ingest-product.dto';

export type LoadType = 'full' | 'delta';

export interface ProcessProductEntry extends Omit<IngestProductDto, 'pharmacy'> {}

export interface ProcessProductsJobPayload {
  pharmacy: PharmacyInfoDto;
  products: ProcessProductEntry[];
  receivedAt: string;
  loadType?: LoadType;
}
