import { readFileSync } from 'fs';
import { resolve } from 'path';
import { neon } from '@neondatabase/serverless';
import { loadFrontendEnv } from './load-env';

loadFrontendEnv();

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('DATABASE_URL is missing. Copy .env.example to .env.local and paste your Neon URL.');
  process.exit(1);
}

const sql = neon(url);
const schemaPath = resolve(process.cwd(), 'scripts/schema.sql');
const body = readFileSync(schemaPath, 'utf8');
const statements = body
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

async function main() {
  for (const statement of statements) {
    await sql.query(statement, []);
  }
  console.log('Neon schema applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
