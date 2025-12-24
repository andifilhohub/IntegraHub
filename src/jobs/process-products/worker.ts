import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';

import { PROCESS_PRODUCTS_QUEUE_NAME } from './process-products.constants';
import { ProcessProductsJobPayload } from '../../modules/inovafarma/dto/process-products-job.dto';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { worker: PROCESS_PRODUCTS_QUEUE_NAME },
});

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const redisOptions = {
  maxRetriesPerRequest: null,
};
const connection = new IORedis(redisUrl, redisOptions);
const prisma = new PrismaClient();

const worker = new Worker<ProcessProductsJobPayload>(
  PROCESS_PRODUCTS_QUEUE_NAME,
  async (job) => {
    logger.info({ jobId: job.id, receivedAt: job.data.receivedAt }, 'Iniciando processamento de lote');
    const { pharmacy, products } = job.data;

    const pharmacyJson = (pharmacy as unknown) as Prisma.InputJsonValue;
    const pharmacyRecord = await prisma.pharmacy.upsert({
      where: { cnpj: pharmacy.cnpj },
      update: {
        name: pharmacy.name,
        state: pharmacy.state,
        city: pharmacy.city,
        rawJson: pharmacyJson,
      },
      create: {
        cnpj: pharmacy.cnpj,
        name: pharmacy.name,
        state: pharmacy.state,
        city: pharmacy.city,
        rawJson: pharmacyJson,
      },
    });

    for (const product of products) {
      const rawJson = (product.rawJson ?? {}) as Prisma.InputJsonValue;
      const createData = {
        pharmacyId: pharmacyRecord.id,
        productId: product.productId,
        title: product.title,
        description: product.description,
        ean: product.ean,
        price: product.price,
        stock: product.stock,
        shopId: product.shopId,
        pricePromo: product.pricePromo,
        wholesalePrice: product.wholesalePrice,
        wholesaleMin: product.wholesaleMin,
        measure: product.measure,
        size: product.size,
        color: product.color,
        productCreatedAt: parseDate(product.productCreatedAt),
        productUpdatedAt: parseDate(product.productUpdatedAt),
        stockUpdatedAt: parseDate(product.stockUpdatedAt),
        brand: product.brand,
        ncm: product.ncm,
        category: product.category,
        imageLink: product.imageLink,
        rawJson,
      };

      const updateData = {
        title: product.title,
        description: product.description,
        ean: product.ean,
        price: product.price,
        stock: product.stock,
        shopId: product.shopId,
        pricePromo: product.pricePromo,
        wholesalePrice: product.wholesalePrice,
        wholesaleMin: product.wholesaleMin,
        measure: product.measure,
        size: product.size,
        color: product.color,
        productCreatedAt: parseDate(product.productCreatedAt),
        productUpdatedAt: parseDate(product.productUpdatedAt),
        stockUpdatedAt: parseDate(product.stockUpdatedAt),
        brand: product.brand,
        ncm: product.ncm,
        category: product.category,
        imageLink: product.imageLink,
        rawJson,
      };

      await prisma.product.upsert({
        where: {
          pharmacy_product_unique: {
            pharmacyId: pharmacyRecord.id,
            productId: product.productId,
          },
        },
        create: createData,
        update: updateData,
      });
    }

    logger.info({ count: products.length, pharmacy: pharmacy.cnpj }, 'Lote processado');
  },
  {
    connection,
    concurrency: 5,
  },
);

worker.on('error', (error) => {
  logger.error({ error }, 'Erro no worker de produtos');
});

worker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, error }, 'Job falhou');
});

process.on('SIGINT', async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});
