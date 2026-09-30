import type { Response } from 'express'

export class RouteError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, description: string) {
    super(description)
  }
}

export function requireSubject(req: any): string {
  if (typeof req.auth?.identityKey !== 'string' || !req.auth.identityKey) {
    throw new RouteError(401, 'ERR_AUTH', 'Authenticate your wallet before continuing.')
  }
  return req.auth.identityKey
}

export function requireString(value: unknown, label: string, maximum = 2048): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new RouteError(400, 'ERR_INPUT', `A valid ${label} is required.`)
  }
  return value
}

export function respondError(res: Response, error: any): Response {
  if (error instanceof RouteError) {
    return res.status(error.statusCode).json({ status: 'error', code: error.code, description: error.message })
  }
  // Provider error config can contain tokens and credentials; never log it.
  const providerStatus = error?.response?.status ?? (typeof error?.status === 'number' ? error.status : undefined)
  if (providerStatus === 429) {
    return res.status(429).json({ status: 'error', code: 'ERR_RATE_LIMIT', description: 'Verification is temporarily limited. Wait before trying again.' })
  }
  if (providerStatus === 400 || providerStatus === 404) {
    return res.status(400).json({ status: 'error', code: 'ERR_PROVIDER_REJECTED', description: 'Verification was rejected or expired. Start verification again.' })
  }
  return res.status(503).json({ status: 'error', code: 'ERR_DEPENDENCY', description: 'Verification or storage is temporarily unavailable. Retry; if authorization expired, start verification again.' })
}
