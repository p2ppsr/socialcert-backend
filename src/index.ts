import * as dotenv from 'dotenv'
import { CertifierServer, CertifierServerOptions } from './CertifierServer'
import { Setup } from '@bsv/wallet-toolbox'
import { Chain } from '@bsv/wallet-toolbox/out/src/sdk'
import { getMongoClient, socialDatabaseName } from './utils/databaseHelpers'
import { MongoSessionManager } from './auth/MongoSessionManager'

dotenv.config()

// Load environment variables
const {
  NODE_ENV = 'development',
  BSV_NETWORK = 'main',
  HTTP_PORT = 8080,
  SERVER_PRIVATE_KEY,
  WALLET_STORAGE_URL
} = process.env

async function setupCertifierServer(): Promise<{
  server: CertifierServer
}> {
  try {
    if (SERVER_PRIVATE_KEY === undefined) {
      throw new Error('SERVER_PRIVATE_KEY must be set')
    }

    const wallet = await Setup.createWalletClientNoEnv({
      chain: BSV_NETWORK as Chain,
      rootKeyHex: SERVER_PRIVATE_KEY,
      storageUrl: WALLET_STORAGE_URL
    })

    const mongo = await getMongoClient()
    const sessionManager = new MongoSessionManager(mongo.db(socialDatabaseName()))
    await sessionManager.initialize()
    // Set up server options only after shared state is available.
    const serverOptions: CertifierServerOptions = {
      port: Number(HTTP_PORT),
      wallet,
      sessionManager,
      checkAuthStore: () => sessionManager.ready(),
      monetize: false,
      calculateRequestPrice: async () => {
        return 0 // Monetize your server here! Price is in satoshis.
      }
    }
    const server = new CertifierServer({}, serverOptions)

    return {
      server
    }
  } catch (error) {
    console.error('Issuer wallet setup failed')
    throw error
  }
}

// Main function to start the server
(async () => {
  try {
    const context = await setupCertifierServer()
    context.server.start()
  } catch (error) {
    console.error('Certifier server startup failed')
    process.exitCode = 1
    process.exit(1)
  }
})().catch(() => console.error('Certifier server startup failed'))
