import { BadRequestException } from '@nestjs/common';
import { InovafarmaService } from './inovafarma.service';
import { ProcessProductsQueue } from '../../jobs/process-products/process-products.queue';
import { IngestProductDto } from './dto/ingest-product.dto';

const createProduct = (cnpj: string): IngestProductDto => ({
  productId: 1,
  title: 'Dipirona',
  rawJson: { foo: 'bar' },
  pharmacy: { cnpj, name: 'Farmácia de Teste' },
});

describe('InovafarmaService', () => {
  const queueMock = { add: jest.fn() } as unknown as ProcessProductsQueue;
  const service = new InovafarmaService(queueMock);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enfileira um lote válido', async () => {
    const result = await service.ingest([createProduct('123')]);
    expect(queueMock.add).toHaveBeenCalledTimes(1);
    expect(queueMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ loadType: 'delta' }),
    );
    expect(result.status).toBe('queued');
    expect(result.count).toBe(1);
  });

  it('falha quando produtos pertencem a farmácias diferentes', async () => {
    await expect(
      service.ingest([createProduct('123'), createProduct('456')]),
    ).rejects.toThrow(BadRequestException);
  });

  it('falha com lista vazia', async () => {
    await expect(service.ingest([])).rejects.toThrow(BadRequestException);
  });
});
