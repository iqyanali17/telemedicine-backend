import { prisma } from '../src/config/database.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const sql = fs.readFileSync(
    path.resolve('prisma/migrations/20261021193000_add_pg_trgm_and_gin_indexes/migration.sql'),
    'utf8'
  );
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log('GIN trigram indexes successfully restored in PostgreSQL.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
