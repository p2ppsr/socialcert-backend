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
    accessCode: { type: 'string' },
    funcAction: { type: 'string' }
  },
  exampleResponse: {
    status: 'verified | notVerified'
  },
  func: async (req: AuthRequest, res: Response) => {
    console.log(`INSIDE HANDLE DISCORD VERIFICATION`)
    
    try {
      if (req.body.funcAction === 'getDiscordData') {
        console.log("Processing getDiscordData action");
        return await getUserDiscordData(req, res);
      } else if (req.body.funcAction === 'verifyCode') {
        console.log("Processing verifyCode action - not yet implemented");
        return res.status(501).json({
          status: 'notImplemented',
          message: 'This functionality is not yet implemented'
        });
      } else {
        console.log("Unknown funcAction:", req.body.funcAction);
        return res.status(400).json({
          status: 'error',
          message: 'Invalid funcAction specified'
        });
      }
    } catch (error) {
      console.error('Error in checkDiscordVerification:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}

async function getUserDiscordData(req: AuthRequest, res: Response) {
  console.log("Inside getUserDiscordData with code:", req.body.accessCode?.substring(0, 5) + "...");
  
  try {
    if (!req.body.accessCode) {
      console.log("No access code provided");
      return res.status(400).json({
        status: 'notVerified',
        description: 'No access code provided'
      });
    }
    
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      code: req.body.accessCode,
      redirect_uri: DISCORD_REDIRECT_URI
    });

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    console.log(`Requesting token from Discord API with params:`, {
      endpoint: `${DISCORD_API_ENDPOINT}/oauth2/token`,
      redirect_uri: DISCORD_REDIRECT_URI,
      client_id_length: DISCORD_CLIENT_ID?.length || 0
    });
    
    const authResponse = await axios.post(`${DISCORD_API_ENDPOINT}/oauth2/token`, data, {
      headers: headers,
      auth: {
        username: DISCORD_CLIENT_ID,
        password: DISCORD_CLIENT_SECRET
      }
    });

    const access_token = authResponse.data.access_token;
    console.log(`Access token received: ${access_token}`);
    
    console.log(`Requesting user data from Discord API`);
    const dataResponse = await axios.get(`${DISCORD_API_ENDPOINT}/oauth2/@me`, { 
      headers: { Authorization: `Bearer ${access_token}` } 
    });

    console.log(`Data Response status:`, dataResponse.status);
    
    if (!dataResponse || dataResponse.status !== 200) {
      console.log("Invalid data response:", dataResponse?.status);
      return res.status(400).json({
        status: 'notVerified',
        description: 'User identity has not been verified!'
      });
    }
    
    const userData = {
      userName: dataResponse.data.user.username,
      profilePhoto: `https://cdn.discordapp.com/avatars/${dataResponse.data.user.id}/${dataResponse.data.user.avatar}.png`
    };

    console.log(`User data processed:`, userData);
    
    await writeVerifiedAttributes(
      req.auth.identityKey,
      {
        userName: userData.userName,
        profilePhoto: userData.profilePhoto
      }
    );
    
    return res.status(200).json({
        userName: userData.userName,
        profilePhoto: userData.profilePhoto
    });

  } catch (error) {
    console.error("Error in getUserDiscordData:", error);
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
    }
    return res.status(500).json({
      status: 'error',
      description: 'Error getting user data from Discord'
    });
  }
}