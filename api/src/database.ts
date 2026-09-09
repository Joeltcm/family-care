import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const database = config.DATABASE_URL
  ? new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: config.DATABASE_URL.includes('railway.internal') ? false : { rejectUnauthorized: false },
    })
  : null;

export async function checkDatabase() {
  if (!database) return { configured: false, connected: false };
  try {
    await database.query('SELECT 1');
    return { configured: true, connected: true };
  } catch {
    return { configured: true, connected: false };
  }
}
