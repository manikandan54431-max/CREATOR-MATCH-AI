type ApiResult<T> = Promise<{ data: T | null; error: Error | null }>
export type AIPage = 'home' | 'discover' | 'creator' | 'auth' | 'workspace' | 'studio' | 'brief-assistant' | 'admin' | 'setup'
export type AIChatMessage = { role: 'user' | 'assistant'; content: string }
export type AIBriefDraft = { title: string; description: string; audience: string; deliverables: string[]; format: string; style: string; checklist: string[] }
const json = async (url: string, init?: RequestInit) => { const response = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Request failed'); return body }

export const api = {
  auth: {
    async getSession(): ApiResult<{ session: { user: unknown } | null; configured: boolean }> { try { const body = await json('/api/auth/session'); return { data: { session: body.user ? { user: body.user } : null, configured: body.configured === true }, error: null } } catch (error) { return { data: { session: null, configured: false }, error: error as Error } } },
    onAuthStateChange(callback: (_event: string, session: { user: unknown } | null, configured: boolean) => void) { const handler = () => { void json('/api/auth/session').then((body) => callback('SIGNED_IN', body.user ? { user: body.user } : null, body.configured === true)).catch(() => callback('SIGNED_OUT', null, false)) }; window.addEventListener('cm-auth-change', handler); return { data: { subscription: { unsubscribe: () => window.removeEventListener('cm-auth-change', handler) } } } },
    async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { display_name?: string; role?: string } } }) { try { const body = await json('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, display_name: options?.data?.display_name, role: options?.data?.role }) }); window.dispatchEvent(new Event('cm-auth-change')); return { data: { user: body.user, session: body.user ? { user: body.user } : null }, error: null } } catch (error) { return { data: { user: null, session: null }, error: error as Error } } },
    async signInWithPassword({ email, password, role }: { email: string; password: string; role?: 'creator'|'brand'|'admin' }) { try { const body = await json('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role }) }); window.dispatchEvent(new Event('cm-auth-change')); return { data: { user: body.user, session: { user: body.user } }, error: null } } catch (error) { return { data: { user: null, session: null }, error: error as Error } } },
    async signOut() { await json('/api/auth/logout', { method: 'POST' }).catch(() => undefined); window.dispatchEvent(new Event('cm-auth-change')) },
  },
  from(table: string) { return new QueryBuilder(table) },
  functions: { async invoke(name: string, options: { body?: unknown; headers?: Record<string, string> } = {}) { try { return { data: await json(`/api/functions/${name}`, { method: 'POST', body: JSON.stringify(options.body || {}) }), error: null } } catch (error) { return { data: null, error: error as Error } } } },
  ai: {
    async chat(input: { page: AIPage; message: string; history: AIChatMessage[] }): ApiResult<{ text: string }> {
      try { return { data: await json('/api/ai/chat', { method: 'POST', body: JSON.stringify(input) }), error: null } }
      catch (error) { return { data: null, error: error as Error } }
    },
    async generateBrief(idea: string): ApiResult<AIBriefDraft> {
      try { const body = await json('/api/ai/brief', { method: 'POST', body: JSON.stringify({ idea }) }); return { data: body.data as AIBriefDraft, error: null } }
      catch (error) { return { data: null, error: error as Error } }
    },
  },
  admin: {
    async assignProject(input: { brief_id: string; creator_id: string }): ApiResult<{ id: string; brief_id: string; creator_id: string; status: 'pending' }> {
      try { const body = await json('/api/admin/assignments', { method: 'POST', headers: { 'X-Requested-With': 'CreatorHub' }, body: JSON.stringify(input) }); return { data: body.data, error: null } }
      catch (error) { return { data: null, error: error as Error } }
    },
  },
}
class QueryBuilder {
  private filters: string[] = []; private params: string[] = []; private orderBy = ''; private mutation: { method: string; body?: unknown } | null = null
  constructor(private table: string) {}
  select(columns = '*') { this.params.push(`select=${encodeURIComponent(columns)}`); return this }
  eq(column: string, value: unknown) { this.filters.push(`${column}=${encodeURIComponent(String(value))}`); return this }
  in(column: string, values: unknown[]) { this.filters.push(`${column}=${encodeURIComponent(values.join(','))}`); return this }
  order(column: string, options?: { ascending?: boolean }) { this.orderBy = `&order=${encodeURIComponent(column)}:${options?.ascending === false ? 'desc' : 'asc'}`; return this }
  async maybeSingle() { const result = await this.run(); return { data: Array.isArray(result.data) ? result.data[0] || null : result.data, error: result.error } }
  insert(value: unknown) { this.mutation = { method: 'POST', body: value }; return this }
  upsert(value: unknown) { this.mutation = { method: 'PUT', body: value }; return this }
  update(value: unknown) { this.mutation = { method: 'PATCH', body: value }; return this }
  delete() { this.mutation = { method: 'DELETE' }; return this }
  then<TResult1 = { data: any; error: Error | null }, TResult2 = never>(onfulfilled?: ((value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { const result = this.mutation ? this.mutateNow() : this.run(); return result.then(onfulfilled as any, onrejected as any) }
  private async run() { try { const query = [...this.params, ...this.filters.map((f) => `filter=${f}`)].join('&') + this.orderBy; return { data: (await json(`/api/data/${this.table}?${query}`)).data || [], error: null } } catch (error) { return { data: [], error: error as Error } } }
  private async mutateNow() { const mutation = this.mutation!; try { return { data: (await json(`/api/data/${this.table}`, { method: mutation.method, body: JSON.stringify({ value: mutation.body, filters: this.filters }) })).data || null, error: null } } catch (error) { return { data: null, error: error as Error } } }
}
