import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Button({ tone = 'primary', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'quiet' | 'outline' | 'danger'; children: ReactNode }) {
  return <button className={`button button-${tone} ${className}`} {...props}>{children}</button>
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`eyebrow ${className}`}>{children}</span>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'coral' | 'green' }) {
  return <span className={`badge badge-${tone}`}><i />{children}</span>
}

export function Divider() { return <span className="divider" aria-hidden="true" /> }

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="toast" role="status"><span className="toast-mark">✓</span><span>{message}</span><button aria-label="Dismiss" onClick={onClose}>×</button></div>
}
