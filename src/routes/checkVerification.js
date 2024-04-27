const { MongoClient } = require('mongodb')
const { saveVerificationProof } = require('../utils/databaseHelpers')
// const getPhotoDataAsBuffer = require('../utils/getPhotoDataAsBuffer')
// const { getVerificationInfo } = require('../utils/getVerificationInfo')
// const { publishFile } = require('nanostore-publisher')
const { getUserDiscordData } = require('../utils/discordCertHelper')
const axios = require('axios')

const {
  NANOSTORE_URL,
  SERVER_PRIVATE_KEY,
  DOJO_URL,
  DISCORD_API_ENDPOINT,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  REDIRECT_URI
} = process.env
let userData
let verificationType

module.exports = {
  type: 'post',
  path: '/checkVerification',
  summary: 'Submit KYC verification proof for the current user',
  parameters: {
    preVerifiedData: {
      accessCode: 'Code exchanged for authorization token from Discord'
    },
    certificateFields: {}
  },
  exampleResponse: {
    status: 'verified | notVerified'
  },
  func: async (req, res) => {
    try {
      if (!req.body.preVerifiedData || req.body.preVerifiedData === 'notVerified') {
        return res.status(400).json({
          status: 'notVerified',
          description: 'User identity has not been verified!'
        })
      }

      verificationType = req.body.preVerifiedData.verificationType

      if (req.body.preVerifiedData.verificationType === 'Discord') {
        userData = await getUserDiscordData(req.body.preVerifiedData.accessCode)
      } else if (req.body.preVerifiedData.verificationType === 'phoneNumber') {
        userData = { phoneNumber: req.body.preVerifiedData.phoneNumber }
      } else if (req.body.preVerifiedData.verificationType === 'X') {
        userData = { userName: req.body.preVerifiedData.XData.userName, profilePhoto: req.body.preVerifiedData.XData.profilePhoto }
      } else if (req.body.preVerifiedData.verificationType === 'email') {
        userData = { email: req.body.preVerifiedData.email }
      }

      return res.status(200).json({
        status: 'verified',
        description: 'User identity is verified!',
        verifiedAttributes: userData // userData is whatever is returned by helper function
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({
        status: 'error',
        code: 'ERR_INTERNAL',
        description: 'An internal error has occurred.'
      })
    }
  },
  verificationType
}
