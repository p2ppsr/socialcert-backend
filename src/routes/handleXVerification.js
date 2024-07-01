require('dotenv').config()
const OAuth = require('oauth-1.0a')
const crypto = require('crypto')
const axios = require('axios')
const { getMongoClient } = require('../utils/databaseHelpers')
const {
  X_API_KEY: oauthConsumerKey,
  X_REDIRECT_URI: callbackURL,
  X_API_SECRET: consumerSecret
} = process.env

const DB_NAME = 'x-verification'

const oauth = OAuth({
  consumer: { key: oauthConsumerKey, secret: consumerSecret },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64')
  }
})

module.exports = {
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
  func: async (req, res) => {
    if (req.body.funcAction === 'makeRequest') {
      await initialRequest(req, res)
    } else if (req.body.funcAction === 'getUserInfo') {
      await exchangeAccessToken(req, res)
    }
  }
}

async function initialRequest(req, res) {
  try {
    // Generate a random nonce and current timestamp
    const oauthNonce = crypto.randomBytes(16).toString('hex')
    const oauthTimestamp = Math.floor(Date.now() / 1000)

    // Set up additional OAuth parameters
    const additionalParams = {
      oauth_callback: callbackURL,
      oauth_nonce: oauthNonce,
      oauth_timestamp: oauthTimestamp
    }

    // Generate OAuth headers
    const oauthData = {
      url: 'https://api.twitter.com/oauth/request_token',
      method: 'POST',
      data: additionalParams
    }
    const oauthHeaders = oauth.toHeader(oauth.authorize(oauthData))

    // Make the request using the generated headers
    const requestOptions = {
      method: 'POST',
      url: 'https://api.twitter.com/oauth/request_token',
      headers: {
        ...oauthHeaders,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }

    const response = await axios(requestOptions)
    const responseData = response.data
    const params = new URLSearchParams(responseData)
    const requestToken = params.get('oauth_token')
    const requestTokenSecret = params.get('oauth_token_secret')

    // Store the request token and secret in MongoDB
    const mongoClient = await getMongoClient()
    await mongoClient.db(DB_NAME).collection('requests').insertOne({
      requestToken,
      requestTokenSecret,
      createdAt: new Date()
    })

    await mongoClient.close()

    return res.status(200).json({ requestToken })
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message)
    return res.status(500).json({ error: 'An error occurred while requesting the token' })
  }
}

async function exchangeAccessToken(req, res) {
  try {
    // OAuth data
    const oauthToken = req.body.oauthToken
    const oauthVerifier = req.body.oauthVerifier

    // Retrieve the request token secret from MongoDB
    const mongoClient = await getMongoClient()
    const record = await mongoClient.db(DB_NAME).collection('requests').findOne({ requestToken: oauthToken })

    if (!record) {
      await mongoClient.close()
      return res.status(400).json({ error: 'Invalid request token' })
    }

    const requestTokenSecret = record.requestTokenSecret

    const requestData = {
      url: 'https://api.twitter.com/oauth/access_token',
      method: 'POST',
      data: { oauth_verifier: oauthVerifier }
    }

    // Generate OAuth signature
    const oauthHeader = oauth.toHeader(oauth.authorize(requestData, { key: oauthToken, secret: requestTokenSecret }))

    // Make request to exchange OAuth token for access token
    const response = await axios.post(requestData.url, null, {
      headers: { ...oauthHeader, 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    // Parse response for access token and secret
    const params = new URLSearchParams(response.data)
    const accessToken = params.get('oauth_token')
    const accessTokenSecret = params.get('oauth_token_secret')

    // Delete the used request token secret from MongoDB
    await mongoClient.db(DB_NAME).collection('requests').deleteOne({ requestToken: oauthToken })
    await mongoClient.close()

    console.log('Access Token:', accessToken)
    console.log('Access Token Secret:', accessTokenSecret)

    // Call getUserInfo to fetch user information
    getUserInfo(accessToken, accessTokenSecret, res)
  } catch (error) {
    console.error('Error exchanging OAuth token for access token:', error.response ? error.response.data : error.message)
    return res.status(500).json({ error: 'An error occurred while exchanging the token' })
  }
}

async function getUserInfo(accessToken, accessTokenSecret, res) {
  try {
    // OAuth header
    const authHeader = oauth.toHeader(oauth.authorize({
      url: 'https://api.twitter.com/1.1/account/verify_credentials.json',
      method: 'GET'
    }, { key: accessToken, secret: accessTokenSecret }))

    // Fetch user info
    const response = await axios.get('https://api.twitter.com/1.1/account/verify_credentials.json', {
      headers: authHeader
    })

    const userInfo = response.data

    res.status(200).json({
      userName: userInfo.screen_name,
      profilePhoto: userInfo.profile_image_url_https
    })
  } catch (error) {
    console.error('Error fetching user info:', error.response ? error.response.data : error.message)
    return res.status(500).json({ error: 'An error occurred while fetching user info' })
  }
}
