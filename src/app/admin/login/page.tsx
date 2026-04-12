'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      router.push('/admin/dashboard')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold font-headline text-on-surface">
            NextService
          </h1>
          <p className="text-sm text-on-surface/60 mt-1">Admin Panel</p>
        </div>

        {/* Login Card */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-on-surface mb-5">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-on-surface/70 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.replace(/[^a-zA-Z0-9@._+\-]/g, ''))}
                required
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-lg border border-outline-variant/40 bg-surface text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="admin@nextservice.gr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface/70 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-outline-variant/40 bg-surface text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <div className="bg-error-container/30 text-on-error-container text-sm px-3.5 py-2.5 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-xs text-on-surface/40 text-center mt-6">
          Access restricted to authorized administrators only.
        </p>
      </div>
    </div>
  )
}
