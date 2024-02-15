require('dotenv').config()
const express = require('express')
const prettyjson = require('prettyjson')
const routes = require('./routes')
const HTTP_PORT = process.env.PORT || process.env.HTTP_PORT || 3002
const ROUTING_PREFIX = process.env.ROUTING_PREFIX || ''
const authrite = require('authrite-express')
const bsv = require('babbage-bsv')

if (!process.env.SERVER_PRIVATE_KEY) {
  throw new Error('No server private key!')
}
if (!process.env.CERTIFICATE_TYPE_ID) {
  throw new Error('No certificate type ID!')
}

if (process.env.SERVER_PRIVATE_KEY === '0000000000000000000000000000000000000000000000000000000000000001') {
  console.warn('[DANGER!] The server is using the default, publicly-known SERVER_PRIVATE_KEY. DO NOT use this on your server. Change it immediately.')
}

const app = express()
app.use(express.json({ limit: '10mb' }))

// This allows the API to be used when CORS is enforced
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Allow-Methods', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Access-Control-Allow-Private-Network', 'true')
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

//This ensures that HTTPS is used unless you are in development mode
app.use((req, res, next) => {
  if (
    !req.secure &&
    req.get('x-forwarded-proto') !== 'https' &&
    process.env.NODE_ENV !== 'development'
  ) {
    return res.redirect('https://' + req.get('host') + req.url)
  }
  next()
})

// This makes the documentation site available
app.use(express.static('public'))

// This is a simple API request logger
app.use((req, res, next) => {
  console.log('[' + req.method + '] <- ' + req._parsedUrl.pathname)
  const logObject = { ...req.body }
  console.log(prettyjson.render(logObject, { keysColor: 'blue' }))
  res.nologJson = res.json
  res.json = json => {
    res.nologJson(json)
    console.log('[' + req.method + '] -> ' + req._parsedUrl.pathname)
    console.log(prettyjson.render(json, { keysColor: 'green' }))
  }
  next()
})

//Authrite is enforced from here forward
app.use(authrite.middleware({
  serverPrivateKey: process.env.SERVER_PRIVATE_KEY,
  baseUrl: process.env.HOSTING_DOMAIN
}))

// This adds all the API routes
routes.forEach((route) => {
  app[route.type](`${ROUTING_PREFIX}${route.path}`, route.func)
})

// This is the 404 route
app.use((req, res) => {
  console.log('404', req.url)
  res.status(404).json({
    status: 'error',
    code: 'ERR_ROUTE_NOT_FOUND',
    description: 'Route not found.'
  })
})

// This starts discordcert server listening for requests
app.listen(HTTP_PORT, () => {
  console.log('discordcert listening on port', HTTP_PORT)
  console.log(
    'Certifier:',
    bsv.PrivateKey
      .fromHex(process.env.SERVER_PRIVATE_KEY)
      .publicKey.toString()
  )
  console.log(
    'discordcert server configured for type:',
    process.env.CERTIFICATE_TYPE_ID
  )
})
