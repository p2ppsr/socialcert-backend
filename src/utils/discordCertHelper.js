// const axios = require('axios')
// const { MongoClient } = require('mongodb')
// const { saveVerificationProof } = require('../utils/databaseHelpers')

// const {
//   NANOSTORE_URL,
//   SERVER_PRIVATE_KEY,
//   DOJO_URL,
//   DISCORD_API_ENDPOINT,
//   DISCORD_CLIENT_ID,
//   DISCORD_CLIENT_SECRET,
//   DISCORD_REDIRECT_URI
// } = process.env

// async function getUserDiscordData (accessCode) {
//   const data = new URLSearchParams({
//     grant_type: 'authorization_code',
//     code: accessCode,
//     redirect_uri: DISCORD_REDIRECT_URI

//   })

//   const headers = {
//     'Content-Type': 'application/x-www-form-urlencoded'
//   }

//   if (!data) {
//     return res.status(400).json({
//       status: 'notVerified',
//       description: 'User identity has not been verified!'
//     })
//   }

//   const authResponse = await axios.post(`${DISCORD_API_ENDPOINT}/oauth2/token`, data, {
//     headers: headers,
//     auth: {
//       username: DISCORD_CLIENT_ID,
//       password: DISCORD_CLIENT_SECRET
//     }
    
//   })

//   const access_token = authResponse.data.access_token;

//   const dataResponse = await axios.get(`${DISCORD_API_ENDPOINT}/oauth2/@me`, { headers: { Authorization: `Bearer ${access_token}` } })

//   if (!dataResponse || dataResponse.status != 200) {
//     return res.status(400).json({ // 204 might be better
//       status: 'notVerified',
//       description: 'User identity has not been verified!'
//     })
//   }

//   const userData = {
//     userName: dataResponse.data.user.username,
//     profilePhoto: `https://cdn.discordapp.com/avatars/${dataResponse.data.user.id}/${dataResponse.data.user.avatar}.png`
//   }

//   return userData

// }

// module.exports = {
//   getUserDiscordData
// }
