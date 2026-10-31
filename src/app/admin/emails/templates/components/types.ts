export interface EmailCopy {
  subject: string
  heading: string
  body: string
  ctaLabel: string
  note: string
}

export interface EmailPreview {
  subject: string
  html: string
  text: string
}

/** One email as /api/admin/emails/templates describes it. */
export interface AdminEmail {
  name: string
  label: string
  audience: 'client' | 'garage' | 'account' | 'admin'
  audienceLabel: string
  trigger: string
  sentBy: 'app' | 'lambda'
  hasCta: boolean
  variables: { token: string; label: string; example: string }[]
  copy: EmailCopy
  defaults: EmailCopy
  customized: boolean
  updatedAt?: string
  updatedBy?: string
  preview?: EmailPreview
}
