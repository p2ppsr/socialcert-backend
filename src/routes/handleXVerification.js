require('dotenv').config()
const OAuth = require('oauth-1.0a')
const crypto = require('crypto')
const axios = require('axios')
const {
  X_API_KEY: oauthConsumerKey,
  X_REDIRECT_URI: callbackURL,
  X_API_SECRET: consumerSecret
} = process.env
let requestTokenSecret

const oauth = OAuth({
  consumer: { key: oauthConsumerKey, secret: consumerSecret },
  signature_method: 'HMAC-SHA1',
  hash_function (base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64')
  }
})

module.exports = {
  type: 'post',
  path: '/handleXVerification',
  summary: 'Submit KYC verification proof for the current user',
  parameters: {
    phoneNumber: {
      phoneNumber: 'Code exchanged for authorization token from Discord' // TODO: Write docuentation
    },
    certificateFields: {}
  },
  exampleResponse: {
    status: 'verified | notVerified'
  },
  func: async (req, res) => {
    if (req.body.funcAction == 'makeRequest') {
      initialRequest(req, res)
    } else if (req.body.funcAction == 'getUserInfo') {
      exchangeAccessToken(req, res)
    }
  }
}

async function initialRequest (req, res) {
// Generate a random nonce and current timestamp
  const oauthNonce = crypto.randomBytes(16).toString('hex')
  const oauthTimestamp = Math.floor(Date.now() / 1000)
  // Set up additional OAuth parameters
  const additionalParams = {
    oauth_callback: callbackURL
  }

  // Generate OAuth headers
  const oauthHeaders = oauth.toHeader(oauth.authorize({
    url: 'https://api.twitter.com/oauth/request_token',
    method: 'POST',
    data: additionalParams
  }, {}))

  // Make the request using the generated headers
  const requestOptions = {
    method: 'POST',
    url: 'https://api.twitter.com/oauth/request_token',
    headers: {
      ...oauthHeaders,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }

  // Making a call to oauth/request_token providing our developer API key and API secret, in return we are given a request token and
  // a request token secret
  axios(requestOptions)
    .then(response => {
      const responseData = response.data
      const params = new URLSearchParams(responseData)
      const requestToken = params.get('oauth_token')
      requestTokenSecret = params.get('oauth_token_secret')

      // Sending users to twitter so that they can authorize SocialCert, this is passed the requestToken so it can work
      // It'll redirect the user back to localhost:3001/twitterAuth but the if statement will be true!
      return res.status(200).json({
        requestToken

      })
    })
    .catch(error => {
      console.error('Error:', error)
    })
}

async function exchangeAccessToken (req, res) {
  try {
    // OAuth data
    const oauthToken = req.body.oauthToken
    const oauthVerifier = req.body.oauthVerifier

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

    console.log('Access Token:', accessToken)
    console.log('Access Token Secret:', accessTokenSecret)

    getUserInfo(accessToken, accessTokenSecret, res)
  } catch (error) {
    console.error('Error exchanging OAuth token for access token:', error)
    throw error
  }
}

async function getUserInfo (accessToken, accessTokenSecret, res) {
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
    console.error('Error fetching user info:', error)
    throw error
  }
}
