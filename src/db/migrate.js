import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../../migrations');
  
  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  
  // Get executed migrations
  const { rows: executed } = await pool.query(
    'SELECT name FROM _migrations ORDER BY id'
  );
  const executedNames = new Set(executed.map(r => r.name));
  
  // Read migration files
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  console.log(`Found ${files.length} migration files`);
  
  for (const file of files) {
    if (executedNames.has(file)) {
      console.log(`⏭️  Skipping ${file} (already executed)`);
      continue;
    }
    
    console.log(`▶️  Running ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO _migrations (name) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`✅ Completed ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Failed ${file}:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }
  
  console.log('✅ All migrations completed');
}

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
