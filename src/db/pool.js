import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text, duration, rows: result.rowCount });
  }
  
  return result;
}

export async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);
  
  client.query = (...args) => {
    const start = Date.now();
    return originalQuery(...args).then(result => {
      const duration = Date.now() - start;
      if (process.env.NODE_ENV === 'development') {
        console.log('Client query', { duration, rows: result.rowCount });
      }
      return result;
    });
  };
  
  client.release = () => {
    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease();
  };
  
  return client;
}

export default pool;
