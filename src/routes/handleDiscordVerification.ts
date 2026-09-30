import axios from 'axios'
import type { CertifierRoute } from '../CertifierServer'
import { writeVerifiedAttributes } from '../utils/databaseHelpers'
import { certificateType } from '../certificates/discordcert'
import { PROVIDER_TIMEOUT_MS, validAttributes } from '../certifier'
import { requireString, requireSubject, respondError, RouteError } from '../utils/routeErrors'

export function createDiscordVerification(dependencies = { http: axios, writeVerifiedAttributes }): CertifierRoute {
  return {
    type: 'post', path: '/handleDiscordVerification', summary: 'Verify account access through Discord authorization.',
    exampleResponse: { userName: 'example', profilePhoto: 'https://cdn.discordapp.com/avatars/example/image.png' },
    func: async (req, res) => {
      try {
        const subject = requireSubject(req)
        if (req.body?.funcAction !== 'getDiscordData') throw new RouteError(400, 'ERR_ACTION', 'Choose a supported Discord action.')
        const code = requireString(req.body.accessCode, 'authorization code')
        const endpoint = process.env.DISCORD_API_ENDPOINT
        const data = new URLSearchParams({
          grant_type: 'authorization_code', code, redirect_uri: process.env.DISCORD_REDIRECT_URI
        })
        const tokenResponse = await dependencies.http.post(`${endpoint}/oauth2/token`, data.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: { username: process.env.DISCORD_CLIENT_ID, password: process.env.DISCORD_CLIENT_SECRET },
          timeout: PROVIDER_TIMEOUT_MS
        })
        const token = requireString(tokenResponse.data?.access_token, 'provider access token')
        const profile = await dependencies.http.get(`${endpoint}/oauth2/@me`, {
          headers: { Authorization: `Bearer ${token}` }, timeout: PROVIDER_TIMEOUT_MS
        })
        const user = profile.data?.user
        if (profile.status !== 200 || typeof user?.id !== 'string' || !/^\d{1,20}$/.test(user.id)) {
          throw new RouteError(422, 'ERR_PROVIDER_ATTRIBUTES', 'Discord did not provide a usable account profile. No certificate was acquired.')
        }
        let profilePhoto: string
        if (typeof user.avatar === 'string' && /^(?:a_)?[a-f0-9]{1,64}$/.test(user.avatar)) {
          profilePhoto = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        } else if (user.avatar === null && typeof user.discriminator === 'string' && /^\d{1,4}$/.test(user.discriminator)) {
          // Discord's documented default-avatar mapping, from authenticated
          // provider data. https://docs.discord.com/developers/reference#image-formatting
          const index = user.discriminator === '0'
            ? Number((BigInt(user.id) >> 22n) % 6n)
            : Number(user.discriminator) % 5
          profilePhoto = `https://cdn.discordapp.com/embed/avatars/${index}.png`
        } else {
          throw new RouteError(422, 'ERR_PROVIDER_ATTRIBUTES', 'Discord did not provide a usable account image. No certificate was acquired.')
        }
        const attributes = { userName: user.username, profilePhoto }
        if (!validAttributes(certificateType, attributes)) throw new RouteError(422, 'ERR_PROVIDER_ATTRIBUTES', 'Discord did not provide the required account attributes.')
        await dependencies.writeVerifiedAttributes(subject, certificateType, attributes)
        return res.status(200).json(attributes)
      } catch (error) { return respondError(res, error) }
    }
  }
}

export const checkDiscordVerification = createDiscordVerification()
