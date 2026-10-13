export type ServiceAvailability = 'ready' | 'configuration-required'

export const integrationStatus = {
  ai: { label: 'AI brief assistant', availability: 'configuration-required' as ServiceAvailability, note: 'Connect a provider key in the server environment to enable generation.' },
  storage: { label: 'Creative storage', availability: 'configuration-required' as ServiceAvailability, note: 'Connect Cloudinary or compatible storage for durable uploads.' },
  realtime: { label: 'Real-time messages', availability: 'configuration-required' as ServiceAvailability, note: 'Socket transport is ready to be connected on the server.' },
  payments: { label: 'Payments', availability: 'configuration-required' as ServiceAvailability, note: 'Razorpay test mode is intentionally not enabled in Demo workspace.' },
}

export const saveDraft = async (payload: unknown) => {
  window.localStorage.setItem('cm-studio-draft', JSON.stringify(payload))
  return { ok: true, savedAt: new Date().toISOString(), payload }
}

export const exportStudioDocument = async () => new Promise<{ ok: boolean; url?: string }>((resolve) => {
  window.setTimeout(async () => {
    const url = `${window.location.origin}/studio?export=cm-1042`
    try { await navigator.clipboard?.writeText(url) } catch { /* clipboard access is optional in Preview */ }
    resolve({ ok: true, url })
  }, 900)
})
