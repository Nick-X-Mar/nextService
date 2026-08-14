'use client'

import { useState } from 'react'
import Spinner from '@/components/Spinner'

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setSaving(true)

    try {
      const res = await fetch('/api/admin/settings/change-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      })

      if (res.ok) {
        setMessage('Password updated successfully')
        setCurrentPassword('')
        setNewPassword('')
      } else {
        const data = await res.json()
        setMessage(data.error || 'Failed to update password')
      }
    } catch {
      setMessage('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold font-headline text-on-surface mb-6">Settings</h1>

      {/* Change Password */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 max-w-md">
        <h2 className="text-lg font-semibold text-on-surface mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-on-surface/70 mb-1.5">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-outline-variant/40 bg-surface text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface/70 mb-1.5">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3.5 py-2.5 rounded-lg border border-outline-variant/40 bg-surface text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          {message && (
            <p className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-error'}`}>
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-on-primary px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Spinner size="sm" />}
            {saving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
