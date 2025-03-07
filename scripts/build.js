const ejs = require('ejs')
const fs = require('fs')
require('dotenv').config()
const PrivateKey = require('@bsv/sdk')
const PUBKEY = PrivateKey.fromHex(process.env.SERVER_PRIVATE_KEY).toPublicKey().toString()

ejs.renderFile(
  'src/templates/documentation.ejs',
  {
    ...process.env,
    routes: require('../src/routes'),
    PUBKEY
  },
  {},
  (err, res) => {
    if (err) {
      throw err
    }
    console.log('Generating API Documentation...')
    fs.writeFileSync('public/index.html', res)
  }
)
