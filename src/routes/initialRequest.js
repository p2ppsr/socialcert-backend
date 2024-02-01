const { certifierInitialResponse } = require('authrite-utils')

const {
  certifierPrivateKey,
  certificateType
} = require('../certifier')

/*
 * This route handles the initialRequest for the createCertificate protocol.
 * It combines the clientNonce received with the certifier's private key
 * and the certificate type to return a collection of derived cryptographic
 * values that will be used to complete the protocol.
 *
 * The next step is for the client to post to the signCertificate route.
 */
module.exports = {
  type: 'post',
  path: '/initialRequest',
  summary: 'Generate required initial values to support certificate signing. Requested as a side effect of AuthriteClient.createCertificate.',
  exampleBody: {
    clientNonce: 'CPwCcIEQnKWUShqxCI1UWOkCX+taw3lelmuedQgN8e0='
  },
  exampleResponse: {
    status: 'success',
    type: 'jVNgF8+rifnz00856b4TkThCAvfiUE4p+t/aHYl1u0c=',
    serialNonce: 'BCJDJ1Bf1nu4qrE9j27lEZLxEEQ/meWESfHuX2vGlGQ=',
    validationNonce: 'H2/nAFdua/kktwXmYBn/MMgbfE9ckT3zEB6xzKhx7EM=',
    serialNumber: 'zFpvOxvuewvvUnmE4DncNHELvlTUVs0bVOK/Z9KR3tc=',
    validationKey: 'i0P2MiTG/gt1Q0aUjAfmUp0i9vIq8YEzC5FAYPzE1PU='
  },
  func: async (req, res) => {
    try {
      const response = certifierInitialResponse({
        clientNonce: req.body.clientNonce,
        certifierPrivateKey,  
        certificateType
      })

      return res.status(200).json({
        status: 'success',
        ...response
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({
        status: 'error',
        code: 'ERR_INTERNAL',
        description: 'An internal error has occurred.'
      })
    }
  }
}
