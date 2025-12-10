import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { promises as fs } from 'fs';
import * as path from 'path';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private readonly bufferDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const configuredDir =
      this.configService.get<string>('INOVAFARMA_BUFFER_DIR') ?? path.join('.data', 'inovafarma-buffer');
    this.bufferDir = path.isAbsolute(configuredDir) ? configuredDir : path.join(process.cwd(), configuredDir);
  }

  async authenticate(secret: string): Promise<boolean> {
    const expectedSecret = this.configService.get<string>('INOVA_SECRET');
    return secret === expectedSecret;
  }

  async getBufferFiles() {
    try {
      const files = await fs.readdir(this.bufferDir);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));
      
      const fileDetails = await Promise.all(
        jsonFiles.map(async (file) => {
          const filePath = path.join(this.bufferDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            const stats = await fs.stat(filePath);
            return {
              fileName: file,
              createdAt: stats.birthtime,
              size: stats.size,
              productsCount: data.products?.length || 0,
              loadType: data.loadType,
              data,
            };
          } catch (error) {
            this.logger.error(`Error reading file ${file}:`, error);
            return null;
          }
        }),
      );

      return fileDetails.filter((file) => file !== null);
    } catch (error) {
      this.logger.error('Error reading buffer directory:', error);
      return [];
    }
  }

  async getProcessedProducts(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        take: limit,
        skip,
        orderBy: { updatedAt: 'desc' },
        include: {
          pharmacy: {
            select: {
              cnpj: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.product.count(),
    ]);

    return {
      items: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStats() {
    const [totalProducts, totalPharmacies, activeProducts] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.pharmacy.count(),
      this.prisma.product.count({ where: { isActive: true } }),
    ]);

    return {
      totalProducts,
      totalPharmacies,
      activeProducts,
      inactiveProducts: totalProducts - activeProducts,
    };
  }
}
