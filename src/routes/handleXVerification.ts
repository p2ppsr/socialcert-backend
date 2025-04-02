import dotenv from 'dotenv';
dotenv.config();
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import axios from 'axios';
import { getMongoClient, writeVerifiedAttributes } from '../utils/databaseHelpers';
import { AuthRequest } from '@bsv/auth-express-middleware'
import { Response } from 'express';
import { certificateType } from "../certificates/xcert";
import { CertifierRoute } from "../CertifierServer";


const {
  X_API_KEY: oauthConsumerKey,
  X_REDIRECT_URI: callbackURL,
  X_API_SECRET: consumerSecret
} = process.env;

const DB_NAME = 'x-verification';

const oauth = new OAuth({
  consumer: { key: oauthConsumerKey as string, secret: consumerSecret as string },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string: string, key: string): string {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});

interface RequestBody {
  funcAction?: string;
  oauthToken?: string;
  oauthVerifier?: string;
}

export const checkXVerification: CertifierRoute = {
  type: 'post',
  path: '/handleXVerification',
  summary: 'Submit KYC verification proof for the current user',
  parameters: {
    phoneNumber: {
      phoneNumber: 'Code exchanged for authorization token from Discord' // TODO: Write documentation
    },
    certificateFields: {}
  },
  exampleResponse: {
    status: 'verified | notVerified'
  },
  func: async (req: AuthRequest, res: Response) => {
    const body: RequestBody = req.body;
    if (body.funcAction === 'makeRequest') {
      await initialRequest(req, res);
    } else if (body.funcAction === 'getUserInfo') {
      await exchangeAccessToken(req, res);
    }
  }
};

async function initialRequest(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const oauthNonce = crypto.randomBytes(16).toString('hex');
    const oauthTimestamp = Math.floor(Date.now() / 1000);

    const additionalParams = {
      oauth_callback: callbackURL,
      oauth_nonce: oauthNonce,
      oauth_timestamp: oauthTimestamp
    };

    const oauthData = {
      url: 'https://api.twitter.com/oauth/request_token',
      method: 'POST',
      data: additionalParams
    };
    const oauthHeaders = oauth.toHeader(oauth.authorize(oauthData)) as any;

    const response = await axios.post(oauthData.url, null, {
      headers: {
        ...oauthHeaders,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const params = new URLSearchParams(response.data);
    const requestToken = params.get('oauth_token');
    const requestTokenSecret = params.get('oauth_token_secret');

    if (!requestToken || !requestTokenSecret) {
      throw new Error('Failed to retrieve OAuth tokens');
    }

    const mongoClient = await getMongoClient();
    await mongoClient.db(DB_NAME).collection('requests').insertOne({
      requestToken,
      requestTokenSecret,
      createdAt: new Date()
    });

    return res.status(200).json({ requestToken });
  } catch (error: any) {
    console.error('Error:', error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'An error occurred while requesting the token' });
  }
}

async function exchangeAccessToken(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const { oauthToken, oauthVerifier } = req.body;

    if (!oauthToken || !oauthVerifier) {
      return res.status(400).json({ error: 'Missing OAuth token or verifier' });
    }

    const mongoClient = await getMongoClient();
    const record = await mongoClient.db(DB_NAME).collection('requests').findOne({ requestToken: oauthToken });

    if (!record) {
      return res.status(400).json({ error: 'Invalid request token' });
    }

    const requestTokenSecret = record.requestTokenSecret;
    const requestData = {
      url: 'https://api.twitter.com/oauth/access_token',
      method: 'POST',
      data: { oauth_verifier: oauthVerifier }
    };

    const oauthHeader = oauth.toHeader(oauth.authorize(requestData, { key: oauthToken, secret: requestTokenSecret }));
    const response = await axios.post(requestData.url, null, {
      headers: { ...oauthHeader, 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const params = new URLSearchParams(response.data);
    const accessToken = params.get('oauth_token');
    const accessTokenSecret = params.get('oauth_token_secret');

    if (!accessToken || !accessTokenSecret) {
      throw new Error('Failed to retrieve access tokens');
    }

    await mongoClient.db(DB_NAME).collection('requests').deleteOne({ requestToken: oauthToken });
    getUserInfo(accessToken, accessTokenSecret, res, req);
  } catch (error: any) {
    console.error('Error exchanging OAuth token for access token:', error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'An error occurred while exchanging the token' });
  }
}

async function getUserInfo(accessToken: string, accessTokenSecret: string, res: Response, req: AuthRequest): Promise<Response> {
  try {
    const authHeader = oauth.toHeader(oauth.authorize({
      url: 'https://api.twitter.com/1.1/account/verify_credentials.json',
      method: 'GET'
    }, { key: accessToken, secret: accessTokenSecret })) as any;

    const response = await axios.get('https://api.twitter.com/1.1/account/verify_credentials.json', {
      headers: authHeader
    });

    const userInfo = response.data;

    (async () => {
              await writeVerifiedAttributes(
                req.auth.identityKey,
                {
                  email: req.body.verifyEmail,
                  verificationCode: req.body.verificationCode
                }
              )
              return res.status(200).json({
                verificationStatus: true,
                certType: certificateType,
              })
            })()

    return res.status(200).json({
      userName: userInfo.screen_name,
      profilePhoto: userInfo.profile_image_url_https
    });
  } catch (error: any) {
    console.error('Error fetching user info:', error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'An error occurred while fetching user info' });
  }
}
