import { createHash } from 'crypto'
import { Certificate, createNonce, MasterCertificate, Utils, verifyNonce } from '@bsv/sdk'
import type { CertifierRoute } from '../CertifierServer'
import { certificateTypes, hasExactFields, validAttributes, VERIFICATION_MAX_AGE_MS } from '../certifier'
import { beginIssuance, completeIssuance, getIssuance, findVerifiedAttributes, writeSignedCertificate } from '../utils/databaseHelpers'
import { requireString, requireSubject, respondError, RouteError } from '../utils/routeErrors'

function canonical(value: any): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function createSignCertificate(dependencies = { beginIssuance, completeIssuance, getIssuance, findVerifiedAttributes, writeSignedCertificate }): CertifierRoute {
  return {
    type: 'post', path: '/signCertificate', summary: 'Sign exactly the freshly verified account attributes.',
    exampleResponse: { certificate: {}, serverNonce: 'Base64 nonce' },
    func: async (req, res, server) => {
      try {
        const subject = requireSubject(req)
        const type = requireString(req.body?.type, 'certificate type', 128)
        const selected = Object.prototype.hasOwnProperty.call(certificateTypes, type) ? certificateTypes[type] : undefined
        if (!selected) throw new RouteError(400, 'ERR_CERT_TYPE', 'This certificate family is not enabled.')
        const { fields, masterKeyring } = req.body
        if (!hasExactFields(fields, selected.fields) || !hasExactFields(masterKeyring, selected.fields)) {
          throw new RouteError(400, 'ERR_EXPECTED_FIELDS', 'Supply exactly the required encrypted fields and field keys.')
        }
        const clientNonce = requireString(req.body.clientNonce, 'client nonce', 256)
        let nonceValid = false
        try { nonceValid = await verifyNonce(clientNonce, server.wallet, subject) } catch {}
        if (!nonceValid) throw new RouteError(400, 'ERR_NONCE', 'The client nonce is invalid. Restart certificate acquisition.')
        let decryptedFields: Record<string, string>
        try { decryptedFields = await MasterCertificate.decryptFields(server.wallet, masterKeyring, fields, subject) }
        catch { throw new RouteError(400, 'ERR_FIELDS', 'The encrypted certificate fields could not be verified.') }
        if (!validAttributes(type, decryptedFields)) throw new RouteError(400, 'ERR_FIELDS', 'The certificate fields do not match this family schema.')
        const operationId = createHash('sha256').update(canonical({ subject, type, clientNonce, fields, masterKeyring })).digest('hex')
        const previous = await dependencies.getIssuance(operationId)
        // Re-delivery of this exact completed request is not a new issuance.
        if (previous?.state === 'completed') return res.status(200).json(previous.response)
        const evidence = await dependencies.findVerifiedAttributes(subject, type)
        const observed = evidence?.verifiedAttributes
        const evidenceTime = evidence?.createdAt instanceof Date ? evidence.createdAt.getTime() : NaN
        if (evidence?.identityKey !== subject || evidence?.type !== type ||
            !validAttributes(type, observed) || !Number.isFinite(evidenceTime) ||
            evidenceTime > Date.now() || Date.now() - evidenceTime > VERIFICATION_MAX_AGE_MS ||
            !selected.fields.every(key => observed[key] === decryptedFields[key])) {
          throw new RouteError(409, 'ERR_VERIFICATION_REQUIRED', 'Verify these exact account attributes again with this wallet before acquiring the certificate.')
        }
        const operation = await dependencies.beginIssuance(operationId)
        if (operation?.state === 'completed') return res.status(200).json(operation.response)
        if (operation?.state !== 'new') throw new RouteError(409, 'ERR_ISSUANCE_PENDING', 'This acquisition is pending or its outcome is uncertain. Retry the same request later; do not assume a certificate was received.')
        const serverNonce = await createNonce(server.wallet, subject)
        const { hmac } = await server.wallet.createHmac({
          data: Utils.toArray(clientNonce + serverNonce, 'base64'), protocolID: [2, 'certificate issuance'],
          keyID: serverNonce + clientNonce, counterparty: subject
        })
        const certificate = new Certificate(type, Utils.toBase64(hmac), subject,
          (await server.wallet.getPublicKey({ identityKey: true })).publicKey,
          `${'0'.repeat(64)}.0`, fields)
        await certificate.sign(server.wallet)
        await dependencies.writeSignedCertificate(subject, certificate.serialNumber, certificate)
        const response = { certificate, serverNonce }
        await dependencies.completeIssuance(operationId, response)
        return res.status(200).json(response)
      } catch (error) { return respondError(res, error) }
    }
  }
}

export const signCertificate = createSignCertificate()
