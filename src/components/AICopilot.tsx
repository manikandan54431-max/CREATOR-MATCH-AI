import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bot, Check, ChevronDown, LockKeyhole, Send, Sparkles, X } from 'lucide-react'
import './AICopilot.css'
import { api, type AIChatMessage, type AIPage } from '../lib/api'

type Role = 'creator' | 'brand' | 'admin' | null
type Props = { authenticated: boolean; role: Role }
type Message = AIChatMessage & { id: string }

function pageForPath(pathname: string): AIPage {
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '')
  if (path === '/discover') return 'discover'
  if (path.startsWith('/creator/')) return 'creator'
  if (path === '/auth') return 'auth'
  if (path === '/workspace') return 'workspace'
  if (path === '/studio') return 'studio'
  if (path === '/brief-assistant') return 'brief-assistant'
  if (path === '/admin') return 'admin'
  if (path === '/setup') return 'setup'
  return 'home'
}

const pageCopy: Record<AIPage, { title: string; prompts: string[] }> = {
  home: { title: 'Campaign ideas, made clearer', prompts: ['Brainstorm a campaign idea', 'Write a concise creator or brand introduction'] },
  discover: { title: 'Find the right creative direction', prompts: ['What should I look for in a creator?', 'Draft a friendly first outreach message'] },
  creator: { title: 'Make your creative story stand out', prompts: ['Improve a creator bio I paste here', 'Write a portfolio caption with a clear hook'] },
  auth: { title: 'A little help getting started', prompts: ['Explain the Creator and Brand roles', 'What can I do after I sign in?'] },
  workspace: { title: 'Turn collaboration into a clear next step', prompts: ['Turn my notes into a creative brief', 'Draft an invitation message for a creator'] },
  studio: { title: 'Create the words behind the visuals', prompts: ['Write a 15-second video script', 'Create a shot list and caption', 'Suggest a stronger opening hook'] },
  'brief-assistant': { title: 'Shape a rough idea into a brief', prompts: ['Help me define the audience and deliverables', 'Suggest a sharper campaign direction'] },
  admin: { title: 'Make operations easier to navigate', prompts: ['Create a safe account-onboarding checklist', 'Suggest a clear project review workflow'] },
  setup: { title: 'Understand the project setup', prompts: ['Explain how CreatorHub stores project data', 'What does the AI Copilot send to the AI service?'] },
}

function promptsFor(page: AIPage, role: Role) {
  if (page === 'workspace' && role === 'creator') return ['Draft a polite response to a project invitation', 'Improve a portfolio description I paste here']
  if (page === 'workspace' && role === 'brand') return ['Turn my notes into a creative brief', 'Draft a creator invitation message']
  if (page === 'admin' && role !== 'admin') return ['Explain what each CreatorHub role can do', 'Suggest a fair review checklist']
  return pageCopy[page].prompts
}

export default function AICopilot({ authenticated, role }: Props) {
  const { pathname } = useLocation()
  const page = pageForPath(pathname)
  const pageInfo = pageCopy[page]
  const prompts = useMemo(() => promptsFor(page, role), [page, role])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const busyRef = useRef(false)
  const activeRequest = useRef(0)
  const currentPage = useRef(page)
  currentPage.current = page
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const signInRef = useRef<HTMLAnchorElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    activeRequest.current += 1
    busyRef.current = false
    setBusy(false)
    setMessages([])
    setDraft('')
    setError('')
    setCopiedId('')
  }, [page, authenticated, role])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, busy])

  useEffect(() => {
    if (open) {
      if (authenticated) inputRef.current?.focus()
      else signInRef.current?.focus()
    } else if (wasOpen.current) {
      triggerRef.current?.focus()
    }
    wasOpen.current = open
  }, [open, authenticated])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const content = draft.trim()
    if (!authenticated || !content || busyRef.current) return
    const requestId = ++activeRequest.current
    const requestPage = page
    const userMessageId = `${requestId}-user`
    busyRef.current = true
    setBusy(true)
    setError('')
    setDraft('')
    const priorMessages = messages.slice(-8).map(({ role: messageRole, content: messageContent }) => ({ role: messageRole, content: messageContent }))
    setMessages((current) => [...current, { id: userMessageId, role: 'user', content }])
    try {
      const { data, error: apiError } = await api.ai.chat({ page: requestPage, message: content, history: priorMessages })
      if (requestId !== activeRequest.current || currentPage.current !== requestPage) return
      if (apiError) {
        setMessages((current) => current.filter((message) => message.id !== userMessageId))
        setDraft(content)
        setError(apiError.message || 'The AI could not reply. Your prompt is still here; try again.')
        return
      }
      if (!data?.text?.trim()) {
        setMessages((current) => current.filter((message) => message.id !== userMessageId))
        setDraft(content)
        setError('The AI returned an empty answer. Your prompt is still here; try again.')
        return
      }
      setMessages((current) => [...current, { id: `${requestId}-assistant`, role: 'assistant', content: data.text.trim() }])
    } catch {
      if (requestId !== activeRequest.current || currentPage.current !== requestPage) return
      setMessages((current) => current.filter((message) => message.id !== userMessageId))
      setDraft(content)
      setError('The AI could not reply. Your prompt is still here; try again.')
    } finally {
      if (requestId === activeRequest.current) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedId(message.id)
      window.setTimeout(() => setCopiedId(''), 1600)
    } catch {
      setError('Clipboard access is unavailable. Select and copy the text instead.')
    }
  }

  return <div className="ai-copilot-root">
    {open && <section id="creatorhub-copilot" className="ai-copilot-panel" role="dialog" aria-modal="false" aria-labelledby="creatorhub-copilot-title" aria-describedby="creatorhub-copilot-privacy">
      <header className="ai-copilot-header">
        <span className="ai-copilot-mark" aria-hidden="true"><Sparkles size={17}/></span>
        <div className="ai-copilot-heading"><strong id="creatorhub-copilot-title">CreatorHub Copilot</strong><small>{pageInfo.title}</small></div>
        <button className="ai-copilot-icon" type="button" onClick={() => setOpen(false)} aria-label="Close AI Copilot"><ChevronDown size={19}/></button>
      </header>
      {!authenticated ? <div className="ai-copilot-locked">
        <span className="ai-copilot-lock" aria-hidden="true"><LockKeyhole size={21}/></span>
        <h3>Sign in to use AI</h3>
        <p>Your Copilot is available after you sign in. It uses the current page and what you choose to type—not saved profile, portfolio, brief, or invitation records.</p>
        <Link ref={signInRef} className="ai-copilot-signin" to="/auth" onClick={() => setOpen(false)}>Log in or join <span aria-hidden="true">→</span></Link>
      </div> : <>
        <div className="ai-copilot-messages" ref={listRef} aria-label="Conversation">
          {messages.length === 0 && <div className="ai-copilot-welcome"><span className="ai-copilot-bot" aria-hidden="true"><Bot size={17}/></span><p>{pageInfo.title}. Tell me what you're working on and I'll offer a draft or ideas.</p></div>}
          {messages.map((message) => <article className={`ai-copilot-message ${message.role}`} key={message.id} aria-live={message.role === 'assistant' ? 'polite' : undefined} aria-atomic={message.role === 'assistant' ? true : undefined}>
            <div className="ai-copilot-bubble">{message.content}</div>
            {message.role === 'assistant' && <button className="ai-copilot-copy" type="button" onClick={() => void copyMessage(message)} aria-label="Copy AI suggestion">{copiedId === message.id ? <Check size={13}/> : <span>Copy</span>}</button>}
          </article>)}
          {busy && <div className="ai-copilot-thinking" aria-hidden="true"><span/><span/><span/> Thinking…</div>}
        </div>
        {messages.length === 0 && <div className="ai-copilot-prompts" aria-label="Suggested prompts">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => { setDraft(prompt); inputRef.current?.focus() }}>{prompt}</button>)}</div>}
        {error && <p className="ai-copilot-error" role="alert">{error}</p>}
        <form className="ai-copilot-compose" onSubmit={submit}>
          <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Ask for an idea or draft…" aria-label="Message the AI Copilot" disabled={busy}/>
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Send message"><Send size={16}/></button>
        </form>
      </>}
      <p id="creatorhub-copilot-privacy" className="ai-copilot-privacy">When you send a message, only its text/history, page type, and verified account role are used. Saved work is not added automatically. Don’t share passwords or confidential information; AI drafts are not saved or sent.</p>
      <span className="ai-copilot-status" role="status" aria-live="polite" aria-atomic="true">{busy ? 'AI is preparing a suggestion.' : copiedId ? 'AI suggestion copied.' : ''}</span>
    </section>}
    <button ref={triggerRef} className={`ai-copilot-trigger ${open ? 'active' : ''}`} type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-controls="creatorhub-copilot" aria-label={open ? 'Close AI Copilot' : 'Open AI Copilot'}>
      {open ? <X size={18}/> : <><Sparkles size={17}/><span>Ask AI</span></>}
    </button>
  </div>
}
