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
  // Try multiple header formats
  let raw = 
    request.headers['authorization'] ||
    request.headers['x-api-key'] ||
    request.headers['x-inova-api-key'] ||
    request.headers['apikey'] ||
    request.headers['api-key'] ||
    request.headers['inova-api-key'] ||
    request.query?.api_key ||
    request.query?.apikey;

  if (!raw) {
    // Log missing auth for debugging
    request.log.debug({
      headers: Object.keys(request.headers),
      path: request.url,
      method: request.method
    }, 'Auth: No credentials found in request');
    return null;
  }

  // Extract token from various formats
  let token = raw
    .replace(/^Bearer\s+/i, '')      // Bearer token
    .replace(/^Basic\s+/i, '')       // Basic auth prefix
    .trim();

  if (!token) {
    request.log.debug({ raw, path: request.url }, 'Auth: Token empty after parsing');
    return null;
  }

  const headerSource = raw === request.headers['authorization'] ? 'authorization' :
                       raw === request.headers['x-api-key'] ? 'x-api-key' :
                       raw === request.headers['x-inova-api-key'] ? 'x-inova-api-key' :
                       'other';

  const pharmacy = await findPharmacyByApiKey(token);
  if (pharmacy) {
    request._pharmacy = pharmacy; // picked up by request-logger plugin
    return { pharmacy };
  }

  request.log.info({
    receivedKey: token,
    headerSource,
    path: request.url,
    method: request.method
  }, 'Auth failed: key not found in database');

  // No fallback — all keys must be registered in the database
  return null;
}
