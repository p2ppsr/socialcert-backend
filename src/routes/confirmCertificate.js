/*
 * This route can be used to confirm that a valid certificate exists and
 * permissions required to share it with this certifier have been granted.
 * All the work happens in the authrite middleware layer:
 * - the site is configured to request its own certificates
 * - authrite automatically adds available certificates received to req.authrite.certificates
 *
 * This sample implementation returns status of 'success' if at least one certificate
 * was received and all the decrypted field values match those being confirmed.
 *
 * If no certificate was received a status of 'nocertificate' is returned.
 *
 */
module.exports = {
  type: 'post',
  path: '/confirmCertificate',
  summary: 'Confirm receipt of a valid certificate via authrite',
  parameters: {
    domain: 'Required domain value of certificate to be confirmed.',
    identity: 'Required identity value of certificate to be confirmed.'
  },
  exampleResponse: {
    status: 'success | nocertificate'
  },
  func: async (req, res) => {
    try {
      let found = false
      for (let i = 0; i < req.authrite.certificates.length; i++) {
        const cert = req.authrite.certificates[i]
        found = true
        for (const fieldName in req.body) {
          if (req.body[fieldName] !== cert.decryptedFields[fieldName]) {
            found = false
            break
          }
        }
        if (found) {
          return res.status(200).json({
            status: 'success'
          })
        }
      }

      return res.status(200).json({ // 204 would be better
        status: 'nocertificate',
        description: 'No authrite certificate received with request.'
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
