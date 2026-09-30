import { emailcert } from './certificates/emailcert'
import { xcert } from './certificates/xcert'
import { discordcert } from './certificates/discordcert'

// Prospective evidence policy; no signed expiry or type/schema change.
export const VERIFICATION_MAX_AGE_MS = 15 * 60 * 1000
export const PROVIDER_TIMEOUT_MS = 10 * 1000
export const certificateTypes: Record<string, { definition: Record<string, string>, fields: string[] }> = {
  [emailcert.certificateType]: { definition: emailcert.certificateDefinition, fields: emailcert.certificateFields },
  [xcert.certificateType]: { definition: xcert.certificateDefinition, fields: xcert.certificateFields },
  [discordcert.certificateType]: { definition: discordcert.certificateDefinition, fields: discordcert.certificateFields }
}

export function hasExactFields(values: unknown, expected: string[]): values is Record<string, string> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return false
  const keys = Object.keys(values)
  return keys.length === expected.length && expected.every(key =>
    Object.prototype.hasOwnProperty.call(values, key) &&
    typeof values[key] === 'string' && values[key].trim().length > 0
  )
}

export function validAttributes(type: string, attributes: unknown): attributes is Record<string, string> {
  const family = certificateTypes[type]
  if (!family || !hasExactFields(attributes, family.fields)) return false
  if ('email' in attributes) {
    // Preserve supplied mailbox exactly: no unreviewed normalization.
    return attributes.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attributes.email)
  }
  if (attributes.userName.length > 256 || attributes.profilePhoto.length > 2048) return false
  try {
    const photo = new URL(attributes.profilePhoto)
    return photo.protocol === 'https:' && !photo.username && !photo.password
  } catch { return false }
}
