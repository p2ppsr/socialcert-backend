import type { CertifierRoute } from '../CertifierServer'

// A supplied-data acknowledgement is not external account verification.
export const checkVerification: CertifierRoute = {
  type: 'post', path: '/checkVerification',
  summary: 'Legacy route; use family-specific provider verification.',
  exampleResponse: { status: 'error', code: 'ERR_UNSUPPORTED' },
  func: async (_req, res) => res.status(410).json({
    status: 'error', code: 'ERR_UNSUPPORTED',
    description: 'Use the Email, X or Discord verification flow. Supplied account data is not verification.'
  })
}
