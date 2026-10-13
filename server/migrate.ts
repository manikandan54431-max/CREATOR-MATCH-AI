import fs from 'node:fs/promises'
import path from 'node:path'
import { pool, query } from './db'

if (!pool) {
  console.error('The managed database is not configured.')
  process.exit(1)
}

const schemaPath = path.resolve(process.cwd(), 'server/schema.mysql.sql')
const schema = await fs.readFile(schemaPath, 'utf8')
const statements = schema.split(';').map((statement) => statement.trim()).filter(Boolean)

try {
  for (const statement of statements) await pool.query(statement)
  await query(
    'INSERT INTO schema_migrations (version) VALUES (?) ON DUPLICATE KEY UPDATE version = VALUES(version)',
    ['002_creatorhub_ai_rate_limits'],
  )
  console.log('CreatorHub managed MySQL schema is ready.')
} finally {
  await pool.end()
}
