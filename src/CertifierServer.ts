import { WalletInterface } from '@bsv/sdk'
import express, { Request, Response } from 'express'
import { AuthMiddlewareOptions, createAuthMiddleware } from '@bsv/auth-express-middleware'
import { createPaymentMiddleware } from '@bsv/payment-express-middleware'
import * as routes from './routes'
import { issuerMetadata } from './routes/metadata'
import { AuthRequest } from '@bsv/auth-express-middleware'

export interface CertifierServerOptions {
  port: number
  wallet: WalletInterface
  monetize: boolean
  calculateRequestPrice?: (req: Request) => number | Promise<number>
}

export interface CertifierRoute {
  type: 'post' | 'get'
  path: string
  summary: string
  parameters?: object
  exampleBody?: object
  exampleResponse: object
  func: (req: AuthRequest, res: Response, server: CertifierServer) => Promise<any>
}

export class CertifierServer {
  private readonly app = express()
  private readonly port: number
  wallet: WalletInterface
  private readonly monetize: boolean
  private readonly calculateRequestPrice?: (req: Request) => number | Promise<number>

  constructor(storage: any, options: CertifierServerOptions) {
    this.port = options.port
    this.wallet = options.wallet
    this.monetize = options.monetize
    this.calculateRequestPrice = options.calculateRequestPrice

    this.setupRoutes()
  }

  private setupRoutes(): void {
    this.app.use(express.json({ limit: '30mb' }))

    // This allows the API to be used everywhere when CORS is enforced
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Headers', '*')
      res.header('Access-Control-Allow-Methods', '*')
      res.header('Access-Control-Expose-Headers', '*')
      res.header('Access-Control-Allow-Private-Network', 'true')
      if (req.method === 'OPTIONS') {
        // Handle CORS preflight requests to allow cross-origin POST/PUT requests
        res.sendStatus(200)
      } else {
        next()
      }
    })

    this.app.use(express.static('public'));

    this.app.get('/healthz', (req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' })
    })

    this.app.get('/metadata', async (_req: Request, res: Response) => {
      try {
        res.setHeader('Cache-Control', 'no-store')
        res.status(200).json(await issuerMetadata(this.wallet))
      } catch {
        res.status(503).json({ status: 'error', code: 'ERR_ISSUER_UNAVAILABLE', description: 'Issuer information is unavailable. Try again later.' })
      }
    })

    // Configure the auth and payment middleware
    this.app.use(createAuthMiddleware({
      wallet: this.wallet,
      logger: Object.assign(Object.create(console), { error: () => console.error('Authentication request failed'), warn: () => {}, info: () => {}, debug: () => {}, log: () => {} }),
      logLevel: 'error'
    }))
    if (this.monetize) {
      this.app.use(
        createPaymentMiddleware({
          wallet: this.wallet,
          calculateRequestPrice: async (req) => {
            return 0 //temp
          }
        })
      )
    }

    // Setup the express routes for this server
    const theRoutes: CertifierRoute[] = [
      // routes.verifyAttributes,
      routes.signCertificate,
      routes.checkVerification,
      routes.checkEmailVerification,
      routes.checkXVerification,
      routes.checkDiscordVerification
      // routes.revokeCertificate
    ]

    for (const route of theRoutes) {
      this.app[route.type](`${route.path}`, async (req: Request, res: Response) => {
        try { return await route.func(req, res, this) }
        catch {
          if (!res.headersSent) return res.status(503).json({ status: 'error', code: 'ERR_DEPENDENCY', description: 'The service is temporarily unavailable.' })
        }
      })
    }
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`CertifierServer listening at http://localhost:${this.port}`)
    })
  }

  /**
   * Helper function which checks the arguments for the certificate signing request
   * @param {object} args
   * @throws {Error} if any of the required arguments are missing
   */
  certifierSignCheckArgs(args: { clientNonce: string, type: string, fields: Record<string, string>, masterKeyring: Record<string, string> }): void {
    if (!args.clientNonce) {
      throw new Error('Missing client nonce!')
    }
    if (!args.type) {
      throw new Error('Missing certificate type!')
    }
    if (!args.fields) {
      throw new Error('Missing certificate fields to sign!')
    }
    if (!args.masterKeyring) {
      throw new Error('Missing masterKeyring to decrypt fields!')
    }
  }
}
