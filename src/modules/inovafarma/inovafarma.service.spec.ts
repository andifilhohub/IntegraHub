import { BadRequestException } from '@nestjs/common';
import { InovafarmaService } from './inovafarma.service';
import { IngestProductDto } from './dto/ingest-product.dto';
import { InovafarmaFileBufferService } from './inovafarma-file-buffer.service';

const createProduct = (cnpj: string): IngestProductDto => ({
  productId: 1,
  title: 'Dipirona',
  rawJson: { foo: 'bar' },
  pharmacy: { cnpj, name: 'Farmácia de Teste' },
});

describe('InovafarmaService', () => {
  const bufferMock = {
    buffer: jest.fn(),
    triggerImmediateDrain: jest.fn(),
  } as unknown as InovafarmaFileBufferService;
  const service = new InovafarmaService(bufferMock);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enfileira um lote válido', async () => {
    bufferMock.buffer = jest.fn().mockResolvedValue('file-123');
    const result = await service.ingest([createProduct('123')]);
    expect(bufferMock.buffer).toHaveBeenCalledTimes(1);
    expect(bufferMock.triggerImmediateDrain).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('queued');
    expect(result.buffered).toBe(true);
    expect(result.fileId).toBe('file-123');
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
