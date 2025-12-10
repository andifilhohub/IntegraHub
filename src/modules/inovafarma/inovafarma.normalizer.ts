import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { IngestProductDto } from './dto/ingest-product.dto';

type LegacyProduct = Record<string, unknown>;

const coerceString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  return String(value);
};

const coerceNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
};

export function normalizeInovafarmaPayload(rawBody: unknown): IngestProductDto[] {
  if (!Array.isArray(rawBody)) {
    throw new BadRequestException('Payload deve ser um array de produtos');
  }

  const normalized: IngestProductDto[] = rawBody.map((item) => {
    const raw = item as LegacyProduct;
    const cnpj = coerceString(raw.CNPJ ?? raw.cnpj);
    const title = coerceString(raw.TITLE ?? raw.title);
    const productId =
      coerceNumber(raw.PRODUCTID ?? raw.productId) ??
      coerceNumber(raw.INDICE ?? raw.indice);
    const price =
      coerceNumber(raw.PRICE ?? raw.price) ??
      coerceNumber(raw.PRICEPROMO ?? raw.pricePromo);
    const stock = coerceNumber(raw.QUANTITY ?? raw.quantity);

    return {
      productId: productId ?? 0,
      title: title ?? '',
      description: coerceString(raw.DESCRIPTION ?? raw.description),
      ean: coerceString(raw.EAN ?? raw.ean),
      price,
      stock,
      brand: coerceString(raw.BRAND ?? raw.brand),
      ncm: coerceString(raw.NCM ?? raw.ncm),
      category: coerceString(raw.CATEGORY ?? raw.category),
      imageLink: coerceString(raw.IMAGELINK ?? raw.imageLink ?? raw.IMAGE ?? raw.image),
      rawJson: raw,
      pharmacy: {
        cnpj: cnpj ?? '',
        name: coerceString(raw.PHARMACY_NAME ?? raw.FARMACIA ?? raw.farmacia ?? cnpj) ?? '',
        state: coerceString(raw.STATE ?? raw.UF ?? raw.state),
        city: coerceString(raw.CITY ?? raw.city),
      },
    };
  });

  const instances = plainToInstance(IngestProductDto, normalized);
  const validationErrors = instances.flatMap((instance) =>
    validateSync(instance, { whitelist: true, forbidNonWhitelisted: true }),
  );
  if (validationErrors.length) {
    throw new BadRequestException(validationErrors);
  }
  return instances;
}
