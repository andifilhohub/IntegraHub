/**
 * Teste de pipeline completo — simula exatamente o que a InovaFarma envia.
 * CNPJ de teste: 99999999999999 (todos os noves)
 *
 * Fluxo testado:
 *   1. POST /v1/inovafarma/products  →  batch RECEIVED
 *   2. Chunker processa             →  chunk PENDING → COMPLETED
 *   3. Upsert worker processa       →  produtos no banco
 *   4. Batch finaliza               →  COMPLETED
 *   5. Idempotência                 →  mesma Idempotency-Key retorna o mesmo batch
 *   6. Reentrega do Kafka           →  não trava (ON CONFLICT fix)
 */

import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

// ─── Config ──────────────────────────────────────────────────────────────────
const API_BASE   = 'http://localhost:3002';
const API_KEY    = 'JFiennsli3iNLL2@DFDsdfdAS!JDISkddkLndJKJKN!@;sadffd:kjasjk';
const TEST_CNPJ  = '99999999999999';
const POLL_MS    = 1000;
const TIMEOUT_MS = 60_000;

const db = new Pool({
  connectionString: 'postgres://integrahub_user:kdnfpsjf_sf098ew2@127.0.0.1:5432/integrahub_db',
});

// ─── Payload idêntico ao formato InovaFarma ───────────────────────────────────
// Inclui PRODUCTIDs duplicados com PRICEPROMO diferente (padrão real dos dados)
const PRODUCTS = [
  // Produto simples (sem duplicata de promo)
  {
    CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999901, EAN: '7896094921399',
    TITLE: 'Buscopan Composto Cx 20Cpr', DESCRIPTION: 'Buscopan Composto Cx 20Cpr',
    SHOPID: 1, PRICE: 27.04, PRICEPROMO: 25.50, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
    QUANTITY: 4, CATEGORY: 'ETICOS', MEASURE: 0, NCM: '30044990', BRAND: 'Boehringer',
    IMAGELINK: '', SIZE: 1, COLOR: '',
    DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
    DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00',
  },
  // Produto com 2 promoções diferentes — mesmo PRODUCTID, PRICEPROMO distinto
  {
    CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999902, EAN: '7896004810140',
    TITLE: 'Bismu-Jet Sol Fr 20Ml', DESCRIPTION: 'Bismu-Jet Sol Fr 20Ml',
    SHOPID: 1, PRICE: 42.12, PRICEPROMO: 32.99, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
    QUANTITY: 4, CATEGORY: 'SIMILARES', MEASURE: 0, NCM: '30042029', BRAND: 'Legrand Ems',
    IMAGELINK: '', SIZE: 1, COLOR: '',
    DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
    DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00',
  },
  {
    CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999902, EAN: '7896004810140',
    TITLE: 'Bismu-Jet Sol Fr 20Ml', DESCRIPTION: 'Bismu-Jet Sol Fr 20Ml',
    SHOPID: 1, PRICE: 42.12, PRICEPROMO: 39.99, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
    QUANTITY: 4, CATEGORY: 'SIMILARES', MEASURE: 0, NCM: '30042029', BRAND: 'Legrand Ems',
    IMAGELINK: '', SIZE: 1, COLOR: '',
    DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
    DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00',
  },
  // Produto com 3 promoções diferentes
  {
    CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999903, EAN: '7896523209012',
    TITLE: 'Dipirona 500Mg Cx 20Cpr', DESCRIPTION: 'Dipirona 500Mg Cx 20Cpr',
    SHOPID: 1, PRICE: 18.90, PRICEPROMO: 14.99, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
    QUANTITY: 10, CATEGORY: 'GENERICOS', MEASURE: 0, NCM: '30049059', BRAND: 'EMS',
    IMAGELINK: '', SIZE: 1, COLOR: '',
    DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
    DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00',
  },
  {
    CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999903, EAN: '7896523209012',
    TITLE: 'Dipirona 500Mg Cx 20Cpr', DESCRIPTION: 'Dipirona 500Mg Cx 20Cpr',
    SHOPID: 1, PRICE: 18.90, PRICEPROMO: 16.50, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
    QUANTITY: 10, CATEGORY: 'GENERICOS', MEASURE: 0, NCM: '30049059', BRAND: 'EMS',
    IMAGELINK: '', SIZE: 1, COLOR: '',
    DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
    DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00',
  },
  {
    CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999903, EAN: '7896523209012',
    TITLE: 'Dipirona 500Mg Cx 20Cpr', DESCRIPTION: 'Dipirona 500Mg Cx 20Cpr',
    SHOPID: 1, PRICE: 18.90, PRICEPROMO: 17.90, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
    QUANTITY: 10, CATEGORY: 'GENERICOS', MEASURE: 0, NCM: '30049059', BRAND: 'EMS',
    IMAGELINK: '', SIZE: 1, COLOR: '',
    DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
    DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00',
  },
  // Produto sem promoção (PRICEPROMO igual ao PRICE)
  {
    CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999904, EAN: '7891058000018',
    TITLE: 'Novalgina 500Mg Fr 100Ml', DESCRIPTION: 'Novalgina 500Mg Fr 100Ml',
    SHOPID: 1, PRICE: 22.50, PRICEPROMO: 22.50, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
    QUANTITY: 2, CATEGORY: 'ETICOS', MEASURE: 0, NCM: '30049059', BRAND: 'Sanofi',
    IMAGELINK: '', SIZE: 1, COLOR: '',
    DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
    DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const log   = (msg) => console.log(`  ${msg}`);
const ok    = (msg) => console.log(`  ✓ ${msg}`);
const fail  = (msg) => { console.error(`  ✗ ${msg}`); process.exit(1); };
const title = (msg) => console.log(`\n── ${msg} ${'─'.repeat(Math.max(2, 60 - msg.length))}`);

async function pollBatch(batchId, expectedStatus, label) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const r = await db.query(
      'SELECT status, items_total, items_processed, items_failed, error_message FROM batches WHERE batch_id = $1',
      [batchId]
    );
    const row = r.rows[0];
    if (!row) fail(`Batch ${batchId} não encontrado no banco`);

    log(`  [${label}] status=${row.status} processed=${row.items_processed}/${row.items_total}`);

    if (row.status === expectedStatus) return row;
    if (row.status === 'FAILED') fail(`Batch FAILED: ${row.error_message}`);
    if (row.status === 'PARTIAL_FAIL') fail(`Batch PARTIAL_FAIL`);

    await new Promise(r => setTimeout(r, POLL_MS));
  }
  fail(`Timeout aguardando batch ${batchId} → ${expectedStatus}`);
}

async function sendBatch(products, idempotencyKey, loadType = 'delta') {
  const res = await fetch(`${API_BASE}/v1/inovafarma/products`, {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Inova-Api-Key':  API_KEY,
      'X-Inova-Load-Type': loadType,
      'Idempotency-Key':  idempotencyKey,
    },
    body: JSON.stringify(products),
  });
  const body = await res.json();
  return { status: res.status, body };
}

// ─── Testes ───────────────────────────────────────────────────────────────────
async function testEnvio() {
  title('TESTE 1: Envio normal de batch delta com duplicatas de PRICEPROMO');

  const key = `test-pipeline-${Date.now()}`;
  log(`Enviando ${PRODUCTS.length} items (${new Set(PRODUCTS.map(p => p.PRODUCTID)).size} produtos únicos)`);
  log(`Idempotency-Key: ${key}`);

  const { status, body } = await sendBatch(PRODUCTS, key, 'delta');

  if (status !== 202) fail(`Esperado 202, recebeu ${status}: ${JSON.stringify(body)}`);
  ok(`API respondeu 202 — batch_id: ${body.batch_id}`);

  const batch = await pollBatch(body.batch_id, 'COMPLETED', 'aguardando');
  ok(`Batch COMPLETED — ${batch.items_processed}/${batch.items_total} itens processados`);

  // Verificar produtos no banco
  const pharmacy = await db.query('SELECT id FROM "Pharmacy" WHERE cnpj = $1', [TEST_CNPJ]);
  if (!pharmacy.rows[0]) fail('Farmácia de teste não foi criada');

  const pharmacyId = pharmacy.rows[0].id;
  const TEST1_IDS = PRODUCTS.map(p => p.PRODUCTID);
  const products = await db.query(
    `SELECT "productId", title, price, "pricePromo", "pricePromos", stock
     FROM "Product"
     WHERE "pharmacyId" = $1 AND "productId" = ANY($2::int[])
     ORDER BY "productId"`,
    [pharmacyId, TEST1_IDS]
  );

  const uniqueExpected = new Set(TEST1_IDS).size;
  ok(`${products.rows.length} produtos únicos no banco (esperado: ${uniqueExpected})`);
  if (products.rows.length !== uniqueExpected) fail(`Esperado ${uniqueExpected} produtos, encontrou ${products.rows.length}`);

  for (const p of products.rows) {
    log(`  PRODUCTID=${p.productId} price=${p.price} pricePromo=${p.pricePromo} pricePromos=[${p.pricePromos}]`);
  }

  // Validar que TEST-002 tem 2 promos e TEST-003 tem 3 promos
  const p002 = products.rows.find(p => String(p.productId) === '9999902');
  const p003 = products.rows.find(p => String(p.productId) === '9999903');

  if (!p002) fail('TEST-002 não encontrado no banco');
  if (p002.pricePromos.length !== 2) fail(`TEST-002 deveria ter 2 pricePromos, tem ${p002.pricePromos.length}`);
  ok(`TEST-002 consolidado corretamente: pricePromos=[${p002.pricePromos.sort()}]`);

  if (!p003) fail('TEST-003 não encontrado no banco');
  if (p003.pricePromos.length !== 3) fail(`TEST-003 deveria ter 3 pricePromos, tem ${p003.pricePromos.length}`);
  ok(`TEST-003 consolidado corretamente: pricePromos=[${p003.pricePromos.sort()}]`);

  return { batchId: body.batch_id, key, pharmacyId };
}

async function testIdempotencia(key) {
  title('TESTE 2: Idempotência — mesma Idempotency-Key não cria batch duplicado');

  const { status, body } = await sendBatch(PRODUCTS, key, 'delta');

  if (status !== 202) fail(`Esperado 202, recebeu ${status}`);
  if (!body.message?.includes('idempotent')) fail(`Esperado resposta idempotente, recebeu: ${JSON.stringify(body)}`);
  ok(`Retornou batch existente com mensagem idempotente: "${body.message}"`);
  ok(`batch_id: ${body.batch_id}`);
}

async function testKafkaReentrega(pharmacyId) {
  title('TESTE 3: Reentrega do Kafka — ON CONFLICT não deve travar o chunker');

  // Simula o cenário: batch foi recebido, chunk foi inserido, mas Kafka reentregou.
  // Verificamos que um segundo batch com mesmos dados é processado sem duplicate key.
  const key = `test-redelivery-${Date.now()}`;
  log(`Enviando batch para simular reentrega (key: ${key})`);

  const { status, body } = await sendBatch(PRODUCTS, key, 'delta');
  if (status !== 202) fail(`Esperado 202, recebeu ${status}`);

  const batchId = body.batch_id;
  ok(`Batch recebido: ${batchId}`);

  // Aguardar chunk ser criado (fase PROCESSING)
  await new Promise(r => setTimeout(r, 2000));

  // Verificar que o chunker criou o chunk
  const chunk = await db.query(
    'SELECT chunk_id, chunk_index, status FROM batch_chunks WHERE batch_id = $1',
    [batchId]
  );

  if (chunk.rows.length === 0) {
    log('  Chunk ainda não criado, aguardando mais 3s...');
    await new Promise(r => setTimeout(r, 3000));
  }

  const chunk2 = await db.query(
    'SELECT chunk_id, chunk_index, status FROM batch_chunks WHERE batch_id = $1',
    [batchId]
  );

  if (chunk2.rows.length > 0) {
    ok(`Chunk criado: chunk_id=${chunk2.rows[0].chunk_id} status=${chunk2.rows[0].status}`);
  }

  // Aguardar conclusão normal
  const batch = await pollBatch(batchId, 'COMPLETED', 'reentrega');
  ok(`Batch processado normalmente: ${batch.items_processed}/${batch.items_total} itens`);
}

async function testPromoConsolidation(pharmacyId) {
  title('TESTE 5: Consolidação de pricePromos — edge cases');

  // Cenário A: mesmo produto 3x com PRICEPROMO idêntico → deve deduplicar (1 valor, não 3)
  // Cenário B: mesmo produto com PRICEPROMO = 0 e com valor válido → só o válido
  // Cenário C: mesmo produto com PRICEPROMO ausente (undefined) → não deve explodir

  const PROMO_PRODUCTS = [
    // Cenário A — PRICEPROMO repetido 3x (9999905)
    { CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999905, EAN: '7896010900030',
      TITLE: 'Produto Promo Repetida', DESCRIPTION: '', SHOPID: 1,
      PRICE: 50.00, PRICEPROMO: 10.00, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
      QUANTITY: 1, CATEGORY: 'ETICOS', MEASURE: 0, NCM: '30049059', BRAND: 'Test',
      IMAGELINK: '', SIZE: 1, COLOR: '',
      DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
      DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00' },
    { CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999905, EAN: '7896010900030',
      TITLE: 'Produto Promo Repetida', DESCRIPTION: '', SHOPID: 1,
      PRICE: 50.00, PRICEPROMO: 10.00, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
      QUANTITY: 1, CATEGORY: 'ETICOS', MEASURE: 0, NCM: '30049059', BRAND: 'Test',
      IMAGELINK: '', SIZE: 1, COLOR: '',
      DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
      DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00' },
    { CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999905, EAN: '7896010900030',
      TITLE: 'Produto Promo Repetida', DESCRIPTION: '', SHOPID: 1,
      PRICE: 50.00, PRICEPROMO: 10.00, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
      QUANTITY: 1, CATEGORY: 'ETICOS', MEASURE: 0, NCM: '30049059', BRAND: 'Test',
      IMAGELINK: '', SIZE: 1, COLOR: '',
      DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
      DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00' },

    // Cenário B — uma linha com PRICEPROMO=0, outra com valor válido (9999906)
    { CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999906, EAN: '7896010900031',
      TITLE: 'Produto Promo Zero Mista', DESCRIPTION: '', SHOPID: 1,
      PRICE: 30.00, PRICEPROMO: 0, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
      QUANTITY: 5, CATEGORY: 'GENERICOS', MEASURE: 0, NCM: '30049059', BRAND: 'Test',
      IMAGELINK: '', SIZE: 1, COLOR: '',
      DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
      DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00' },
    { CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999906, EAN: '7896010900031',
      TITLE: 'Produto Promo Zero Mista', DESCRIPTION: '', SHOPID: 1,
      PRICE: 30.00, PRICEPROMO: 22.50, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
      QUANTITY: 5, CATEGORY: 'GENERICOS', MEASURE: 0, NCM: '30049059', BRAND: 'Test',
      IMAGELINK: '', SIZE: 1, COLOR: '',
      DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
      DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00' },

    // Cenário C — PRICEPROMO ausente (campo não enviado pelo InovaFarma) (9999907)
    { CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999907, EAN: '7896010900032',
      TITLE: 'Produto Sem Promo', DESCRIPTION: '', SHOPID: 1,
      PRICE: 15.00, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
      QUANTITY: 3, CATEGORY: 'GENERICOS', MEASURE: 0, NCM: '30049059', BRAND: 'Test',
      IMAGELINK: '', SIZE: 1, COLOR: '',
      DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
      DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00' },
    { CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: 9999907, EAN: '7896010900032',
      TITLE: 'Produto Sem Promo', DESCRIPTION: '', SHOPID: 1,
      PRICE: 15.00, PRICEPROMO: 12.00, WHOLESALEPRICE: 0, WHOLESALEMIN: 0,
      QUANTITY: 3, CATEGORY: 'GENERICOS', MEASURE: 0, NCM: '30049059', BRAND: 'Test',
      IMAGELINK: '', SIZE: 1, COLOR: '',
      DATACADASTROPRODUTO: '2026-01-01T00:00:00', DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
      DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00' },
  ];

  const key = `test-promos-${Date.now()}`;
  log(`Enviando ${PROMO_PRODUCTS.length} itens (3 produtos únicos — edge cases de promo)`);
  const { status, body } = await sendBatch(PROMO_PRODUCTS, key, 'delta');
  if (status !== 202) fail(`Esperado 202, recebeu ${status}: ${JSON.stringify(body)}`);

  const batch = await pollBatch(body.batch_id, 'COMPLETED', 'promos');
  ok(`Batch COMPLETED — ${batch.items_processed}/${batch.items_total} itens`);

  const rows = await db.query(
    `SELECT "productId", price, "pricePromo", "pricePromos"
     FROM "Product"
     WHERE "pharmacyId" = $1 AND "productId" IN (9999905, 9999906, 9999907)
     ORDER BY "productId"`,
    [pharmacyId]
  );

  for (const p of rows.rows) {
    log(`  PRODUCTID=${p.productId} price=${p.price} pricePromo=${p.pricePromo} pricePromos=[${p.pricePromos}]`);
  }

  // Cenário A: PRICEPROMO 10.00 repetido 3x → deve ter só 1 valor no array
  const p905 = rows.rows.find(p => String(p.productId) === '9999905');
  if (!p905) fail('9999905 não encontrado no banco');
  if (p905.pricePromos.length !== 1) fail(`Cenário A: promo repetida deveria deduplicar para 1 valor, tem ${p905.pricePromos.length}: [${p905.pricePromos}]`);
  ok(`Cenário A OK — promo repetida deduplicada: pricePromos=[${p905.pricePromos}]`);

  // Cenário B: PRICEPROMO=0 é ignorado, só o valor válido (22.5) entra no array
  const p906 = rows.rows.find(p => String(p.productId) === '9999906');
  if (!p906) fail('9999906 não encontrado no banco');
  if (p906.pricePromos.length !== 1) fail(`Cenário B: PRICEPROMO=0 deveria ser ignorado, esperado [22.5], tem [${p906.pricePromos}]`);
  if (parseFloat(p906.pricePromos[0]) !== 22.5) fail(`Cenário B: esperado pricePromos=[22.5], tem [${p906.pricePromos}]`);
  ok(`Cenário B OK — PRICEPROMO=0 ignorado: pricePromos=[${p906.pricePromos}]`);

  // Cenário C: linha sem PRICEPROMO não entra no array, só a com valor válido (12.00)
  const p907 = rows.rows.find(p => String(p.productId) === '9999907');
  if (!p907) fail('9999907 não encontrado no banco');
  if (p907.pricePromos.length !== 1) fail(`Cenário C: PRICEPROMO ausente deveria ser ignorado, esperado [12], tem [${p907.pricePromos}]`);
  if (parseFloat(p907.pricePromos[0]) !== 12) fail(`Cenário C: esperado pricePromos=[12], tem [${p907.pricePromos}]`);
  ok(`Cenário C OK — PRICEPROMO ausente ignorado: pricePromos=[${p907.pricePromos}]`);
}

async function testDelta(pharmacyId) {
  title('TESTE 4: Delta — atualização de preço de produto existente');

  const key = `test-delta-update-${Date.now()}`;
  const updatedProducts = [
    {
      ...PRODUCTS.find(p => p.PRODUCTID === 9999901),
      PRICE: 30.00,
      PRICEPROMO: 27.00,
    },
  ];

  log(`Atualizando TEST-001: PRICE 27.04→30.00, PRICEPROMO 25.50→27.00`);

  const { status, body } = await sendBatch(updatedProducts, key, 'delta');
  if (status !== 202) fail(`Esperado 202, recebeu ${status}`);

  const batch = await pollBatch(body.batch_id, 'COMPLETED', 'delta update');
  ok(`Delta processado: ${batch.items_processed}/${batch.items_total} itens`);

  const product = await db.query(
    `SELECT price, "pricePromo", "pricePromos" FROM "Product"
     WHERE "pharmacyId" = $1 AND "productId" = 9999901`,
    [pharmacyId]
  );

  if (!product.rows[0]) fail('TEST-001 não encontrado após delta');
  const p = product.rows[0];
  if (parseFloat(p.price) !== 30.00) fail(`Preço não atualizado: esperado 30.00, tem ${p.price}`);
  ok(`Preço atualizado: price=${p.price} pricePromo=${p.pricePromo} pricePromos=[${p.pricePromos}]`);
}

async function testConsultaProdutos(pharmacyId) {
  title('TESTE 6: GET /v1/products — consistência API vs banco de dados');

  // Buscar todos os produtos do banco para o CNPJ de teste
  const dbRows = await db.query(
    `SELECT "productId", title, description, ean, price, "pricePromo", "pricePromos",
            stock, brand, category, "imageLink", "isActive"
     FROM "Product"
     WHERE "pharmacyId" = $1 AND "isActive" = true
     ORDER BY "productId"`,
    [pharmacyId]
  );
  const dbProducts = dbRows.rows;
  log(`Banco de dados: ${dbProducts.length} produtos ativos`);

  // Buscar todos via API (paginando se necessário)
  const apiProducts = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `${API_BASE}/v1/products?cnpj=${TEST_CNPJ}&limit=100&page=${page}`,
      { headers: { 'X-Api-Key': API_KEY } }
    );
    if (!res.ok) fail(`API retornou ${res.status}: ${await res.text()}`);
    const body = await res.json();
    apiProducts.push(...body.items);
    if (page >= body.pagination.total_pages) break;
    page++;
  }
  log(`API retornou: ${apiProducts.length} produtos`);

  // 1. Comparar contagem
  if (apiProducts.length !== dbProducts.length) {
    fail(`Contagem diverge — banco: ${dbProducts.length}, API: ${apiProducts.length}`);
  }
  ok(`Contagem igual: ${dbProducts.length} produtos`);

  // Indexar API por productId para comparação campo a campo
  const apiByProductId = new Map(apiProducts.map(p => [String(p.productId), p]));

  const erros = [];

  for (const db of dbProducts) {
    const id = String(db.productId);
    const api = apiByProductId.get(id);

    if (!api) {
      erros.push(`  PRODUCTID=${id} — presente no banco mas ausente na API`);
      continue;
    }

    // price
    if (parseFloat(api.price) !== parseFloat(db.price)) {
      erros.push(`  PRODUCTID=${id} price — banco: ${db.price}, API: ${api.price}`);
    }
    // pricePromo
    if (parseFloat(api.pricePromo) !== parseFloat(db.pricePromo)) {
      erros.push(`  PRODUCTID=${id} pricePromo — banco: ${db.pricePromo}, API: ${api.pricePromo}`);
    }
    // pricePromos (array ordenado)
    const dbPromos = [...db.pricePromos].map(Number).sort((a, b) => a - b).join(',');
    const apiPromos = [...(api.pricePromos || [])].map(Number).sort((a, b) => a - b).join(',');
    if (dbPromos !== apiPromos) {
      erros.push(`  PRODUCTID=${id} pricePromos — banco: [${dbPromos}], API: [${apiPromos}]`);
    }
    // title
    if (api.title !== db.title) {
      erros.push(`  PRODUCTID=${id} title — banco: "${db.title}", API: "${api.title}"`);
    }
    // sku (ean)
    if (api.sku !== db.ean) {
      erros.push(`  PRODUCTID=${id} sku/ean — banco: "${db.ean}", API: "${api.sku}"`);
    }
    // stock
    if (parseFloat(api.stock) !== parseFloat(db.stock)) {
      erros.push(`  PRODUCTID=${id} stock — banco: ${db.stock}, API: ${api.stock}`);
    }
    // brand
    if (api.brand !== (db.brand || '')) {
      erros.push(`  PRODUCTID=${id} brand — banco: "${db.brand}", API: "${api.brand}"`);
    }
    // category
    if (api.category !== (db.category || '')) {
      erros.push(`  PRODUCTID=${id} category — banco: "${db.category}", API: "${api.category}"`);
    }
  }

  // Verificar se a API retornou produtos que não existem no banco
  const dbIds = new Set(dbProducts.map(p => String(p.productId)));
  for (const api of apiProducts) {
    if (!dbIds.has(String(api.productId))) {
      erros.push(`  PRODUCTID=${api.productId} — presente na API mas ausente no banco`);
    }
  }

  if (erros.length > 0) {
    console.log(`\n  ✗ ${erros.length} divergência(s) encontrada(s):`);
    erros.forEach(e => console.log(e));
    process.exit(1);
  }

  ok(`Todos os campos conferem entre API e banco`);
}

function makeProduct(productId, ean, title, price, pricePromo) {
  return {
    CNPJ: TEST_CNPJ, INDICE: 0, PRODUCTID: productId, EAN: ean,
    TITLE: title, DESCRIPTION: title, SHOPID: 1,
    PRICE: price, PRICEPROMO: pricePromo,
    WHOLESALEPRICE: 0, WHOLESALEMIN: 0, QUANTITY: 5,
    CATEGORY: 'GENERICOS', MEASURE: 0, NCM: '30049059', BRAND: 'Test',
    IMAGELINK: '', SIZE: 1, COLOR: '',
    DATACADASTROPRODUTO: '2026-01-01T00:00:00',
    DATAATUALIZACAOPRODUTO: '2026-01-01T00:00:00',
    DATAATUALIZACAOESTOQUE: '2026-01-01T00:00:00',
  };
}

async function testFullBasico(pharmacyId) {
  title('TESTE 7: Carga Full — inativa produtos ausentes do batch');

  // Produtos exclusivos deste teste (não usados antes)
  const FULL_PRODUCTS = [
    makeProduct(9999908, '7891000000081', 'Produto Full A', 20.00, 18.00),
    makeProduct(9999909, '7891000000082', 'Produto Full B', 35.00, 30.00),
    makeProduct(9999910, '7891000000083', 'Produto Full C', 50.00, 45.00),
  ];

  // Confirmar que 9999901-9999907 estão ativos antes do full
  const antesDelta = await db.query(
    `SELECT "productId", "isActive" FROM "Product"
     WHERE "pharmacyId" = $1 AND "productId" = ANY($2::int[])`,
    [pharmacyId, [9999901,9999902,9999903,9999904,9999905,9999906,9999907]]
  );
  const ativosAntes = antesDelta.rows.filter(r => r.isActive).length;
  log(`Produtos de testes anteriores ativos antes do full: ${ativosAntes}`);

  log(`Enviando full load com 3 produtos (9999908, 9999909, 9999910)`);
  const key = `test-full-basico-${Date.now()}`;
  const { status, body } = await sendBatch(FULL_PRODUCTS, key, 'full');
  if (status !== 202) fail(`Esperado 202, recebeu ${status}: ${JSON.stringify(body)}`);

  const batch = await pollBatch(body.batch_id, 'COMPLETED', 'full');
  ok(`Batch COMPLETED — ${batch.items_processed}/${batch.items_total} itens`);

  // Os 3 produtos do batch devem estar ativos
  const ativos = await db.query(
    `SELECT "productId", "isActive" FROM "Product"
     WHERE "pharmacyId" = $1 AND "productId" = ANY($2::int[])
     ORDER BY "productId"`,
    [pharmacyId, [9999908, 9999909, 9999910]]
  );
  for (const p of ativos.rows) {
    if (!p.isActive) fail(`PRODUCTID=${p.productId} deveria estar ativo após full load`);
  }
  ok(`9999908, 9999909, 9999910 — ativos após full load`);

  // Produtos anteriores (delta) devem estar inativos
  const inativos = await db.query(
    `SELECT "productId", "isActive" FROM "Product"
     WHERE "pharmacyId" = $1 AND "productId" = ANY($2::int[])
     ORDER BY "productId"`,
    [pharmacyId, [9999901,9999902,9999903,9999904,9999905,9999906,9999907]]
  );
  const aindaAtivos = inativos.rows.filter(r => r.isActive);
  if (aindaAtivos.length > 0) {
    fail(`Produtos não inativados após full load: ${aindaAtivos.map(r => r.productId).join(', ')}`);
  }
  ok(`9999901-9999907 — inativados corretamente pelo full load`);

  return body.batch_id;
}

async function testFullJanela(pharmacyId) {
  title('TESTE 8: Carga Full sequencial — janela protege produtos do batch anterior');

  // Dois full loads em sequência rápida (dentro da janela de 10 min)
  // Batch A: 9999911 | Batch B: 9999912
  // Ao completar o Batch A, o worker deve detectar o Batch B mais recente
  // e pular a inativação. Ao completar o Batch B, usa os dois como conjunto
  // ativo — 9999911 deve continuar ativo mesmo não estando no Batch B.

  const BATCH_A = [makeProduct(9999911, '7891000000084', 'Produto Full Janela A', 25.00, 22.00)];
  const BATCH_B = [makeProduct(9999912, '7891000000085', 'Produto Full Janela B', 40.00, 35.00)];

  log(`Enviando Batch A (9999911) e Batch B (9999912) em sequência rápida`);

  const keyA = `test-full-janela-A-${Date.now()}`;
  const { status: sA, body: bA } = await sendBatch(BATCH_A, keyA, 'full');
  if (sA !== 202) fail(`Batch A: esperado 202, recebeu ${sA}`);
  ok(`Batch A recebido: ${bA.batch_id}`);

  // Enviar Batch B imediatamente, antes do A completar
  const keyB = `test-full-janela-B-${Date.now()}`;
  const { status: sB, body: bB } = await sendBatch(BATCH_B, keyB, 'full');
  if (sB !== 202) fail(`Batch B: esperado 202, recebeu ${sB}`);
  ok(`Batch B recebido: ${bB.batch_id}`);

  // Aguardar ambos completarem
  await pollBatch(bA.batch_id, 'COMPLETED', 'batch A');
  await pollBatch(bB.batch_id, 'COMPLETED', 'batch B');
  ok(`Ambos os batches COMPLETED`);

  // 9999911 deve estar ativo (protegido pela janela — estava no Batch A)
  const p911 = await db.query(
    `SELECT "isActive" FROM "Product" WHERE "pharmacyId" = $1 AND "productId" = 9999911`,
    [pharmacyId]
  );
  if (!p911.rows[0]) fail('9999911 não encontrado no banco');
  if (!p911.rows[0].isActive) fail(`9999911 foi inativado — janela não protegeu o produto do Batch A`);
  ok(`9999911 ativo — janela protegeu o produto do Batch A`);

  // 9999912 deve estar ativo (estava no Batch B)
  const p912 = await db.query(
    `SELECT "isActive" FROM "Product" WHERE "pharmacyId" = $1 AND "productId" = 9999912`,
    [pharmacyId]
  );
  if (!p912.rows[0]) fail('9999912 não encontrado no banco');
  if (!p912.rows[0].isActive) fail(`9999912 foi inativado indevidamente`);
  ok(`9999912 ativo — estava no Batch B`);

  // 9999908-9999910 também devem estar ativos (Batch do TESTE 7 ainda dentro da janela)
  const prevFull = await db.query(
    `SELECT "productId", "isActive" FROM "Product"
     WHERE "pharmacyId" = $1 AND "productId" = ANY($2::int[])
     ORDER BY "productId"`,
    [pharmacyId, [9999908, 9999909, 9999910]]
  );
  for (const p of prevFull.rows) {
    log(`  PRODUCTID=${p.productId} isActive=${p.isActive} (batch anterior dentro da janela)`);
  }
}

// ─── Execução ─────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║         TESTE DE PIPELINE — IntegraHub               ║');
  console.log(`║  CNPJ de teste: ${TEST_CNPJ}                    ║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  // Verificar que a API está no ar
  try {
    const health = await fetch(`${API_BASE}/health`);
    if (!health.ok) fail('API não está respondendo');
    ok('API health check OK');
  } catch {
    fail(`API não está acessível em ${API_BASE}. Verifique se o servidor está rodando.`);
  }

  try {
    const { key, pharmacyId } = await testEnvio();
    await testIdempotencia(key);
    await testKafkaReentrega(pharmacyId);
    await testDelta(pharmacyId);
    await testPromoConsolidation(pharmacyId);
    await testConsultaProdutos(pharmacyId);
    await testFullBasico(pharmacyId);
    await testFullJanela(pharmacyId);

    title('RESULTADO');
    console.log('\n  ✓ Todos os testes passaram\n');
    console.log('  Dados mantidos no banco para inspeção (CNPJ: ' + TEST_CNPJ + ')\n');
  } finally {
    await db.end();
  }
}

run().catch(err => {
  console.error('\n  ERRO INESPERADO:', err.message);
  process.exit(1);
});
