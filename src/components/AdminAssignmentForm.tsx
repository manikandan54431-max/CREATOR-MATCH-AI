import { FormEvent, useMemo, useState } from 'react'
import { ArrowRight, Clock3, Send } from 'lucide-react'
import { api } from '../lib/api'
import './AdminAssignmentForm.css'

type AdminUser = {
  id: string
  display_name: string
  role: string
  is_active?: boolean | number
  company_name?: string
  specialization?: string
}

type AdminBrief = {
  id: string
  brand_id: string
  title: string
  status?: string
}

type Props = {
  users: AdminUser[]
  briefs: AdminBrief[]
  loading: boolean
  onSuccess: () => void | Promise<void>
  notify: (message: string) => void
}

export default function AdminAssignmentForm({ users, briefs, loading, onSuccess, notify }: Props) {
  const [briefId, setBriefId] = useState('')
  const [creatorId, setCreatorId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const openBriefs = useMemo(() => briefs.filter((brief) => brief.status === 'open'), [briefs])
  const activeCreators = useMemo(
    () => users.filter((user) => user.role === 'creator' && (user.is_active === undefined || Number(user.is_active) === 1)),
    [users],
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!briefId || !creatorId) {
      setError('Select an open brief and an active Creator.')
      return
    }
    setBusy(true)
    try {
      const { data, error: assignmentError } = await api.admin.assignProject({ brief_id: briefId, creator_id: creatorId })
      if (assignmentError || !data) throw assignmentError || new Error('The assignment could not be created.')
      setBriefId('')
      setCreatorId('')
      notify('Pending invitation sent. The Creator must accept before work can begin.')
      await onSuccess()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The assignment could not be created. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-assignment-section" aria-labelledby="admin-assignment-title">
      <div className="admin-section-heading">
        <div>
          <div className="eyebrow"><Send size={14} /> PROJECT ASSIGNMENT</div>
          <h2 id="admin-assignment-title">Assign an open project</h2>
          <p>Choose an active Creator for an open brand brief. The Creator must accept before work begins.</p>
        </div>
      </div>
      <form className="form-card form-grid admin-assignment-form" onSubmit={submit} aria-describedby="admin-assignment-policy">
        <label htmlFor="admin-assignment-brief">Open project brief
          <select id="admin-assignment-brief" value={briefId} onChange={(event) => setBriefId(event.target.value)} required disabled={loading || busy || !openBriefs.length}>
            <option value="">Choose a brief</option>
            {openBriefs.map((brief) => {
              const brand = users.find((user) => user.id === brief.brand_id)
              return <option key={brief.id} value={brief.id}>{brand?.company_name || brand?.display_name || 'Brand'} — {brief.title}</option>
            })}
          </select>
        </label>
        <label htmlFor="admin-assignment-creator">Active Creator
          <select id="admin-assignment-creator" value={creatorId} onChange={(event) => setCreatorId(event.target.value)} required disabled={loading || busy || !activeCreators.length}>
            <option value="">Choose a Creator</option>
            {activeCreators.map((creator) => <option key={creator.id} value={creator.id}>{creator.display_name}{creator.specialization ? ` — ${creator.specialization}` : ''}</option>)}
          </select>
        </label>
        <div className="span-two admin-assignment-policy" id="admin-assignment-policy">
          <Clock3 size={16} aria-hidden="true" />
          <span>Assignment creates a <strong>pending invitation</strong>. The Creator may accept or decline; only the owning Brand can move accepted work into progress and completion.</span>
        </div>
        {loading && <p className="span-two admin-assignment-status" role="status">Loading open briefs and creators…</p>}
        {!loading && !openBriefs.length && <p className="span-two admin-assignment-status">There are no open briefs to assign yet.</p>}
        {!loading && openBriefs.length > 0 && !activeCreators.length && <p className="span-two admin-assignment-status">There are no active Creator accounts to assign yet.</p>}
        {error && <div className="span-two inline-error" role="alert">{error}</div>}
        <div className="form-actions span-two">
          <button className="button button-primary" disabled={busy || loading || !briefId || !creatorId}>
            {busy ? 'Sending invitation…' : 'Send pending invitation'} {busy ? <Clock3 size={15} /> : <ArrowRight size={15} />}
          </button>
        </div>
      </form>
    </section>
  )
}
