import OAuth from 'oauth-1.0a'
import crypto from 'crypto'
import axios from 'axios'
import type { CertifierRoute } from '../CertifierServer'
import { getMongoClient, writeVerifiedAttributes } from '../utils/databaseHelpers'
import { certificateType } from '../certificates/xcert'
import { PROVIDER_TIMEOUT_MS, validAttributes, VERIFICATION_MAX_AGE_MS } from '../certifier'
import { requireString, requireSubject, respondError, RouteError } from '../utils/routeErrors'

const makeOAuth = () => new OAuth({
  consumer: { key: process.env.X_API_KEY as string, secret: process.env.X_API_SECRET as string },
  signature_method: 'HMAC-SHA1',
  hash_function: (base, key) => crypto.createHmac('sha1', key).update(base).digest('base64')
})

export function createXVerification(dependencies = { http: axios, getMongoClient, writeVerifiedAttributes, oauth: makeOAuth }): CertifierRoute {
  return {
    type: 'post', path: '/handleXVerification', summary: 'Verify account access through X authorization.',
    exampleResponse: { userName: 'example', profilePhoto: 'https://example.invalid/image.png' },
    func: async (req, res) => {
      try {
        const subject = requireSubject(req)
        const action = req.body?.funcAction
        if (action !== 'makeRequest' && action !== 'getUserInfo') throw new RouteError(400, 'ERR_ACTION', 'Choose a supported X action.')
        const oauth = dependencies.oauth()
        const client = await dependencies.getMongoClient()
        const requests = client.db('x-verification').collection('requests')
        if (action === 'makeRequest') {
          const data = { oauth_callback: process.env.X_REDIRECT_URI }
          const url = 'https://api.twitter.com/oauth/request_token'
          const response = await dependencies.http.post(url, new URLSearchParams(data).toString(), {
            headers: { ...oauth.toHeader(oauth.authorize({ url, method: 'POST', data })), 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: PROVIDER_TIMEOUT_MS
          })
          const params = new URLSearchParams(response.data)
          const requestToken = requireString(params.get('oauth_token'), 'provider request token')
          const requestTokenSecret = requireString(params.get('oauth_token_secret'), 'provider request secret')
          if (params.get('oauth_callback_confirmed') !== 'true') throw new RouteError(502, 'ERR_PROVIDER', 'X did not confirm the callback. Try again later.')
          await requests.insertOne({ requestToken, requestTokenSecret, identityKey: subject, createdAt: new Date() })
          return res.status(200).json({ requestToken })
        }
        const oauthToken = requireString(req.body.oauthToken, 'OAuth token')
        const oauthVerifier = requireString(req.body.oauthVerifier, 'OAuth verifier')
        const claim = await requests.findOneAndUpdate({
          requestToken: oauthToken, identityKey: subject,
          createdAt: { $gte: new Date(Date.now() - VERIFICATION_MAX_AGE_MS) },
          processing: { $ne: true }
        }, { $set: { processing: true } }, { returnDocument: 'after' })
        const record = claim.value
        if (!record) throw new RouteError(409, 'ERR_AUTHORIZATION', 'X authorization expired, is pending, or belongs to another wallet. Start X verification again.')
        const url = 'https://api.twitter.com/oauth/access_token'
        const data = { oauth_verifier: oauthVerifier }
        const exchange = await dependencies.http.post(url, new URLSearchParams(data).toString(), {
          headers: { ...oauth.toHeader(oauth.authorize({ url, method: 'POST', data }, { key: oauthToken, secret: record.requestTokenSecret })), 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: PROVIDER_TIMEOUT_MS
        })
        const params = new URLSearchParams(exchange.data)
        const token = { key: requireString(params.get('oauth_token'), 'provider access token'), secret: requireString(params.get('oauth_token_secret'), 'provider access secret') }
        const profileURL = 'https://api.twitter.com/1.1/account/verify_credentials.json'
        const profile = await dependencies.http.get(profileURL, {
          headers: { ...oauth.toHeader(oauth.authorize({ url: profileURL, method: 'GET' }, token)) }, timeout: PROVIDER_TIMEOUT_MS
        })
        const attributes = { userName: profile.data?.screen_name, profilePhoto: profile.data?.profile_image_url_https }
        if (!validAttributes(certificateType, attributes)) throw new RouteError(422, 'ERR_PROVIDER_ATTRIBUTES', 'X did not provide the required account name and HTTPS image. No certificate was acquired.')
        await dependencies.writeVerifiedAttributes(subject, certificateType, attributes)
        await requests.deleteOne({ _id: record._id, identityKey: subject })
        return res.status(200).json(attributes)
      } catch (error) { return respondError(res, error) }
    }
  }
}

export const checkXVerification = createXVerification()
