import { getClient, query } from './pool.js';

export async function bulkUpsertProducts(pharmacyId, products, loadType, batchId) {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    // Deduplicate by PRODUCTID only — collect all pricePromo values per product into an array.
    // This way a product with multiple promotions becomes a single row with pricePromos=[10, 20, 25].
    // On each load the array is fully replaced, so edits/additions/removals are handled correctly.
    const dedupedProducts = (() => {
      const byId = new Map();
      for (const item of products) {
        const key = item?.PRODUCTID;
        if (!key) continue;
        if (!byId.has(key)) {
          byId.set(key, { item, promos: [] });
        }
        const parsedPromo = parseFloat(item?.PRICEPROMO);
        if (Number.isFinite(parsedPromo) && parsedPromo > 0) {
          byId.get(key).promos.push(parsedPromo);
        }
      }
      return Array.from(byId.values());
    })();
    
    // Bulk upsert using multi-row INSERT
    if (dedupedProducts.length > 0) {
      const values = [];
      const placeholders = [];
      let paramIndex = 1;
      
      dedupedProducts.forEach(({ item: p, promos }) => {
        const uniquePromos = [...new Set(promos)].sort((a, b) => a - b);
        const minPromo = uniquePromos.length > 0 ? uniquePromos[0] : (parseFloat(p.PRICE) || 0);

        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
          `$${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::double precision[], $${paramIndex++}, ` +
          `$${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
          `$${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
          `$${paramIndex++}, $${paramIndex++}, true, NOW(), NOW(), NOW())`
        );

        values.push(
          pharmacyId,
          p.SHOPID,
          p.PRODUCTID,
          p.TITLE,
          p.DESCRIPTION,
          p.EAN,
          parseFloat(p.PRICE) || 0,
          minPromo,
          uniquePromos,
          parseFloat(p.WHOLESALEPRICE) || 0,
          parseInt(p.WHOLESALEMIN) || 0,
          parseFloat(p.QUANTITY) || 0,
          p.BRAND,
          p.NCM,
          p.CATEGORY,
          p.IMAGELINK,
          parseInt(p.MEASURE) || 0,
          parseFloat(p.SIZE) || 0,
          p.COLOR,
          parseInt(p.INDICE) || 0,
          batchId,
          JSON.stringify(p)
        );
      });
      
      const upsertQuery = `
        INSERT INTO "Product" (
          "pharmacyId", "shopId", "productId", title, description, ean,
          price, "pricePromo", "pricePromos", "wholesalePrice", "wholesaleMin", stock,
          brand, ncm, category, "imageLink", measure, size, color, indice,
          "lastBatchId", "rawJson", "isActive", "lastSeenAt", "updatedAt", "createdAt"
        )
        VALUES ${placeholders.join(', ')}
        ON CONFLICT ("pharmacyId", "productId")
        DO UPDATE SET
          title = EXCLUDED.title,
          "shopId" = EXCLUDED."shopId",
          description = EXCLUDED.description,
          ean = EXCLUDED.ean,
          price = EXCLUDED.price,
          "pricePromo" = EXCLUDED."pricePromo",
          "pricePromos" = EXCLUDED."pricePromos",
          "wholesalePrice" = EXCLUDED."wholesalePrice",
          "wholesaleMin" = EXCLUDED."wholesaleMin",
          stock = EXCLUDED.stock,
          brand = EXCLUDED.brand,
          ncm = EXCLUDED.ncm,
          category = EXCLUDED.category,
          "imageLink" = EXCLUDED."imageLink",
          measure = EXCLUDED.measure,
          size = EXCLUDED.size,
          color = EXCLUDED.color,
          indice = EXCLUDED.indice,
          "lastBatchId" = EXCLUDED."lastBatchId",
          "rawJson" = EXCLUDED."rawJson",
          "isActive" = true,
          "lastSeenAt" = NOW(),
          "updatedAt" = NOW()
        WHERE
          "Product".title IS DISTINCT FROM EXCLUDED.title OR
          "Product".price IS DISTINCT FROM EXCLUDED.price OR
          "Product".stock IS DISTINCT FROM EXCLUDED.stock OR
          "Product"."pricePromos" IS DISTINCT FROM EXCLUDED."pricePromos" OR
          "Product"."wholesalePrice" IS DISTINCT FROM EXCLUDED."wholesalePrice" OR
          "Product"."isActive" IS DISTINCT FROM true OR
          "Product"."lastBatchId" IS DISTINCT FROM EXCLUDED."lastBatchId"
      `;
      
      await client.query(upsertQuery, values);
    }
    
    await client.query('COMMIT');
    
    return { upserted: dedupedProducts.length };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function markInactiveProducts(pharmacyId, batchId) {
  // For FULL loads: mark products NOT in this batch as inactive
  const result = await query(
    `UPDATE "Product" 
     SET "isActive" = false, "deletedAt" = NOW(), "updatedAt" = NOW()
     WHERE "pharmacyId" = $1 
       AND "isActive" = true
       AND ("lastBatchId" IS NULL OR "lastBatchId" != $2)
     RETURNING id`,
    [pharmacyId, batchId]
  );
  
  return result.rowCount;
}

// For sequences of FULL loads: mark inactive only after a quiet window,
// using all FULL batches in that window as the active set.
export async function markInactiveProductsWindow(pharmacyId, batchId, windowMinutes = 10) {
  // Get current batch time
  const batchResult = await query(
    `SELECT created_at
     FROM batches
     WHERE batch_id = $1`,
    [batchId]
  );
  if (batchResult.rows.length === 0) return { skipped: true, reason: 'batch_not_found', inactivated: 0 };
  const createdAt = batchResult.rows[0].created_at;

  // If there is a newer FULL batch in the window, skip inactivation
  const newerResult = await query(
    `SELECT 1
     FROM batches
     WHERE pharmacy_id = $1
       AND load_type = 'full'
       AND created_at > $2
       AND created_at <= $2 + ($3 || ' minutes')::interval
     LIMIT 1`,
    [pharmacyId, createdAt, String(windowMinutes)]
  );
  if (newerResult.rows.length > 0) {
    return { skipped: true, reason: 'newer_full_in_window', inactivated: 0 };
  }

  // Use all FULL batches in the window ending at this batch
  const windowResult = await query(
    `SELECT batch_id
     FROM batches
     WHERE pharmacy_id = $1
       AND load_type = 'full'
       AND created_at >= $2 - ($3 || ' minutes')::interval
       AND created_at <= $2`,
    [pharmacyId, createdAt, String(windowMinutes)]
  );
  const batchIds = windowResult.rows.map(r => r.batch_id);
  if (batchIds.length === 0) {
    return { skipped: true, reason: 'no_full_batches_in_window', inactivated: 0 };
  }

  const result = await query(
    `UPDATE "Product"
     SET "isActive" = false, "deletedAt" = NOW(), "updatedAt" = NOW()
     WHERE "pharmacyId" = $1
       AND "isActive" = true
       AND ("lastBatchId" IS NULL OR NOT ("lastBatchId" = ANY($2::uuid[])))
     RETURNING id`,
    [pharmacyId, batchIds]
  );

  return { skipped: false, reason: 'ok', inactivated: result.rowCount, windowBatchIds: batchIds };
}
