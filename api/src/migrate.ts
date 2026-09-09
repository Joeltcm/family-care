import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { database } from './database.js';

if (!database) throw new Error('DATABASE_URL is required to run migrations');

const migrationDirectory = fileURLToPath(new URL('../db/migrations', import.meta.url));
const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort();
const client = await database.connect();

try {
  await client.query('BEGIN');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const file of files) {
    const existing = await client.query<{ name: string }>('SELECT name FROM schema_migrations WHERE name = $1', [file]);
    if (existing.rowCount) continue;
    const sql = await readFile(path.join(migrationDirectory, file), 'utf8');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    process.stdout.write(`Applied migration ${file}\n`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await database.end();
}
