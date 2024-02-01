// const { MongoClient } = require('mongodb')
const { saveVerificationProof } = require('../utils/databaseHelpers')
const getPhotoDataAsBuffer = require('../utils/getPhotoDataAsBuffer')
const { getVerificationInfo } = require('../utils/getVerificationInfo')
const { publishFile } = require('nanostore-publisher')

const {
  NANOSTORE_URL,
  SERVER_PRIVATE_KEY,
  DOJO_URL
} = process.env

module.exports = {
  type: 'post',
  path: '/checkVerification',
  summary: 'Submit KYC verification proof for the current user',
  parameters: {
    verificationId: '',
    certificateFields: {}
  },
  exampleResponse: {
    status: 'verified | notVerified'
  },
  func: async (req, res) => {
    try {
      if (!req.body.preVerifiedData || !req.body.preVerifiedData.verificationId || req.body.preVerifiedData === 'notVerified') {
        return res.status(400).json({ // 204 might be better
          status: 'notVerified',
          description: 'User identity has not been verified!'
        })
      }

      // Validate the verificationId using the Persona API
      const body = await getVerificationInfo(req.body.preVerifiedData.verificationId)

      // Get the inquiry information and validate the attributes
      if (body && body.included && body.included[0].attributes.status === 'passed') {
        if (req.body.certificateFields.firstName === body.included[0].attributes['name-first'] &&
          req.body.certificateFields.lastName === body.included[0].attributes['name-last']) {
          // Save proof of verification for the given identity
          const expirationDate = body.included[0].attributes['expiration-date']
          await saveVerificationProof(req.authrite.identityKey, req.body.preVerifiedData.verificationId, expirationDate)

          // Download selfie photo data
          const selfiePhotoBuffer = await getPhotoDataAsBuffer(body.included[0].attributes['selfie-photo-url'])

          // Calculate when the profile photo hosting commitment should expire in minutes
          const retentionPeriod = Math.floor((new Date(expirationDate) - new Date()) / (1000 * 60))

          // Publish the profile photo to NanoStore
          const uploadResult = await publishFile({
            config: {
              nanostoreURL: NANOSTORE_URL,
              clientPrivateKey: SERVER_PRIVATE_KEY,
              dojoURL: DOJO_URL
            },
            file: {
              dataAsBuffer: selfiePhotoBuffer,
              size: selfiePhotoBuffer.length,
              type: 'image/jpeg'
            },
            retentionPeriod
          })

          if (!uploadResult) {
            return res.status(400).json({
              status: 'notVerified',
              description: 'Failed to upload profile photo!'
            })
          }

          return res.status(200).json({
            status: 'verified',
            description: 'User identity is verified!',
            expirationDate: body.included[0].attributes['expiration-date'],
            verifiedAttributes: {
              ...req.body.certificateFields,
              profilePhoto: uploadResult.hash
            }
          })
        }
      }

      return res.status(400).json({ // 204 might be better
        status: 'notVerified',
        description: 'User identity has not been verified!'
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
