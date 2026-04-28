/**
 * Testes do fluxo de vendas — cobre especificamente os dois bugs corrigidos:
 *
 *  Bug 1: UNIQUE (pharmacy_id, codigo_venda_online, tipo_ecommerce) não deduplicava
 *         quando tipo_ecommerce era NULL (PostgreSQL trata NULL != NULL em constraints).
 *         Fix: constraint agora é UNIQUE (pharmacy_id, codigo_venda_online).
 *
 *  Bug 2: Idempotency key auto-gerada usava Date.now(), então o mesmo payload enviado
 *         duas vezes gerava chaves distintas e bypassava o check de idempotência.
 *         Fix: key é hash puro do conteúdo, sem timestamp.
 *
 * Cenários:
 *   1. Fluxo normal: ingest → PENDING → consume → CONSUMED
 *   2. Mesmo payload enviado 2x sem idempotency-key → 1 única linha no DB
 *   3. Mesmo codigoVendaOnLine, tipoDeEcommerce NULL em ambas → não duplica (bug principal)
 *   4. Venda consumida reenviada → não volta como PENDING no polling
 *   5. Idempotency key explícita → retorna o mesmo sale_id
 */

import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

const API_BASE  = 'http://localhost:3002';
const API_KEY   = 'JFiennsli3iNLL2@DFDsdfdAS!JDISkddkLndJKJKN!@;sadffd:kjasjk';
const TEST_CNPJ = '00000000000000'; // CNPJ fictício só pra testes de sales
const POLL_MS   = 800;
const TIMEOUT_MS = 30_000;

const db = new Pool({
  connectionString: 'postgres://integrahub_user:kdnfpsjf_sf098ew2@127.0.0.1:5432/integrahub_db',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label, detail = '') {
  console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
  failed++;
}

function assert(cond, label, detail = '') {
  cond ? ok(label) : fail(label, detail);
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path, headers = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}`, ...headers },
  });
  return { status: res.status, body: await res.json() };
}

async function waitForStatus(saleId, targetStatus, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await db.query('SELECT status FROM sales WHERE sale_id = $1', [saleId]);
    if (row.rows[0]?.status === targetStatus) return true;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  return false;
}

function makeSalePayload(codigoVendaOnLine, opts = {}) {
  return {
    cnpjEmpresa: TEST_CNPJ,
    codigoVendaOnLine,
    dataVenda: '2026-01-15T10:00:00.000Z',
    nomeCliente: 'Cliente Teste',
    tipoDeEcommerce: opts.tipoDeEcommerce ?? null,
    entrega: { endereco: 'Rua Teste 123' },
    produtos: [{ sku: 'SKU-001', qtd: 1, preco: 49.90 }],
    pagamentos: [{ forma: 'PIX', valor: 49.90 }],
    ...opts.extra,
  };
}

async function cleanupTestSales() {
  await db.query(
    `DELETE FROM sales WHERE cnpj = $1`,
    [TEST_CNPJ]
  );
  // Remove pharmacy de teste se criada
  await db.query(
    `DELETE FROM "Pharmacy" WHERE cnpj = $1`,
    [TEST_CNPJ]
  );
}

// ─── Cenário 1: Fluxo normal ──────────────────────────────────────────────────

async function testNormalFlow() {
  console.log('\n📦 Cenário 1: Fluxo normal (ingest → PENDING → consume)');

  const codigo = `FLOW-${Date.now()}`;
  const payload = makeSalePayload(codigo, { tipoDeEcommerce: 'marketplace' });

  const { status, body } = await post('/v1/sales', payload);
  assert(status === 202, `POST /ingest retorna 202`, `got ${status}`);

  const saleId = body.sale_id;
  assert(!!saleId, 'Resposta contém sale_id');

  // Aguarda worker processar (RECEIVED → PENDING)
  const becamePending = await waitForStatus(saleId, 'PENDING');
  assert(becamePending, 'Venda transicionou para PENDING dentro do timeout');

  // Verifica aparece no polling
  const { body: listBody } = await get(`/api/v1/inovafarma/sales/${TEST_CNPJ}/pending`);
  const found = listBody.sales?.some(s => s.id === saleId);
  assert(found, 'Venda aparece no listing de PENDING');

  // Consume
  const { status: cs, body: cb } = await post(
    `/api/v1/inovafarma/sales/${TEST_CNPJ}/${saleId}/consume`,
    { consumer: 'inova-test', status: 'SUCCESS' }
  );
  assert(cs === 200, `POST /consume retorna 200`, `got ${cs}`);
  assert(cb.status === 'CONSUMED', 'Status retornado é CONSUMED');

  // Não aparece mais no polling
  const { body: listAfter } = await get(`/api/v1/inovafarma/sales/${TEST_CNPJ}/pending`);
  const stillThere = listAfter.sales?.some(s => s.id === saleId);
  assert(!stillThere, 'Venda não aparece mais no listing após consumida');
}

// ─── Cenário 2: Mesmo payload 2x sem idempotency-key ─────────────────────────

async function testSamePayloadTwice() {
  console.log('\n📦 Cenário 2: Mesmo payload enviado 2x sem idempotency-key → sem duplicata');

  const codigo = `DEDUP-PAYLOAD-${Date.now()}`;
  const payload = makeSalePayload(codigo);

  const r1 = await post('/v1/sales', payload);
  const r2 = await post('/v1/sales', payload);

  assert(r1.status === 202, `1ª requisição retorna 202`);
  assert(r2.status === 202, `2ª requisição retorna 202`);
  assert(
    r1.body.sale_id === r2.body.sale_id,
    'Ambas retornam o mesmo sale_id (idempotência por hash de conteúdo)',
    `${r1.body.sale_id} !== ${r2.body.sale_id}`
  );

  const { rows } = await db.query(
    'SELECT COUNT(*) as cnt FROM sales WHERE cnpj = $1 AND codigo_venda_online = $2',
    [TEST_CNPJ, codigo]
  );
  assert(rows[0].cnt === '1', 'Apenas 1 linha no banco para esse codigoVendaOnLine');
}

// ─── Cenário 3: tipo_ecommerce NULL — o bug original ─────────────────────────

async function testNullTipoEcommerceDuplicate() {
  console.log('\n📦 Cenário 3: Mesmo codigoVendaOnLine, tipoDeEcommerce NULL em ambas (bug original)');

  const codigo = `NULL-TIPO-${Date.now()}`;

  // Payload sem tipoDeEcommerce — simula exatamente o que causava o bug
  const payload1 = {
    cnpjEmpresa: TEST_CNPJ,
    codigoVendaOnLine: codigo,
    dataVenda: '2026-01-15T10:00:00.000Z',
    nomeCliente: 'Cliente A',
    // tipoDeEcommerce ausente → null
    entrega: {},
    produtos: [],
    pagamentos: [],
  };
  const payload2 = {
    ...payload1,
    nomeCliente: 'Cliente B (reenvio)',
  };

  // Envia com idempotency keys diferentes para forçar o ON CONFLICT a ser o único freio
  const r1 = await post('/v1/sales', payload1, { 'idempotency-key': `ik-null-a-${Date.now()}` });
  const r2 = await post('/v1/sales', payload2, { 'idempotency-key': `ik-null-b-${Date.now()}` });

  assert(r1.status === 202, `1ª requisição retorna 202`);
  assert(r2.status === 202, `2ª requisição retorna 202`);
  assert(
    r1.body.sale_id === r2.body.sale_id,
    'Ambas retornam o mesmo sale_id (ON CONFLICT pharmacy_id, codigo_venda_online)',
    `${r1.body.sale_id} !== ${r2.body.sale_id}`
  );

  const { rows } = await db.query(
    'SELECT COUNT(*) as cnt FROM sales WHERE cnpj = $1 AND codigo_venda_online = $2',
    [TEST_CNPJ, codigo]
  );
  assert(
    rows[0].cnt === '1',
    'Apenas 1 linha no banco — constraint sem tipo_ecommerce impediu duplicata',
    `encontradas: ${rows[0].cnt}`
  );

  // Aguarda PENDING e verifica que aparece só 1x no polling
  const saleId = r1.body.sale_id;
  await waitForStatus(saleId, 'PENDING');

  const { body: listBody } = await get(`/api/v1/inovafarma/sales/${TEST_CNPJ}/pending`);
  const occurrences = listBody.sales?.filter(s => s.id === saleId).length ?? 0;
  assert(
    occurrences <= 1,
    `Venda aparece no máximo 1x no polling (apareceu ${occurrences}x)`
  );
}

// ─── Cenário 4: Venda consumida reenviada não volta como PENDING ──────────────

async function testConsumedNotReshownAfterResend() {
  console.log('\n📦 Cenário 4: Venda consumida reenviada não volta como PENDING');

  const codigo = `RESEND-${Date.now()}`;
  const payload = makeSalePayload(codigo, { tipoDeEcommerce: 'site' });

  // Ingest inicial
  const { body: b1 } = await post('/v1/sales', payload);
  const saleId = b1.sale_id;
  assert(!!saleId, 'Primeira ingestão cria sale_id');

  // Aguarda PENDING
  const becamePending = await waitForStatus(saleId, 'PENDING');
  assert(becamePending, 'Venda atingiu status PENDING');

  // Consome
  await post(
    `/api/v1/inovafarma/sales/${TEST_CNPJ}/${saleId}/consume`,
    { consumer: 'inova-test', status: 'SUCCESS' }
  );

  const { rows: afterConsume } = await db.query(
    'SELECT status FROM sales WHERE sale_id = $1', [saleId]
  );
  assert(afterConsume[0]?.status === 'CONSUMED', 'Venda marcada como CONSUMED');

  // Reenvia a mesma venda (idempotency key diferente para simular retry do Inova)
  const resendKey = `resend-${Date.now()}`;
  const { status: rs, body: rb } = await post('/v1/sales', payload, {
    'idempotency-key': resendKey,
  });
  assert(rs === 202, `Reenvio retorna 202`);
  assert(
    rb.sale_id === saleId,
    'Reenvio retorna o mesmo sale_id (ON CONFLICT não resetou status)',
    `esperado ${saleId}, got ${rb.sale_id}`
  );

  // Verifica que status continua CONSUMED (não voltou para PENDING)
  const { rows: afterResend } = await db.query(
    'SELECT status FROM sales WHERE sale_id = $1', [saleId]
  );
  assert(
    afterResend[0]?.status === 'CONSUMED',
    'Status permanece CONSUMED após reenvio (não voltou para PENDING)'
  );

  // Não aparece no polling de pendentes
  const { body: listBody } = await get(`/api/v1/inovafarma/sales/${TEST_CNPJ}/pending`);
  const inPending = listBody.sales?.some(s => s.id === saleId);
  assert(!inPending, 'Venda consumida não aparece no polling de PENDING após reenvio');
}

// ─── Cenário 5: Idempotency key explícita ─────────────────────────────────────

async function testExplicitIdempotencyKey() {
  console.log('\n📦 Cenário 5: Idempotency-Key explícita retorna mesmo sale_id');

  const codigo = `IDEM-${Date.now()}`;
  const iKey = `explicit-key-${crypto.randomUUID()}`;
  const payload = makeSalePayload(codigo);

  const r1 = await post('/v1/sales', payload, { 'idempotency-key': iKey });
  const r2 = await post('/v1/sales', payload, { 'idempotency-key': iKey });
  // Payload diferente, mesma key → deve retornar o primeiro
  const r3 = await post('/v1/sales', { ...payload, nomeCliente: 'Outro nome' }, { 'idempotency-key': iKey });

  assert(r1.status === 202, '1ª retorna 202');
  assert(r2.status === 202, '2ª retorna 202');
  assert(r3.status === 202, '3ª retorna 202');
  assert(r1.body.sale_id === r2.body.sale_id, 'Mesma key → mesmo sale_id (2ª)');
  assert(r1.body.sale_id === r3.body.sale_id, 'Mesma key → mesmo sale_id (3ª, payload diferente)');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('🧪 Testes de deduplicação de vendas\n');

  try {
    await cleanupTestSales();

    await testNormalFlow();
    await testSamePayloadTwice();
    await testNullTipoEcommerceDuplicate();
    await testConsumedNotReshownAfterResend();
    await testExplicitIdempotencyKey();

  } catch (err) {
    console.error('\n💥 Erro inesperado:', err.message);
    failed++;
  } finally {
    await cleanupTestSales();
    await db.end();

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Resultado: ${passed} passou, ${failed} falhou`);
    if (failed > 0) {
      console.log('❌ FALHOU');
      process.exit(1);
    } else {
      console.log('✅ TODOS OS TESTES PASSARAM');
    }
  }
}

run();
