// const { MongoClient } = require('mongodb')
// const { saveVerificationProof } = require('../utils/databaseHelpers')
// const getPhotoDataAsBuffer = require('../utils/getPhotoDataAsBuffer')
// const { getVerificationInfo } = require('../utils/getVerificationInfo')
// const { publishFile } = require('nanostore-publisher')
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

      if (!req.body.preVerifiedData || !req.body.preVerifiedData.accessCode || req.body.preVerifiedData === 'notVerified') {
        return res.status(400).json({
          status: 'notVerified',
          description: 'User identity has not been verified!'
        })
      }

      
      return res.send(200);

      const data = new URLSearchParams({
        'grant_type': 'authorization_code',
        'code': req.body.preVerifiedData.accessCode,
        'redirect_uri': REDIRECT_URI
      });


      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
      };


      if (!data){
        return res.status(400).json({
          status: 'notVerified',
          description: 'User identity has not been verified!'
        })
      }



      let authResponse = await axios.post(`${DISCORD_API_ENDPOINT}/oauth2/token`, data, {
        headers: headers,
        auth: {
          username: DISCORD_CLIENT_ID,
          password: DISCORD_CLIENT_SECRET
        }
      })

      

      let access_token = authResponse.data.access_token;
      const dataResponse = await axios.get(`${DISCORD_API_ENDPOINT}/oauth2/@me`, { headers: { 'Authorization': `Bearer ${access_token}` } });


      // Publish the profile photo to NanoStore
      // const uploadResult = await publishFile({
      //   config: {
      //     nanostoreURL: NANOSTORE_URL,
      //     clientPrivateKey: SERVER_PRIVATE_KEY,
      //     dojoURL: DOJO_URL
      //   },
      //   file: {
      //     dataAsBuffer: selfiePhotoBuffer,
      //     size: selfiePhotoBuffer.length,
      //     type: 'image/jpeg'
      //   },
      //   retentionPeriod
      // })

      // if (!uploadResult) {
      //   return res.status(400).json({
      //     status: 'notVerified',
      //     description: 'Failed to upload profile photo!'
      //   })
      // }

      if (!dataResponse || dataResponse.status != 200) {
        return res.status(400).json({ // 204 might be better
          status: 'notVerified',
          description: 'User identity has not been verified!'
        })
      }

      const userData = {
        userName: dataResponse.data.user.username,
        profilePhoto: `https://cdn.discordapp.com/avatars/${dataResponse.data.user.id}/${dataResponse.data.user.avatar}.png`
      }

      return res.status(200).json({
        status: 'verified',
        description: 'User identity is verified!',
        verifiedAttributes: userData
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
