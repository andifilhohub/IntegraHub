import { Injectable } from '@nestjs/common';
import { Prisma, Product } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PharmaciesService } from '../pharmacies/pharmacies.service';
import { ProductQueryDto } from '../../common/dto/product-query.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pharmaciesService: PharmaciesService,
  ) {}

  private readonly cache = new Map<
    string,
    { expiresAt: number; value: Product[]; meta: { page: number; limit: number } }
  >();
  private readonly cacheTtlMs = Number(process.env.PRODUCTS_CACHE_TTL_MS ?? 20_000);
  private readonly cacheMaxEntries = Number(process.env.PRODUCTS_CACHE_MAX_ENTRIES ?? 400);
  private readonly defaultLimit = 40;
  private readonly defaultPage = 1;

  async search(query: ProductQueryDto) {
    const pharmacy = await this.pharmaciesService.findByCnpj(query.cnpj);
    if (!pharmacy) {
      return [];
    }

    const where: Prisma.ProductWhereInput = {
      pharmacyId: pharmacy.id,
    };

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { brand: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? this.defaultPage;
    const limit = Math.min(query.limit ?? this.defaultLimit, 200);
    const skip = (page - 1) * limit;
    const cacheKey = this.buildCacheKey(query.cnpj, query.q, page, limit);
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return {
        items: cached.value,
        pagination: {
          page,
          limit,
          count: cached.value.length,
        },
      };
    }

    const items = await this.prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip,
    });

    this.storeCache(cacheKey, items, page, limit, now);

    return {
      items,
      pagination: {
        page,
        limit,
        count: items.length,
      },
    };
  }

  private buildCacheKey(cnpj: string, q: string | undefined, page: number, limit: number) {
    return `${cnpj}::${q ?? ''}::page=${page}::limit=${limit}`;
  }

  private storeCache(key: string, data: Product[], page: number, limit: number, timestamp: number) {
    if (this.cache.size >= this.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      expiresAt: timestamp + this.cacheTtlMs,
      value: data,
      meta: { page, limit },
    });
  }
}
