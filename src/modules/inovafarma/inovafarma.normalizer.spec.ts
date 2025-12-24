import { BadRequestException } from '@nestjs/common';
import { normalizeInovafarmaPayload } from './inovafarma.normalizer';

const sample = [
  {
    CNPJ: '02433981000196',
    INDICE: 2,
    PRODUCTID: 201,
    EAN: '7896090611126',
    TITLE: 'SAL DE ANDREWS 1ENV 5G',
    DESCRIPTION: 'SAL DE ANDREWS 1ENV 5G',
    SHOPID: 1,
    PRICE: 74.08,
    PRICEPROMO: 0,
    WHOLESALEPRICE: 0,
    WHOLESALEMIN: 0,
    QUANTITY: 10,
    CATEGORY: '',
    MEASURE: 0,
    NCM: '30049099',
    BRAND: 'GLAXOSMITHKLINE',
    IMAGELINK: '',
    SIZE: '',
    COLOR: '',
    DATACADASTROPRODUTO: '2014-08-14T00:00:00',
    DATAATUALIZACAOPRODUTO: '2024-10-18T08:56:19.437',
    DATAATUALIZACAOESTOQUE: '2024-10-18T08:56:19.437',
  },
];

describe('normalizeInovafarmaPayload', () => {
  it('normaliza payload legado em maiúsculas para DTO interno', () => {
    const [result] = normalizeInovafarmaPayload(sample);
    expect(result.productId).toBe(201);
    expect(result.title).toBe('SAL DE ANDREWS 1ENV 5G');
    expect(result.price).toBe(74.08);
    expect(result.pricePromo).toBe(0);
    expect(result.wholesalePrice).toBe(0);
    expect(result.wholesaleMin).toBe(0);
    expect(result.shopId).toBe(1);
    expect(result.measure).toBe(0);
    expect(result.stock).toBe(10);
    expect(result.brand).toBe('GLAXOSMITHKLINE');
    expect(result.ncm).toBe('30049099');
    expect(result.size).toBe('');
    expect(result.color).toBe('');
    expect(result.productCreatedAt).toBe('2014-08-14T00:00:00');
    expect(result.productUpdatedAt).toBe('2024-10-18T08:56:19.437');
    expect(result.stockUpdatedAt).toBe('2024-10-18T08:56:19.437');
    expect(result.pharmacy.cnpj).toBe('02433981000196');
    expect(result.rawJson).toHaveProperty('CNPJ', '02433981000196');
  });

  it('falha para payload não array', () => {
    expect(() => normalizeInovafarmaPayload({})).toThrow(BadRequestException);
  });
});
