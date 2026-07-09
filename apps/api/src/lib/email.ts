import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'StoreHub <onboarding@resend.dev>'

interface WelcomeEmailParams {
  to: string
  username: string
  password: string
  tenantName: string
  loginUrl: string
  createdBy: string
}

export async function sendWelcomeEmail(params: WelcomeEmailParams) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set, skipping welcome email')
    return
  }

  const { to, username, password, tenantName, loginUrl, createdBy } = params

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Tu cuenta en ${tenantName} ha sido creada`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: bold; color: #0A2540; margin-bottom: 8px;">¡Bienvenido a ${tenantName}!</h1>
          <p style="color: #425466; font-size: 16px; line-height: 1.5;">
            ${createdBy} te ha creado una cuenta. Aquí están tus datos de acceso:
          </p>

          <div style="background: #F6F9FC; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <p style="margin: 0 0 12px 0; color: #425466; font-size: 14px;">
              <strong>Usuario:</strong> ${username}
            </p>
            <p style="margin: 0 0 12px 0; color: #425466; font-size: 14px;">
              <strong>Contraseña temporal:</strong> ${password}
            </p>
            <p style="margin: 0; color: #425466; font-size: 14px;">
              <strong>Enlace de acceso:</strong><br/>
              <a href="${loginUrl}" style="color: #635BFF;">${loginUrl}</a>
            </p>
          </div>

          <div style="background: #FFF8E1; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #F59E0B;">
            <p style="margin: 0; color: #92400E; font-size: 14px;">
              ⚠️ Por seguridad, se te pedirá cambiar tu contraseña en tu primer inicio de sesión.
            </p>
          </div>

          <a href="${loginUrl}" style="display: inline-block; background: #635BFF; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 16px; margin-top: 16px;">
            Iniciar sesión
          </a>

          <p style="color: #98A6B8; font-size: 12px; margin-top: 40px; border-top: 1px solid #E3E8EE; padding-top: 20px;">
            Este correo fue enviado automáticamente por ${tenantName} a través de StoreHub.
          </p>
        </div>
      `,
    })
    console.log(`[email] Welcome email sent to ${to}`)
  } catch (error) {
    console.error('[email] Failed to send welcome email:', error)
  }
}
