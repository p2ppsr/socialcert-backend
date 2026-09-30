import { emailcert } from '../certificates/emailcert'
import { xcert } from '../certificates/xcert'
import { discordcert } from '../certificates/discordcert'
import { VERIFICATION_MAX_AGE_MS } from '../certifier'
import type { WalletInterface } from '@bsv/sdk'

// Source capabilities describe supported flows; they are not provider-health proof.
export async function issuerMetadata(wallet: WalletInterface, network = process.env.BSV_NETWORK || 'main'): Promise<any> {
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  if (!/^(02|03)[0-9a-f]{64}$/i.test(publicKey) || (network !== 'main' && network !== 'test')) throw new Error('Issuer metadata unavailable')
  return {
    version: '0.1.29', sourceCommit: process.env.SOURCE_COMMIT || 'development', issuer: { publicKey, network },
    families: [
      { type: emailcert.certificateType, name: 'Email', fields: emailcert.certificateFields, enabled: true },
      { type: xcert.certificateType, name: 'X', fields: xcert.certificateFields, enabled: true },
      { type: discordcert.certificateType, name: 'Discord', fields: discordcert.certificateFields, enabled: true },
      { type: 'mffUklUzxbHr65xLohn0hRL0Tq2GjW1GYF/OPfzqJ6A=', name: 'Telephone', fields: ['phoneNumber'], enabled: false }
    ],
    revocation: { supported: false }, publication: { required: false },
    verification: { maxAgeSeconds: VERIFICATION_MAX_AGE_MS / 1000 }
  }
}
