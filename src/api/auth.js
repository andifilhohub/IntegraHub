import { findPharmacyByApiKey } from '../db/queries.js';

/**
 * Authenticates a request by its API key.
 *
 * Returns:
 *   { pharmacy }       — key found in DB; pharmacy is the matching Pharmacy row
 *   { legacy: true }   — key matched VALID_API_KEYS env (transition period)
 *   null               — authentication failed
 */
export async function authenticate(request) {
  const raw =
    request.headers['authorization'] ||
    request.headers['x-api-key'] ||
    request.headers['x-inova-api-key'];

  if (!raw) return null;

  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const pharmacy = await findPharmacyByApiKey(token);
  if (pharmacy) return { pharmacy };

  // No fallback — all keys must be registered in the database
  return null;
}
