import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret')

export interface JwtPayload {
  userId: string
  tenantId: string
  permissions: string[]
  mustChangePassword?: boolean
}

export async function signTokens(payload: JwtPayload) {
  const accessToken = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(process.env.JWT_ACCESS_EXPIRES ?? '15m')
    .sign(secret)

  const refreshToken = await new SignJWT({ userId: payload.userId, tenantId: payload.tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(process.env.JWT_REFRESH_EXPIRES ?? '7d')
    .sign(secret)

  return { accessToken, refreshToken }
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as unknown as JwtPayload
}
