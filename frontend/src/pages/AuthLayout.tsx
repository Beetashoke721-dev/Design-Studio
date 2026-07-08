import type { PropsWithChildren, ReactNode } from 'react'
import './auth.css'

export default function AuthLayout({
  title,
  subtitle,
  footer,
  children,
}: PropsWithChildren<{ title: string; subtitle: string; footer: ReactNode }>) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark" />
          <span className="auth-brand-name">Design Studio</span>
        </div>
        <div className="auth-heading">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
        <div className="auth-footer">{footer}</div>
      </div>
    </div>
  )
}
