import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

export type DbRow = RowDataPacket & Record<string, unknown>
export type QueryResult<T extends RowDataPacket = RowDataPacket> = {
  rows: T[]
  affectedRows: number
  insertId: number
}

export const databaseUrl = process.env.DATABASE_URL || ''
export const databaseConfigured = Boolean(databaseUrl)

function createDatabasePool(url: string): Pool {
  const parsed = new URL(url)
  if (parsed.protocol !== 'mysql:' && parsed.protocol !== 'mysql2:') {
    throw new Error('The managed database connection must use the MySQL protocol.')
  }
  const host = parsed.hostname
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  return mysql.createPool({
    host,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/, '')),
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 0,
    enableKeepAlive: true,
    ...(local ? {} : {
      ssl: {
        ca: fs.readFileSync(path.resolve(process.cwd(), 'ca.pem'), 'utf8'),
        rejectUnauthorized: true,
      },
    }),
  })
}

export const pool = databaseConfigured ? createDatabasePool(databaseUrl) : null

export async function query<T extends RowDataPacket = RowDataPacket>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  if (!pool) throw new Error('The managed database is not configured.')
  const [result] = await pool.execute(text, params as any[])
  if (Array.isArray(result)) {
    return { rows: result as T[], affectedRows: result.length, insertId: 0 }
  }
  const header = result as ResultSetHeader
  return { rows: [], affectedRows: header.affectedRows, insertId: header.insertId }
}

export async function hashPassword(password: string) { return bcrypt.hash(password, 12) }
export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash) }
export function newToken() { return crypto.randomBytes(32).toString('hex') }
export function hashToken(token: string) { return crypto.createHash('sha256').update(token).digest('hex') }

export async function createSession(userId: string) {
  const raw = newToken()
  const sessionId = crypto.randomUUID()
  await query('INSERT INTO sessions (id, token_hash, user_id, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY))', [sessionId, hashToken(raw), userId])
  return raw
}

export async function getSession(token?: string) {
  if (!token || !pool) return null
  const result = await query<DbRow>(
    `SELECT s.id AS session_id, p.id AS user_id, p.display_name, p.role, p.bio, p.specialization,
            p.skills, p.tools, p.company_name, p.company_website, p.avatar_url, p.is_active
     FROM sessions s JOIN profiles p ON p.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) AND p.is_active = 1 LIMIT 1`,
    [hashToken(token)],
  )
  return result.rows[0] ?? null
}

export type AISessionUser = { user_id: string; role: 'creator' | 'brand' | 'admin'; is_active: number }

export async function getAISession(token?: string): Promise<AISessionUser | null> {
  if (!token || !pool) return null
  const result = await query<DbRow>(
    `SELECT p.id AS user_id, p.role, p.is_active
     FROM sessions s JOIN profiles p ON p.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) AND p.is_active = 1 LIMIT 1`,
    [hashToken(token)],
  )
  return (result.rows[0] as AISessionUser | undefined) ?? null
}

export async function consumeAIRequest(userId: string, limit = 20): Promise<boolean> {
  if (!pool) throw new Error('The managed database is not configured.')
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute(
      `INSERT INTO ai_request_limits (user_id, window_started_at, request_count)
       VALUES (?, UTC_TIMESTAMP(3), 1)
       ON DUPLICATE KEY UPDATE
         request_count = IF(window_started_at <= UTC_TIMESTAMP(3) - INTERVAL 10 MINUTE, 1, LEAST(request_count + 1, ?)),
         window_started_at = IF(window_started_at <= UTC_TIMESTAMP(3) - INTERVAL 10 MINUTE, UTC_TIMESTAMP(3), window_started_at),
         updated_at = UTC_TIMESTAMP(3)`,
      [userId, limit + 1],
    )
    const [rows] = await connection.execute('SELECT request_count FROM ai_request_limits WHERE user_id = ? FOR UPDATE', [userId])
    const count = Array.isArray(rows) ? Number((rows as RowDataPacket[])[0]?.request_count ?? 0) : 0
    await connection.commit()
    return count > 0 && count <= limit
  } catch (error) {
    await connection.rollback().catch(() => undefined)
    throw error
  } finally {
    connection.release()
  }
}

export async function destroySession(token?: string) {
  if (token && pool) await query('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)])
}
