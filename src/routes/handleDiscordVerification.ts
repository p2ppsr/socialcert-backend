require('dotenv').config()
const axios = require('axios')
import { Response } from 'express';
import { CertifierRoute } from "../CertifierServer";
import { AuthRequest } from '@bsv/auth-express-middleware'
import { writeVerifiedAttributes } from '../utils/databaseHelpers'
const DISCORD_API_ENDPOINT = process.env.DISCORD_API_ENDPOINT as string
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID as string
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET as string
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI as string

export const checkDiscordVerification: CertifierRoute = {
  type: 'post',
  path: '/handleDiscordVerification',
  summary: 'Submit KYC verification proof for the current user',
  parameters: {
    email: {
      email: 'Code exchanged for authorization token from Discord' // TODO: Write docuentation
    },
    certificateFields: {}
  },
  exampleResponse: {
    status: 'verified | notVerified'
  },
  func: async (req: AuthRequest, res: Response) => {
    if (req.body.funcAction === 'getDiscordData') {
      const userData = await getUserDiscordData(req, res)
      await writeVerifiedAttributes(
                  req.auth.identityKey,
                  {
                    userName: userData.userName,
                    profilePhoto: userData.profilePhoto
                  }
                )
    } else if (req.body.funcAction === 'verifyCode') {
    }
  }
}

async function getUserDiscordData (req: AuthRequest, res: Response) {
  const data = new URLSearchParams({
    grant_type: 'authorization_code',
    code: req.body.accessCode,
    redirect_uri: DISCORD_REDIRECT_URI

  })

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  }

  if (!data) {
    return res.status(400).json({
      status: 'notVerified',
      description: 'User identity has not been verified!'
    })
  }

  const authResponse = await axios.post(`${DISCORD_API_ENDPOINT}/oauth2/token`, data, {
    headers: headers,
    auth: {
      username: DISCORD_CLIENT_ID,
      password: DISCORD_CLIENT_SECRET
    }
    
  })

  const access_token = authResponse.data.access_token;

  const dataResponse = await axios.get(`${DISCORD_API_ENDPOINT}/oauth2/@me`, { headers: { Authorization: `Bearer ${access_token}` } })

  if (!dataResponse || dataResponse.status != 200) {
    return res.status(400).json({ // 204 might be better
      status: 'notVerified',
      description: 'User identity has not been verified!'
    })
  }

  const userData  = {
    userName: dataResponse.data.user.username,
    profilePhoto: `https://cdn.discordapp.com/avatars/${dataResponse.data.user.id}/${dataResponse.data.user.avatar}.png`
  }

  return userData as any

}

