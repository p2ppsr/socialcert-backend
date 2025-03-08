require('dotenv').config()
import { PrivateKey } from '@bsv/sdk'
// const discordcert = require('./certificates/discordcert')
// const phoneverification = require('./certificates/phoneverification')
// const xcert = require('./certificates/xcert')
// const emailcert = require('./certificates/emailcert')
import { emailcert } from './certificates/emailcert'

const certifierPrivateKey = process.env.SERVER_PRIVATE_KEY
const certifierPublicKey = PrivateKey.fromHex(certifierPrivateKey as string).toPublicKey().toString()

// the requester has been issued and has authorized access to specific
// certificate types and field values.
// This specifies which types and fields are to be requested by authrite for confirmations.

module.exports = {
  certifierPrivateKey,
  certifierPublicKey,
  certificateTypes: {
    // [discordcert.certificateType]: {
    //   definition: discordcert.certificateDefinition,
    //   fields: discordcert.certificateFields
    // },
    // [phoneverification.certificateType]: {
    //   definition: phoneverification.certificateDefinition,
    //   fields: phoneverification.certificateFields
    // },
    // [xcert.certificateType]: {
    //   definition: xcert.certificateDefinition,
    //   fields: xcert.certificateFields
    // },
    [emailcert.certificateType]: {
      definition: emailcert.certificateDefinition,
      fields: emailcert.certificateFields
    }
  }

}
