import crypto from 'crypto';
import { findPharmacyByCnpj, setPharmacyApiKey, upsertPharmacy } from '../db/queries.js';

function normalizeCnpj(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '');
}

function adminAuthenticate(request) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return false;

  const raw = request.headers['authorization'] || request.headers['x-admin-api-key'];
  if (!raw) return false;

  const token = raw.replace(/^Bearer\s+/i, '').trim();
  return token === adminKey;
}

/**
 * POST /admin/pharmacies/:cnpj/api-key
 *
 * Generates (or sets) an API key for a pharmacy.
 * Creates the pharmacy if it doesn't exist.
 *
 * Optional body: { "key": "custom-key" }
 *   — Pass a custom key for controlled key rotation
 *   — Omit to auto-generate a cryptographically random key.
 *
 * Requires header:  Authorization: Bearer <ADMIN_API_KEY>
 *                   or X-Admin-Api-Key: <ADMIN_API_KEY>
 */
export async function generatePharmacyApiKeyHandler(request, reply) {
  if (!adminAuthenticate(request)) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Valid admin API key required. Use Authorization: Bearer <ADMIN_API_KEY> or X-Admin-Api-Key: <key>'
    });
  }

  const rawCnpj =
    request.params?.cnpj ||
    request.body?.cnpj ||
    request.query?.cnpj;

  const cnpj = normalizeCnpj(rawCnpj);
  if (!cnpj) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'cnpj is required (param, query, or body)'
    });
  }

  // Criar farmácia se não existir
  const pharmacy = await upsertPharmacy({
    cnpj,
    name: `Farmácia ${cnpj}`,
    state: null,
    city: null,
    rawJson: {}
  });

  const { key: customKey } = request.body || {};
  const newKey = customKey?.trim() || crypto.randomBytes(32).toString('hex');

  const updated = await setPharmacyApiKey(cnpj, newKey);

  return reply.status(200).send({
    cnpj: updated.cnpj,
    name: updated.name,
    api_key: newKey,
    message: 'API key set successfully. Store it securely — it will not be shown again.'
  });
}
