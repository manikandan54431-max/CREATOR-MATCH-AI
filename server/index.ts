import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  createSession,
  consumeAIRequest,
  databaseConfigured,
  destroySession,
  getAISession,
  getSession,
  hashPassword,
  query,
  verifyPassword,
  type DbRow,
} from './db'
import { completionText, invokeLLM, isLLMConfigured, selectStructuredOutputModel } from './llm'

const app = express()
const port = Number(process.env.PORT || 3000)
const distPath = path.resolve(process.cwd(), 'dist')
const indexPath = path.join(distPath, 'index.html')
const indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : ''
app.use(express.json({ limit: '2mb' }))

const cookie = (req: express.Request, name: string) => req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
const cookieMode = (req: express.Request) => {
  const origin = req.get('origin') || ''
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const https = origin.startsWith('https://') || forwardedProto === 'https'
  return https ? '; SameSite=None; Secure' : '; SameSite=Lax'
}
const setSessionCookie = (req: express.Request, res: express.Response, token: string) => {
  res.setHeader('Set-Cookie', `cm_session=${token}; Path=/; HttpOnly${cookieMode(req)}; Max-Age=2592000`)
}
const clearSessionCookie = (req: express.Request, res: express.Response) => {
  res.setHeader('Set-Cookie', `cm_session=; Path=/; HttpOnly${cookieMode(req)}; Max-Age=0`)
}
type Role = 'creator' | 'brand' | 'admin'
type SessionUser = DbRow & { user_id: string; display_name: string; role: Role; is_active: number }
const currentUser = async (req: express.Request) => (await getSession(cookie(req, 'cm_session'))) as SessionUser | null
type AIRequestUser = { user_id: string; role: Role; is_active: number }
const currentAIUser = async (req: express.Request) => (await getAISession(cookie(req, 'cm_session'))) as AIRequestUser | null
type AIPage = 'home' | 'discover' | 'creator' | 'auth' | 'workspace' | 'studio' | 'brief-assistant' | 'admin' | 'setup'
const aiPageLabels: Record<AIPage, string> = {
  home: 'landing and campaign ideas', discover: 'creator discovery and outreach', creator: 'creator profile and portfolio writing',
  auth: 'account roles and sign-in help', workspace: 'brief and collaboration drafting', studio: 'scripts, storyboards and captions',
  'brief-assistant': 'creative brief planning', admin: 'general admin workflow guidance', setup: 'project setup and privacy guidance',
}
const profilePayload = (user: any) => user ? {
  id: user.user_id || user.id,
  display_name: user.display_name,
  role: user.role,
  bio: user.bio,
  specialization: user.specialization,
  skills: user.skills,
  tools: user.tools,
  avatar_url: user.avatar_url,
  company_name: user.company_name,
  company_website: user.company_website,
  is_active: user.is_active,
  created_at: user.created_at,
  updated_at: user.updated_at,
} : null

const publicColumns = {
  profiles: ['id', 'display_name', 'role', 'bio', 'specialization', 'skills', 'tools', 'avatar_url', 'company_name', 'company_website', 'is_active', 'created_at', 'updated_at'],
  portfolio_items: ['id', 'creator_id', 'title', 'description', 'media_type', 'tool_used', 'external_url', 'media_url', 'created_at', 'updated_at'],
  creative_briefs: ['id', 'brand_id', 'title', 'description', 'target_audience', 'deliverables', 'content_type', 'style_direction', 'platform', 'budget', 'deadline', 'status', 'created_at', 'updated_at'],
  project_invitations: ['id', 'brand_id', 'creator_id', 'brief_id', 'status', 'response_at', 'created_at', 'updated_at'],
  project_messages: ['id', 'invitation_id', 'sender_id', 'body', 'created_at'],
} as const
const writableColumns = {
  portfolio_items: ['title', 'description', 'media_type', 'tool_used', 'external_url', 'media_url'],
  creative_briefs: ['title', 'description', 'target_audience', 'deliverables', 'content_type', 'style_direction', 'platform', 'budget', 'deadline'],
} as const
const allowedTables = new Set(Object.keys(publicColumns))
type DataTable = keyof typeof publicColumns

type Filter = { column: string; value: string }
function requestFilters(req: express.Request): Filter[] {
  const querySource = req.query.filter
  const queryEntries = Array.isArray(querySource) ? querySource : querySource === undefined ? [] : [querySource]
  const bodySource = asObject(req.body).filters
  const bodyEntries = Array.isArray(bodySource) ? bodySource : []
  const parse = (entry: unknown, decode: boolean) => {
    const raw = String(entry)
    const separator = raw.indexOf('=')
    if (separator < 1) throw new ApiError(400, 'Invalid filter.')
    let value = raw.slice(separator + 1)
    if (decode) {
      try { value = decodeURIComponent(value) } catch { throw new ApiError(400, 'Invalid filter encoding.') }
    }
    return { column: raw.slice(0, separator), value }
  }
  return [...queryEntries.map((entry) => parse(entry, false)), ...bodyEntries.map((entry) => parse(entry, true))]
}
function quoteIdentifier(identifier: string) { return `\`${identifier}\`` }
function compileFilters(filters: Filter[], columns: readonly string[], alias: string) {
  const clauses: string[] = []
  const params: unknown[] = []
  for (const filter of filters) {
    if (!columns.includes(filter.column)) throw new ApiError(400, 'Invalid filter field.')
    const values = filter.value.split(',')
    const field = `${alias}.${quoteIdentifier(filter.column)}`
    if (values.length > 1) {
      if (values.length > 200) throw new ApiError(400, 'Too many filter values.')
      clauses.push(`${field} IN (${values.map(() => '?').join(', ')})`)
      params.push(...values)
    } else {
      clauses.push(`${field} = ?`)
      params.push(filter.value)
    }
  }
  return { clauses, params }
}
function selectedColumns(table: DataTable, select: unknown) {
  const permitted = publicColumns[table] as readonly string[]
  const requested = String(select || '*').split(',').map((column) => column.trim()).filter(Boolean)
  const columns = requested.includes('*') || requested.some((column) => column.includes('('))
    ? permitted
    : requested.filter((column) => permitted.includes(column))
  if (!columns.length) throw new ApiError(400, 'No selectable fields were requested.')
  return columns.map((column) => `t.${quoteIdentifier(column)}`).join(', ')
}
function orderClause(table: DataTable, order: unknown) {
  const [requestedColumn, requestedDirection] = String(order || 'created_at:desc').split(':')
  const permitted = publicColumns[table] as readonly string[]
  const column = permitted.includes(requestedColumn) ? requestedColumn : 'created_at'
  const direction = requestedDirection?.toLowerCase() === 'asc' ? 'ASC' : 'DESC'
  return `t.${quoteIdentifier(column)} ${direction}`
}
function placeholders(count: number) { return Array.from({ length: count }, () => '?').join(', ') }
function asObject(value: unknown): Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}
function cleanFields(value: Record<string, any>, allowed: readonly string[], table: string) {
  return Object.entries(value).filter(([key, item]) => allowed.includes(key) && item !== undefined).map(([key, item]) => {
    if (table === 'profiles' && (key === 'skills' || key === 'tools')) return [key, JSON.stringify(Array.isArray(item) ? item : [])] as const
    return [key, item] as const
  })
}

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
function errorResponse(error: unknown) {
  const code = (error as any)?.code
  if (code === 'ER_DUP_ENTRY') return { status: 409, message: 'A record with those details already exists.' }
  if (error instanceof ApiError) return { status: error.status, message: error.message }
  return { status: 500, message: 'The database operation could not be completed.' }
}

app.get('/health', async (_req, res) => {
  let reachable = false
  if (databaseConfigured) {
    try { await query('SELECT 1 AS ready'); reachable = true } catch { reachable = false }
  }
  const ok = !databaseConfigured || reachable
  res.status(ok ? 200 : 503).json({ ok, service: 'CreatorHub AI API', database: { provider: 'mysql', configured: databaseConfigured, reachable } })
})
app.get('/api/integrations', (_req, res) => res.json({
  database: { provider: 'mysql', configured: databaseConfigured },
  ai: { configured: isLLMConfigured() },
  storage: { configured: Boolean(process.env.STORAGE_PROVIDER_KEY) },
  realtime: { configured: Boolean(process.env.SOCKET_SERVER_URL) },
  payments: { configured: Boolean(process.env.RAZORPAY_KEY_ID) },
}))

app.post('/api/ai/chat', async (req, res) => {
  if (!databaseConfigured) return res.status(503).json({ error: 'Sign in is required to use the AI Copilot.' })
  if (!isLLMConfigured()) return res.status(503).json({ error: 'The AI Copilot is not available right now.' })
  let user: AIRequestUser | null
  try { user = await currentAIUser(req) } catch { return res.status(503).json({ error: 'Your session could not be checked. Please try again.' }) }
  if (!user) return res.status(401).json({ error: 'Sign in to use the AI Copilot.' })
  const body = asObject(req.body)
  const page = body.page as AIPage
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!Object.prototype.hasOwnProperty.call(aiPageLabels, page) || !message || message.length > 2000) return res.status(400).json({ error: 'Enter a message of up to 2,000 characters.' })
  let allowed: boolean
  try { allowed = await consumeAIRequest(user.user_id) } catch { return res.status(503).json({ error: 'AI is temporarily unavailable because account controls could not be checked.' }) }
  if (!allowed) {
    res.setHeader('Retry-After', '600')
    return res.status(429).json({ error: 'You have reached the short-term AI request limit. Please try again later.' })
  }
  let chatModel: string
  try { chatModel = await selectStructuredOutputModel() } catch { return res.status(503).json({ error: 'A supported AI model is not available right now. Please try again shortly.' }) }
  const history = (Array.isArray(body.history) ? body.history : []).slice(-8).flatMap((item: any) => {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') return []
    const content = item.content.trim().slice(0, 1200)
    return content ? [{ role: item.role as 'user' | 'assistant', content }] : []
  })
  try {
    const response = await invokeLLM({ model: chatModel, max_completion_tokens: 1200, messages: [
      { role: 'system', content: `You are CreatorHub's AI Copilot. The user is signed in with the server-verified role "${user.role}" and is viewing ${aiPageLabels[page]}. You know only this page category and what the user has typed in this conversation; you have no access to CreatorHub records or tools. Give clear, practical creative or workflow suggestions. Treat every answer as a draft for the user to review. Never claim to save, send, publish, or change anything. Never ask for passwords, login codes, payment details, or confidential credentials. If asked to expose or modify account/database records, explain that you cannot do that.` },
      ...history,
      { role: 'user', content: message },
    ] })
    const text = completionText(response, 5000)
    if (!text) return res.status(502).json({ error: 'The AI returned an empty response. Your prompt is still here; please try again.' })
    res.json({ text })
  } catch {
    res.status(502).json({ error: 'The AI could not complete that request. Your prompt is still here; please try again.' })
  }
})

app.post('/api/ai/brief', async (req, res) => {
  if (!databaseConfigured) return res.status(503).json({ error: 'Sign in is required to generate a brief.' })
  if (!isLLMConfigured()) return res.status(503).json({ error: 'AI brief generation is not available right now.' })
  let user: AIRequestUser | null
  try { user = await currentAIUser(req) } catch { return res.status(503).json({ error: 'Your session could not be checked. Please try again.' }) }
  if (!user) return res.status(401).json({ error: 'Sign in to generate an AI brief.' })
  const idea = typeof asObject(req.body).idea === 'string' ? asObject(req.body).idea.trim() : ''
  if (idea.length < 12 || idea.length > 2000) return res.status(400).json({ error: 'Add at least 12 characters and keep the idea within 2,000 characters.' })
  let allowed: boolean
  try { allowed = await consumeAIRequest(user.user_id) } catch { return res.status(503).json({ error: 'AI is temporarily unavailable because account controls could not be checked.' }) }
  if (!allowed) {
    res.setHeader('Retry-After', '600')
    return res.status(429).json({ error: 'You have reached the short-term AI request limit. Please try again later.' })
  }
  let briefModel: string
  try { briefModel = await selectStructuredOutputModel() } catch { return res.status(503).json({ error: 'A supported AI model is not available right now. Please try again shortly.' }) }
  try {
    const tokenLimit = { max_completion_tokens: 3200 }
    const response = await invokeLLM({
      model: briefModel,
      ...tokenLimit,
      messages: [
        { role: 'system', content: `You are CreatorHub's creative brief assistant. Turn only the user's rough idea into a concise first draft. Do not invent verified facts, results, budgets, dates, or rights; label assumptions as suggestions. Account role: ${user.role}. Keep each text field to 1–2 short sentences, return 3–4 deliverables and 3–4 checklist items, and complete every field.` },
        { role: 'user', content: idea },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'creatorhub_creative_brief',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string', maxLength: 80 }, description: { type: 'string', maxLength: 420 }, audience: { type: 'string', maxLength: 280 },
              deliverables: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string', maxLength: 140 } }, format: { type: 'string', maxLength: 120 },
              style: { type: 'string', maxLength: 300 }, checklist: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string', maxLength: 120 } },
            },
            required: ['title', 'description', 'audience', 'deliverables', 'format', 'style', 'checklist'],
            additionalProperties: false,
          },
        },
      },
    })
    const parseOutput = (text: string) => {
      try {
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
        const start = cleaned.indexOf('{')
        const end = cleaned.lastIndexOf('}')
        return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned)
      } catch { return null }
    }
    const validateBrief = (raw: any) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
      const boundedText = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
      const boundedList = (value: unknown, min: number, max: number, itemLength: number) => {
        if (!Array.isArray(value) || value.length < min || value.length > max) return null
        const items = value.map((item) => boundedText(item, itemLength))
        return items.every((item) => item !== null) ? items as string[] : null
      }
      const title = boundedText(raw.title, 80)
      const description = boundedText(raw.description, 420)
      const audience = boundedText(raw.audience, 280)
      const deliverables = boundedList(raw.deliverables, 3, 4, 140)
      const format = boundedText(raw.format, 120)
      const style = boundedText(raw.style, 300)
      const checklist = boundedList(raw.checklist, 3, 4, 120)
      if (!title || !description || !audience || !deliverables || !format || !style || !checklist) return null
      return { title, description, audience, deliverables, format, style, checklist }
    }
    let data = validateBrief(parseOutput(completionText(response)))
    if (!data) {
      const fallback = await invokeLLM({
        model: briefModel,
        ...tokenLimit,
        messages: [
          { role: 'system', content: 'Return only one compact, valid JSON object with keys title, description, audience, deliverables, format, style, checklist. Keep each text field to one short sentence; provide exactly three deliverables and three checklist items. No markdown or extra text.' },
          { role: 'user', content: idea },
        ],
      })
      data = validateBrief(parseOutput(completionText(fallback)))
    }
    if (!data) {
      return res.status(502).json({ error: 'The AI returned an incomplete brief. Your idea is still here; please try again.' })
    }
    res.json({ data })
  } catch {
    res.status(502).json({ error: 'AI brief generation failed. Your idea is still here; please try again.' })
  }
})

app.get('/api/auth/session', async (req, res) => {
  if (!databaseConfigured) return res.json({ user: null, configured: false })
  try {
    const user = await currentUser(req)
    res.json({ user: profilePayload(user), configured: true })
  } catch {
    res.status(503).json({ user: null, configured: true, error: 'The database is unavailable.' })
  }
})
app.post('/api/auth/signup', async (req, res) => {
  if (!databaseConfigured) return res.status(503).json({ error: 'The managed database is not configured.' })
  const { email, password, display_name: rawName, role } = asObject(req.body)
  const displayName = typeof rawName === 'string' ? rawName.trim() : ''
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !displayName || displayName.length < 2 || displayName.length > 80 || typeof password !== 'string' || password.length < 8 || password.length > 72 || !['brand', 'creator'].includes(role)) {
    return res.status(400).json({ error: 'Enter a valid name, email, role and password of 8 to 72 characters.' })
  }
  try {
    const id = randomUUID()
    const passwordHash = await hashPassword(password)
    await query(
      'INSERT INTO profiles (id, display_name, email, password_hash, role, skills, tools) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, displayName, normalizedEmail, passwordHash, role, JSON.stringify([]), JSON.stringify([])],
    )
    const token = await createSession(id)
    setSessionCookie(req, res, token)
    res.status(201).json({ user: { id, email: normalizedEmail, display_name: displayName, role } })
  } catch (error) {
    const response = errorResponse(error)
    res.status(response.status).json({ error: response.status === 409 ? 'An account with that email already exists.' : response.message })
  }
})
app.post('/api/auth/login', async (req, res) => {
  if (!databaseConfigured) return res.status(503).json({ error: 'The managed database is not configured.' })
  const { email, password, role: requestedRole } = asObject(req.body)
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const selectedRole = ['creator', 'brand', 'admin'].includes(String(requestedRole)) ? String(requestedRole) : ''
  if (!normalizedEmail || typeof password !== 'string') return res.status(400).json({ error: 'Enter your email and password.' })
  try {
    const result = await query<DbRow>('SELECT id, email, display_name, role, password_hash FROM profiles WHERE email = ? AND is_active = 1 LIMIT 1', [normalizedEmail])
    const profile = result.rows[0]
    if (!profile || !(await verifyPassword(password, String(profile.password_hash)))) return res.status(401).json({ error: 'Email or password is incorrect.' })
    if (selectedRole && profile.role !== selectedRole) return res.status(403).json({ error: `This account is not registered as ${selectedRole}.` })
    const token = await createSession(String(profile.id))
    setSessionCookie(req, res, token)
    res.json({ user: { id: profile.id, email: profile.email, display_name: profile.display_name, role: profile.role } })
  } catch {
    res.status(503).json({ error: 'Could not sign in right now.' })
  }
})
app.post('/api/auth/logout', async (req, res) => {
  try { await destroySession(cookie(req, 'cm_session')) } catch { /* Always clear the browser cookie. */ }
  clearSessionCookie(req, res)
  res.json({ ok: true })
})

app.get('/api/data/:table', async (req, res) => {
  const tableName = String(req.params.table)
  if (!databaseConfigured) return res.status(503).json({ data: [], error: 'The managed database is not configured.' })
  if (!allowedTables.has(tableName)) return res.status(404).json({ data: [], error: 'Unknown data collection.' })
  const table = tableName as DataTable
  try {
    const user = await currentUser(req)
    const filters = requestFilters(req)
    const compiled = compileFilters(filters, publicColumns[table], 't')
    const clauses = [...compiled.clauses]
    const params = [...compiled.params]
    if (table === 'profiles') {
      if (user?.role !== 'admin') {
        clauses.push(user ? '(t.role = \'creator\' OR t.id = ?)' : "t.role = 'creator'")
        if (user) params.push(user.user_id)
      }
      clauses.push('t.is_active = 1')
    } else if (table === 'portfolio_items') {
      clauses.push('EXISTS (SELECT 1 FROM profiles portfolio_owner WHERE portfolio_owner.id = t.creator_id AND portfolio_owner.is_active = 1)')
    } else if (table === 'creative_briefs') {
      if (!user) throw new ApiError(401, 'Sign in to view creative briefs.')
      if (user.role === 'brand') { clauses.push('t.brand_id = ?'); params.push(user.user_id) }
      else if (user.role === 'creator') {
        clauses.push('EXISTS (SELECT 1 FROM project_invitations access_inv WHERE access_inv.brief_id = t.id AND access_inv.creator_id = ? AND access_inv.status <> ?)')
        params.push(user.user_id, 'declined')
      } else if (user.role !== 'admin') throw new ApiError(403, 'You are not authorized to view briefs.')
    } else if (table === 'project_invitations') {
      if (!user) throw new ApiError(401, 'Sign in to view project invitations.')
      if (user.role !== 'admin') { clauses.push('(t.brand_id = ? OR t.creator_id = ?)'); params.push(user.user_id, user.user_id) }
    } else if (table === 'project_messages') {
      if (!user) throw new ApiError(401, 'Sign in to view project messages.')
      clauses.push('EXISTS (SELECT 1 FROM project_invitations message_inv WHERE message_inv.id = t.invitation_id AND (message_inv.brand_id = ? OR message_inv.creator_id = ?) AND message_inv.status IN (?, ?, ?))')
      params.push(user.user_id, user.user_id, 'accepted', 'in_progress', 'completed')
    }
    const sql = `SELECT ${selectedColumns(table, req.query.select)} FROM \`${table}\` t${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY ${orderClause(table, req.query.order)} LIMIT 200`
    const result = await query<DbRow>(sql, params)
    const rows = table === 'project_invitations' ? await attachInvitationRelations(result.rows, user) : result.rows
    res.json({ data: rows, error: null })
  } catch (error) {
    const response = errorResponse(error)
    res.status(response.status).json({ data: [], error: response.message })
  }
})
app.post('/api/data/:table', async (req, res) => runMutation(req, res, 'insert'))
app.put('/api/data/:table', async (req, res) => runMutation(req, res, 'upsert'))
app.patch('/api/data/:table', async (req, res) => runMutation(req, res, 'update'))
app.delete('/api/data/:table', async (req, res) => runMutation(req, res, 'delete'))

async function runMutation(req: express.Request, res: express.Response, operation: 'insert' | 'upsert' | 'update' | 'delete') {
  if (!databaseConfigured) return res.status(503).json({ data: null, error: 'The managed database is not configured.' })
  const tableName = String(req.params.table)
  if (!allowedTables.has(tableName)) return res.status(404).json({ data: null, error: 'Unknown data collection.' })
  try {
    const user = await currentUser(req)
    if (!user) throw new ApiError(401, 'Sign in before changing records.')
    const table = tableName as DataTable
    const value = asObject(req.body?.value)
    const filters = requestFilters(req)
    const data = await mutateRecord(table, operation, value, filters, user)
    res.status(operation === 'insert' ? 201 : 200).json({ data, error: null })
  } catch (error) {
    const response = errorResponse(error)
    res.status(response.status).json({ data: null, error: response.message })
  }
}

async function mutateRecord(table: DataTable, operation: 'insert' | 'upsert' | 'update' | 'delete', value: Record<string, any>, filters: Filter[], user: SessionUser) {
  const requestedId = filters.find((filter) => filter.column === 'id')?.value
  if (table === 'profiles') {
    if (operation !== 'upsert' && operation !== 'update') throw new ApiError(405, 'Profiles can only be updated by their owner.')
    if ((value.id && value.id !== user.user_id) || (requestedId && requestedId !== user.user_id)) throw new ApiError(403, 'You can only update your own profile.')
    const fields = cleanFields(value, ['display_name', 'bio', 'specialization', 'skills', 'tools', 'avatar_url', 'company_name', 'company_website'], 'profiles')
    if (fields.length) {
      await query(`UPDATE profiles SET ${fields.map(([key]) => `${quoteIdentifier(key)} = ?`).join(', ')} WHERE id = ?`, [...fields.map(([, item]) => item), user.user_id])
    }
    const result = await query<DbRow>(`SELECT ${publicColumns.profiles.map(quoteIdentifier).join(', ')} FROM profiles WHERE id = ? LIMIT 1`, [user.user_id])
    return profilePayload(result.rows[0])
  }

  if (table === 'portfolio_items') {
    if (user.role !== 'creator') throw new ApiError(403, 'Only creators can manage portfolio items.')
    if (operation === 'insert') {
      if (value.creator_id && value.creator_id !== user.user_id) throw new ApiError(403, 'Portfolio items must belong to your account.')
      const fields = cleanFields(value, writableColumns.portfolio_items, table)
      if (!fields.some(([key]) => key === 'title') || !fields.some(([key]) => key === 'media_type')) throw new ApiError(400, 'A title and content type are required.')
      return insertRecord(table, { id: randomUUID(), creator_id: user.user_id, ...Object.fromEntries(fields) })
    }
    if (operation === 'delete') {
      if (!requestedId) throw new ApiError(400, 'An item ID is required.')
      await query('DELETE FROM portfolio_items WHERE id = ? AND creator_id = ?', [requestedId, user.user_id])
      return null
    }
    if (operation === 'update') {
      if (!requestedId) throw new ApiError(400, 'An item ID is required.')
      return updateRecord(table, requestedId, user.user_id, 'creator_id', cleanFields(value, writableColumns.portfolio_items, table))
    }
    throw new ApiError(405, 'This portfolio operation is not supported.')
  }

  if (table === 'creative_briefs') {
    if (user.role !== 'brand' && user.role !== 'admin') throw new ApiError(403, 'Only brand accounts can manage creative briefs.')
    if (user.role !== 'admin' && (value.brand_id && value.brand_id !== user.user_id)) throw new ApiError(403, 'Briefs must belong to your account.')
    if (operation === 'insert') {
      if (user.role !== 'brand') throw new ApiError(403, 'Admin accounts cannot create briefs on behalf of a brand.')
      const fields = cleanFields(value, writableColumns.creative_briefs, table)
      for (const required of ['title', 'description', 'deliverables', 'content_type']) if (!fields.some(([key]) => key === required)) throw new ApiError(400, 'Complete the required brief fields.')
      return insertRecord(table, { id: randomUUID(), brand_id: user.user_id, status: 'open', ...Object.fromEntries(fields) })
    }
    if (operation === 'update') {
      if (!requestedId || user.role !== 'brand') throw new ApiError(403, 'Only a brand owner can update a brief.')
      return updateRecord(table, requestedId, user.user_id, 'brand_id', cleanFields(value, writableColumns.creative_briefs, table))
    }
    if (operation === 'delete') {
      if (!requestedId || user.role !== 'brand') throw new ApiError(403, 'Only a brand owner can delete a brief.')
      await query('DELETE FROM creative_briefs WHERE id = ? AND brand_id = ?', [requestedId, user.user_id])
      return null
    }
    throw new ApiError(405, 'This brief operation is not supported.')
  }

  if (table === 'project_invitations') {
    if (operation === 'insert') {
      if (user.role !== 'brand') throw new ApiError(403, 'Only brands can invite creators.')
      if (value.brand_id && value.brand_id !== user.user_id) throw new ApiError(403, 'Invitations must be sent from your account.')
      if (typeof value.creator_id !== 'string' || typeof value.brief_id !== 'string') throw new ApiError(400, 'Choose a creator and a saved brief.')
      const brief = await query<DbRow>('SELECT id FROM creative_briefs WHERE id = ? AND brand_id = ? LIMIT 1', [value.brief_id, user.user_id])
      const creator = await query<DbRow>("SELECT id FROM profiles WHERE id = ? AND role = 'creator' AND is_active = 1 LIMIT 1", [value.creator_id])
      if (!brief.rows[0] || !creator.rows[0]) throw new ApiError(403, 'The selected brief or creator is unavailable.')
      return insertRecord(table, { id: randomUUID(), brand_id: user.user_id, creator_id: value.creator_id, brief_id: value.brief_id, status: 'pending' })
    }
    if (operation === 'update') {
      if (!requestedId || typeof value.status !== 'string') throw new ApiError(400, 'An invitation ID and status are required.')
      if (user.role !== 'brand' && user.role !== 'creator') throw new ApiError(403, 'Only invitation participants can change a status.')
      const current = await query<DbRow>('SELECT id, brand_id, creator_id, status FROM project_invitations WHERE id = ? LIMIT 1', [requestedId])
      const invitation = current.rows[0]
      if (!invitation) throw new ApiError(404, 'Invitation not found.')
      const isCreator = user.user_id === invitation.creator_id && user.role === 'creator'
      const isBrand = user.user_id === invitation.brand_id && user.role === 'brand'
      if (isCreator && invitation.status === 'pending' && ['accepted', 'declined'].includes(value.status)) {
        await query('UPDATE project_invitations SET status = ?, response_at = UTC_TIMESTAMP(3) WHERE id = ?', [value.status, requestedId])
      } else if (isBrand && ((invitation.status === 'accepted' && value.status === 'in_progress') || (invitation.status === 'in_progress' && value.status === 'completed'))) {
        await query('UPDATE project_invitations SET status = ?, response_at = UTC_TIMESTAMP(3) WHERE id = ?', [value.status, requestedId])
      } else {
        throw new ApiError(403, 'That invitation status transition is not allowed for your account.')
      }
      const updated = await query<DbRow>('SELECT * FROM project_invitations WHERE id = ? LIMIT 1', [requestedId])
      const enriched = await attachInvitationRelations(updated.rows, user)
      return enriched[0] ?? null
    }
    throw new ApiError(405, 'This invitation operation is not supported.')
  }

  if (table === 'project_messages') {
    if (operation !== 'insert' || (user.role !== 'brand' && user.role !== 'creator')) throw new ApiError(403, 'Only project participants can send messages.')
    if (typeof value.invitation_id !== 'string' || typeof value.body !== 'string' || !value.body.trim()) throw new ApiError(400, 'A project message is required.')
    const invitation = await query<DbRow>('SELECT id FROM project_invitations WHERE id = ? AND (brand_id = ? OR creator_id = ?) AND status IN (?, ?, ?) LIMIT 1', [value.invitation_id, user.user_id, user.user_id, 'accepted', 'in_progress', 'completed'])
    if (!invitation.rows[0]) throw new ApiError(403, 'Accept the invitation before starting project communication.')
    return insertRecord(table, { id: randomUUID(), invitation_id: value.invitation_id, sender_id: user.user_id, body: value.body.trim().slice(0, 2000) })
  }
  throw new ApiError(404, 'Unknown data collection.')
}

async function insertRecord(table: Exclude<DataTable, 'profiles'>, values: Record<string, unknown>) {
  const entries = Object.entries(values)
  const columns = entries.map(([key]) => key)
  await query(`INSERT INTO \`${table}\` (${columns.map(quoteIdentifier).join(', ')}) VALUES (${placeholders(columns.length)})`, entries.map(([, value]) => value))
  const id = String(values.id)
  const result = await query<DbRow>(`SELECT ${publicColumns[table].map(quoteIdentifier).join(', ')} FROM \`${table}\` WHERE id = ? LIMIT 1`, [id])
  return result.rows[0] ?? null
}

async function updateRecord(table: 'portfolio_items' | 'creative_briefs', id: string, ownerId: string, ownerColumn: 'creator_id' | 'brand_id', fields: readonly (readonly [string, any])[]) {
  if (fields.length) await query(`UPDATE \`${table}\` SET ${fields.map(([key]) => `${quoteIdentifier(key)} = ?`).join(', ')} WHERE id = ? AND ${quoteIdentifier(ownerColumn)} = ?`, [...fields.map(([, value]) => value), id, ownerId])
  const result = await query<DbRow>(`SELECT ${publicColumns[table].map(quoteIdentifier).join(', ')} FROM \`${table}\` WHERE id = ? AND ${quoteIdentifier(ownerColumn)} = ? LIMIT 1`, [id, ownerId])
  if (!result.rows[0]) throw new ApiError(404, 'Record not found.')
  return result.rows[0]
}

async function attachInvitationRelations(rows: DbRow[], user: SessionUser | null = null) {
  if (!rows.length) return rows
  const briefIds = [...new Set(rows.map((row) => String(row.brief_id)))]
  const brandIds = [...new Set(rows.map((row) => String(row.brand_id)))]
  const creatorAccess = user?.role === 'creator'
    ? ' AND EXISTS (SELECT 1 FROM project_invitations access_inv WHERE access_inv.brief_id = creative_briefs.id AND access_inv.creator_id = ? AND access_inv.status <> ?)'
    : ''
  const briefParams: unknown[] = [...briefIds]
  if (user?.role === 'creator') briefParams.push(user.user_id, 'declined')
  const briefs = await query<DbRow>(
    `SELECT id, title, description, target_audience, deliverables, content_type, style_direction, platform, budget, deadline, status, created_at, updated_at FROM creative_briefs WHERE creative_briefs.id IN (${placeholders(briefIds.length)})${creatorAccess}`,
    briefParams,
  )
  const brands = await query<DbRow>(
    `SELECT ${publicColumns.profiles.map(quoteIdentifier).join(', ')} FROM profiles WHERE id IN (${placeholders(brandIds.length)})`,
    brandIds,
  )
  const briefMap = new Map(briefs.rows.map((row) => [String(row.id), row]))
  const brandMap = new Map(brands.rows.map((row) => [String(row.id), row]))
  return rows.map((row) => ({ ...row, creative_briefs: briefMap.get(String(row.brief_id)) ?? null, profiles: brandMap.get(String(row.brand_id)) ?? null }))
}

app.post('/api/functions/admin-create-user', async (req, res) => {
  if (!databaseConfigured) return res.status(503).json({ error: 'The managed database is not configured.' })
  try {
    const user = await currentUser(req)
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' })
    const body = asObject(req.body)
    const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const role = body.role
    const companyName = typeof body.company_name === 'string' ? body.company_name.trim().slice(0, 100) : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2 || displayName.length > 80 || password.length < 8 || password.length > 72 || !['creator', 'brand'].includes(role)) {
      return res.status(400).json({ error: 'Enter a valid name, email, account type and password.' })
    }
    const id = randomUUID()
    const passwordHash = await hashPassword(password)
    await query(
      'INSERT INTO profiles (id, display_name, email, password_hash, role, skills, tools, company_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, displayName, email, passwordHash, role, JSON.stringify([]), JSON.stringify([]), companyName],
    )
    res.status(201).json({ ok: true, user: { id, display_name: displayName, role } })
  } catch (error) {
    const response = errorResponse(error)
    res.status(response.status).json({ error: response.status === 409 ? 'An account with that email already exists.' : response.message })
  }
})

app.post('/api/admin/assignments', async (req, res) => {
  if (!databaseConfigured) return res.status(503).json({ data: null, error: 'The managed database is not configured.' })
  try {
    if (req.get('X-Requested-With') !== 'CreatorHub') throw new ApiError(403, 'The assignment request could not be verified.')
    const user = await currentUser(req)
    if (!user || user.role !== 'admin' || Number(user.is_active) !== 1) throw new ApiError(403, 'Admin access required.')

    const body = asObject(req.body)
    const briefId = typeof body.brief_id === 'string' ? body.brief_id : ''
    const creatorId = typeof body.creator_id === 'string' ? body.creator_id : ''
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidPattern.test(briefId) || !uuidPattern.test(creatorId)) throw new ApiError(400, 'Choose a valid open brief and Creator.')

    const briefResult = await query<DbRow>(
      "SELECT b.id, b.brand_id, b.status FROM creative_briefs b JOIN profiles brand ON brand.id = b.brand_id WHERE b.id = ? AND brand.role = 'brand' AND brand.is_active = 1 LIMIT 1",
      [briefId],
    )
    const brief = briefResult.rows[0]
    if (!brief) throw new ApiError(404, 'Open brief not found.')
    if (brief.status !== 'open') throw new ApiError(409, 'Only open briefs can be assigned.')

    const creatorResult = await query<DbRow>("SELECT id FROM profiles WHERE id = ? AND role = 'creator' AND is_active = 1 LIMIT 1", [creatorId])
    if (!creatorResult.rows[0]) throw new ApiError(404, 'Active Creator not found.')

    try {
      const invitation = await insertRecord('project_invitations', {
        id: randomUUID(),
        brand_id: String(brief.brand_id),
        creator_id: creatorId,
        brief_id: briefId,
        status: 'pending',
      })
      return res.status(201).json({ data: invitation, error: null })
    } catch (error) {
      if ((error as any)?.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'This Creator already has an invitation for this brief.')
      throw error
    }
  } catch (error) {
    const response = errorResponse(error)
    return res.status(response.status).json({ data: null, error: response.message })
  }
})

app.use(express.static(distPath))
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health' || req.path === '/manus-routes.json') return next()
  if (!indexHtml) return next()
  res.status(200).type('html').send(indexHtml)
})
app.listen(port, '0.0.0.0', () => console.log(`CreatorHub AI MySQL API listening on ${port}; database ${databaseConfigured ? 'configured' : 'not configured'}`))
