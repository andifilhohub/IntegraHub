import { getClient, query } from './pool.js';

export async function bulkUpsertProducts(pharmacyId, products, loadType, batchId) {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    // Track products seen in this batch for FULL load soft delete
    const productIds = products.map(p => p.PRODUCTID);
    
    // Bulk upsert using multi-row INSERT
    if (products.length > 0) {
      const values = [];
      const placeholders = [];
      let paramIndex = 1;
      
      products.forEach((p, idx) => {
        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
          `$${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
          `$${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
          `$${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
          `$${paramIndex++}, NOW(), NOW())`
        );
        
        values.push(
          pharmacyId,
          p.SHOPID,
          p.PRODUCTID,
          p.TITLE,
          p.DESCRIPTION,
          p.EAN,
          parseFloat(p.PRICE) || 0,
          parseFloat(p.PRICEPROMO) || 0,
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
          price, "pricePromo", "wholesalePrice", "wholesaleMin", stock,
          brand, ncm, category, "imageLink", measure, size, color, indice,
          "lastBatchId", "rawJson", "updatedAt", "createdAt"
        )
        VALUES ${placeholders.join(', ')}
        ON CONFLICT ("pharmacyId", "productId", title)
        DO UPDATE SET
          "shopId" = EXCLUDED."shopId",
          description = EXCLUDED.description,
          ean = EXCLUDED.ean,
          price = EXCLUDED.price,
          "pricePromo" = EXCLUDED."pricePromo",
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
          "Product".price IS DISTINCT FROM EXCLUDED.price OR
          "Product".stock IS DISTINCT FROM EXCLUDED.stock OR
          "Product"."pricePromo" IS DISTINCT FROM EXCLUDED."pricePromo" OR
          "Product"."wholesalePrice" IS DISTINCT FROM EXCLUDED."wholesalePrice"
      `;
      
      await client.query(upsertQuery, values);
    }
    
    await client.query('COMMIT');
    
    return { upserted: products.length };
    
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
