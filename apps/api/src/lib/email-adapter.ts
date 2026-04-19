/**
 * Email adapter — provider-agnostic outbound email sending.
 *
 * Provider selection via EMAIL_PROVIDER env var:
 *   'smtp'    — uses SMTP_HOST/PORT/USER/PASS (Nodemailer)
 *   'sendgrid'— uses SENDGRID_API_KEY (Nodemailer with SendGrid transport)
 *
 * Falls back to mock (console log) when credentials are missing.
 */

import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

interface SendEmailOptions {
  to: string
  from?: string
  subject: string
  html: string
  replyTo?: string
}

function buildTransporter(): Transporter | null {
  const provider = process.env.EMAIL_PROVIDER ?? 'smtp'

  if (provider === 'sendgrid') {
    const apiKey = process.env.SENDGRID_API_KEY
    if (!apiKey) return null
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: apiKey },
    })
  }

  // Default: SMTP
  const host = process.env.SMTP_HOST
  if (!host) return null

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export async function sendEmail(opts: SendEmailOptions): Promise<string> {
  const { to, from, subject, html, replyTo } = opts
  const defaultFrom = process.env.EMAIL_FROM ?? 'noreply@homewardpartners.com'

  const transporter = buildTransporter()
  if (!transporter) {
    console.log(`[email-adapter] MOCK EMAIL → ${to}: "${subject}"`)
    return 'mock-email-id'
  }

  const info = await transporter.sendMail({
    from: from ?? defaultFrom,
    to,
    subject,
    html,
    replyTo,
  })

  console.log(`[email-adapter] Email sent → ${to}, id: ${info.messageId}`)
  return info.messageId as string
}
