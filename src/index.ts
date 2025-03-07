import * as dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import routes  from './routes'
const ROUTING_PREFIX = process.env.ROUTING_PREFIX || ''
import { Response, NextFunction } from 'express';
import { AuthRequest, createAuthMiddleware, } from '@bsv/auth-express-middleware'
import {Setup} from '@bsv/wallet-toolbox'
import { Chain } from '@bsv/wallet-toolbox/out/src/sdk'

const {
  NODE_ENV = 'development',
  BSV_NETWORK = 'main',
  HTTP_PORT = process.env.PORT || process.env.HTTP_PORT || 3002,
  SERVER_PRIVATE_KEY,
  WALLET_STORAGE_URL
} = process.env



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

const setupFunction = async () => {
  const wallet = await Setup.createWalletClientNoEnv({
  chain: BSV_NETWORK as Chain,
  rootKeyHex: SERVER_PRIVATE_KEY as string,
  storageUrl: WALLET_STORAGE_URL
})

app.use(express.json({ limit: '10mb' }))

// This allows the API to be used when CORS is enforced
app.use((req: AuthRequest, res: Response, next: NextFunction) => {
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

// This ensures that HTTPS is used unless you are in development mode
app.use((req: AuthRequest, res: Response, next: NextFunction) => {
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

app.use(createAuthMiddleware({
  wallet: wallet
}))

// This adds all the API routes
routes.forEach((route: any) => {
  app[route.type as 'post' | 'get'](`${ROUTING_PREFIX}${route.path}`, route.func)
})

// This is the 404 route
app.use((req: AuthRequest, res: Response) => {
  console.log('404', req.url)
  res.status(404).json({
    status: 'error',
    code: 'ERR_ROUTE_NOT_FOUND',
    description: 'Route not found.'
  })
})
}

// This starts socialcert server listening for requests
app.listen(HTTP_PORT, async () => {
  await setupFunction();
  console.log('socialcert listening on port', HTTP_PORT)
  console.log(
    'Certifier:',
    bsv.PrivateKey
      .fromHex(process.env.SERVER_PRIVATE_KEY)
      .publicKey.toString()
  )
  console.log(
    'socialcert server configured for type:',
    process.env.CERTIFICATE_TYPE_ID
  )
})
