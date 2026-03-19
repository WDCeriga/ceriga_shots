import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const EMAIL_FROM = process.env.EMAIL_FROM || 'Ceriga Shots <onboarding@resend.dev>'

export function isEmailConfigured(): boolean {
  return resend != null
}

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.warn('[email] Resend not configured — skipping verification email to', email)
    return { ok: false, error: 'Email service not configured' }
  }

  const verifyUrl = `${APP_URL}/api/auth/verify-email/confirm?token=${encodeURIComponent(token)}`

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: 'Verify your email — Ceriga Shots',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; color: #111; margin-bottom: 16px;">
          Verify your email
        </h1>
        <p style="font-size: 15px; line-height: 1.6; color: #444; margin-bottom: 24px;">
          Thanks for signing up for Ceriga Shots. Click the button below to verify your email address and start generating product content.
        </p>
        <a
          href="${verifyUrl}"
          style="display: inline-block; background: #111; color: #fff; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; text-decoration: none;"
        >
          Verify Email
        </a>
        <p style="font-size: 13px; line-height: 1.5; color: #888; margin-top: 32px;">
          If you didn&rsquo;t create an account, you can safely ignore this email.
        </p>
        <p style="font-size: 12px; color: #aaa; margin-top: 24px;">
          Or copy and paste this link: <br/>
          <a href="${verifyUrl}" style="color: #888; word-break: break-all;">${verifyUrl}</a>
        </p>
      </div>
    `,
  })

  if (error) {
    console.error('[email] Failed to send verification email:', error)
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
