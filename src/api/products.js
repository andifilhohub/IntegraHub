import { query } from '../db/pool.js';

/**
 * GET /v1/products
 * Retorna lista de produtos paginada no formato esperado pelo Chatwoot
 * 
 * Headers:
 * - Authorization: Bearer {token} (ou X-Api-Key: {token})
 * 
 * Query params:
 * - page: número da página (default: 1)
 * - limit: itens por página (default: 40, max: 100)
 * - cnpj: filtrar por CNPJ (obrigatório)
 * - q: buscar por título/descrição (opcional)
 * - category: filtrar por categoria (opcional)
 */
export async function getProductsHandler(request, reply) {
  try {
    // Validar autenticação
    const authHeader = request.headers.authorization || request.headers['x-api-key'];
    const validApiKeys = (process.env.VALID_API_KEYS || '').split(/[,;]/).map(k => k.trim());
    
    let isAuthenticated = false;
    
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      isAuthenticated = validApiKeys.includes(token);
    }
    
    if (!isAuthenticated) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token} or X-Api-Key: {token}'
      });
    }
    // Parse query params
    const page = parseInt(request.query.page) || 1;
    const limit = Math.min(parseInt(request.query.limit) || 40, 100);
    const offset = (page - 1) * limit;
    
    const { cnpj, category, q } = request.query;
    
    // CNPJ é obrigatório
    if (!cnpj) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'CNPJ parameter is required'
      });
    }
    
    // Build WHERE clause
    const conditions = ['p."isActive" = true']; // Apenas produtos ativos
    const params = [];
    let paramIndex = 1;
    
    // Join com Pharmacy para filtrar por CNPJ
    conditions.push(`ph."cnpj" = $${paramIndex++}`);
    params.push(cnpj);
    
    if (category) {
      conditions.push(`p.category = $${paramIndex++}`);
      params.push(category);
    }
    
    if (q) {
      conditions.push(`(p.title ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`);
      params.push(`%${q}%`);
      paramIndex++;
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Count total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM "Product" p
      LEFT JOIN "Pharmacy" ph ON p."pharmacyId" = ph.id
      ${whereClause}
    `;
    
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    
    // Get products
    const productsQuery = `
      SELECT 
        p.id,
        p."productId",
        p.title,
        p.description,
        p.ean as sku,
        p.price,
        p."pricePromo",
        p.stock,
        p.brand,
        p.category,
        p."imageLink",
        p."rawJson",
        ph.cnpj
      FROM "Product" p
      LEFT JOIN "Pharmacy" ph ON p."pharmacyId" = ph.id
      ${whereClause}
      ORDER BY p."updatedAt" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const productsResult = await query(productsQuery, [...params, limit, offset]);
    
    // Format response for Chatwoot
    const items = productsResult.rows.map(product => ({
      // IDs (múltiplos aliases para compatibilidade)
      id: product.productId,
      productId: product.productId,
      product_id: product.productId,
      
      // Nome
      title: product.title || '',
      name: product.title || '',
      
      // SKU (usa EAN se disponível)
      sku: product.sku || product.productId?.toString() || '',
      
      // Preços
      price: product.price || 0,
      pricePromo: product.pricePromo || null,
      
      // Estoque
      stock: product.stock || 0,
      quantity: product.stock || 0,
      
      // Brand
      brand: product.brand || '',
      
      // Category
      category: product.category || '',
      
      // Dados adicionais
      description: product.description || '',
      image: product.imageLink || '',
      imageLink: product.imageLink || '',
      cnpj: product.cnpj || '',
      
      // Raw JSON (payload completo original)
      rawJson: product.rawJson || {}
    }));
    
    // Response no formato Chatwoot
    return {
      items,
      pagination: {
        page,
        limit,
        count: total,
        total_pages: Math.ceil(total / limit)
      }
    };
    
  } catch (error) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error fetching products');
    reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to fetch products'
    });
  }
}
