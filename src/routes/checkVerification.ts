const { MongoClient } = require('mongodb')
import { Request, Response } from 'express';
import { UserData } from '../types/checkVerification'
import { CertifierRoute } from '../CertifierServer';
const axios = require('axios')

const {
  NANOSTORE_URL,
  SERVER_PRIVATE_KEY,
  WALLET_STORAGE,
  DISCORD_API_ENDPOINT,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  REDIRECT_URI
} = process.env
let userData: UserData
let verificationType

export const checkVerification: CertifierRoute = {
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
  func: async (req: Request, res: Response) => {
    try {
      if (!req.body.preVerifiedData || req.body.preVerifiedData === 'notVerified') {
        return res.status(400).json({
          status: 'notVerified',
          description: 'User identity has not been verified!'
        })
      }

      verificationType = req.body.preVerifiedData.verificationType

      if (req.body.preVerifiedData.verificationType === 'Discord') {
        // userData = await getUserDiscordData(req.body.preVerifiedData.accessCode)
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
  }
}
