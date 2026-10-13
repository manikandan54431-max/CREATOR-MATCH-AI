type ChatRole = 'system' | 'user' | 'assistant'
export type LLMMessage = { role: ChatRole; content: string }
export type LiveModel = { id: string; owned_by?: string; owner?: string }
export type ChatRequest = {
  model?: string
  messages: LLMMessage[]
  response_format?: Record<string, unknown>
  max_completion_tokens?: number
  max_tokens?: number
}
export type ChatResponse = {
  choices?: Array<{ message?: { content?: unknown } }>
  error?: { message?: string } | string
}

class LLMServiceError extends Error {
  constructor(public code: string) {
    super('The AI service could not complete this request.')
    this.name = 'LLMServiceError'
  }
}

function credentials() {
  const pairs = [
    { base: process.env.BUILT_IN_FORGE_API_URL, key: process.env.BUILT_IN_FORGE_API_KEY },
    { base: process.env.MANUS_API_URL, key: process.env.MANUS_API_KEY },
  ]
  const pair = pairs.find((item) => typeof item.base === 'string' && item.base.trim() && typeof item.key === 'string' && item.key.trim())
  if (!pair) return null
  const base = pair.base!.trim().replace(/\/+$/, '').replace(/\/v1$/i, '')
  return { base: `${base}/v1`, key: pair.key! }
}

export function isLLMConfigured() {
  return Boolean(credentials())
}

let modelCache: { expiresAt: number; models: LiveModel[] } | null = null

export async function listLLMModels(): Promise<LiveModel[]> {
  if (modelCache && modelCache.expiresAt > Date.now()) return modelCache.models
  const config = credentials()
  if (!config) throw new LLMServiceError('not_configured')
  let response: Response
  try {
    response = await fetch(`${config.base}/models`, {
      headers: { Authorization: `Bearer ${config.key}` },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw new LLMServiceError((error as any)?.name === 'TimeoutError' ? 'timeout' : 'network')
  }
  const body = await response.json().catch(() => null) as { data?: unknown; error?: unknown } | null
  if (!response.ok || body?.error || !Array.isArray(body?.data)) throw new LLMServiceError(`catalog_${response.status}`)
  const models = body.data.flatMap((item: any) => typeof item?.id === 'string' ? [{ id: item.id, owned_by: item.owned_by, owner: item.owner }] : [])
  if (!models.length) throw new LLMServiceError('empty_catalog')
  modelCache = { models, expiresAt: Date.now() + 60 * 60 * 1000 }
  return models
}

export async function selectStructuredOutputModel(): Promise<string> {
  const models = await listLLMModels()
  // Use only the model explicitly verified against the live route for strict JSON Schema.
  if (!models.some((model) => model.id === 'gpt-5-mini')) throw new LLMServiceError('no_supported_structured_model')
  return 'gpt-5-mini'
}

export async function invokeLLM(request: ChatRequest): Promise<ChatResponse> {
  const config = credentials()
  if (!config) throw new LLMServiceError('not_configured')
  let response: Response
  try {
    response = await fetch(`${config.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(35_000),
    })
  } catch (error) {
    throw new LLMServiceError((error as any)?.name === 'TimeoutError' ? 'timeout' : 'network')
  }
  const body = await response.json().catch(() => null) as ChatResponse | null
  if (!response.ok || body?.error) throw new LLMServiceError(`completion_${response.status}`)
  if (!body) throw new LLMServiceError('invalid_response')
  return body
}

export function completionText(response: ChatResponse, maxChars = 8_000): string {
  const content = response.choices?.[0]?.message?.content
  let text = ''
  if (typeof content === 'string') text = content.trim()
  else if (Array.isArray(content)) {
    text = content
      .flatMap((part: any) => part?.type === 'text' && typeof part.text === 'string' ? [part.text] : [])
      .join('\n').trim()
  }
  return text.slice(0, Math.max(0, maxChars))
}
