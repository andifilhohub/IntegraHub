import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface PharmacyUpsertPayload {
  cnpj: string;
  name: string;
  state?: string;
  city?: string;
  rawJson?: Record<string, unknown>;
}

@Injectable()
export class PharmaciesService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertPharmacy(payload: PharmacyUpsertPayload) {
    const { cnpj, name, state, city, rawJson } = payload;
    const sanitizedRawJson = (rawJson ?? {}) as Prisma.JsonObject;

    return this.prisma.pharmacy.upsert({
      where: { cnpj },
      update: {
        name,
        state,
        city,
        rawJson: sanitizedRawJson,
        updatedAt: new Date(),
      },
      create: {
        cnpj,
        name,
        state,
        city,
        rawJson: sanitizedRawJson,
      },
    });
  }

  findByCnpj(cnpj: string) {
    return this.prisma.pharmacy.findUnique({ where: { cnpj } });
  }
}
