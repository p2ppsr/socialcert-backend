const {
  certificateTypes,
  certifierPublicKey,
} = require('../certifier')

/*
 * This route returns the certifier's public key and certificate types.
 */
module.exports = {
  type: 'post',
  path: '/identify',
  summary: 'Identify Certifier by returning certifierPublicKey and certificateTypes.',
  exampleResponse: {
    status: 'success',
    certifierPublicKey,
    certificateTypes
  },
  func: async (req, res) => {
    try {
      return res.status(200).json({
        status: 'success',
        certifierPublicKey,
        certificateTypes
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
