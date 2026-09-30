import twilio from 'twilio'
import RequestClient from 'twilio/lib/base/RequestClient'
import type { CertifierRoute } from '../CertifierServer'
import { certificateType } from '../certificates/emailcert'
import { PROVIDER_TIMEOUT_MS, validAttributes } from '../certifier'
import { writeVerifiedAttributes } from '../utils/databaseHelpers'
import { requireSubject, requireString, respondError, RouteError } from '../utils/routeErrors'

const defaultProvider = () => twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, { httpClient: new RequestClient({ timeout: PROVIDER_TIMEOUT_MS }) })

export function createEmailVerification(dependencies = { provider: defaultProvider, writeVerifiedAttributes }): CertifierRoute {
  return {
    type: 'post', path: '/handleEmailVerification', summary: 'Verify access to a mailbox.',
    exampleResponse: { verificationStatus: true, certType: certificateType },
    func: async (req, res) => {
      try {
        const subject = requireSubject(req)
        const action = req.body?.funcAction
        if (action !== 'sendEmail' && action !== 'verifyCode') throw new RouteError(400, 'ERR_ACTION', 'Choose a supported Email action.')
        const email = requireString(action === 'sendEmail' ? req.body.email : req.body.verifyEmail, 'email address', 254)
        if (!validAttributes(certificateType, { email })) throw new RouteError(400, 'ERR_INPUT', 'A valid email address is required.')
        const service = dependencies.provider().verify.v2.services(process.env.TWILIO_SERVICE_SID)
        if (action === 'sendEmail') {
          const result = await service.verifications.create({ to: email, channel: 'email' })
          if (result.status !== 'pending' || result.to !== email) throw new RouteError(502, 'ERR_DELIVERY', 'The provider did not accept email delivery. Try again.')
          return res.status(200).json({ emailSentStatus: true, sentEmail: email })
        }
        const code = requireString(req.body.verificationCode, 'verification code', 16)
        const result = await service.verificationChecks.create({ to: email, code })
        if (result.status !== 'approved' || result.to !== email) return res.status(200).json({ verificationStatus: false })
        await dependencies.writeVerifiedAttributes(subject, certificateType, { email })
        return res.status(200).json({ verificationStatus: true, certType: certificateType })
      } catch (error) { return respondError(res, error) }
    }
  }
}

export const checkEmailVerification = createEmailVerification()
