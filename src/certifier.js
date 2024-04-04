require('dotenv').config()
const bsv = require('babbage-bsv')

const discordcert = require('./certificates/discordcert')
const phoneverification = require('./certificates/phoneverification')
const verificationType = require('./routes/checkVerification')

const certifierPrivateKey = process.env.SERVER_PRIVATE_KEY
const certifierPublicKey = new bsv.PrivateKey(certifierPrivateKey).publicKey.toString('hex')

// the requester has been issued and has authorized access to specific
// certificate types and field values.
// This specifies which types and fields are to be requested by authrite for confirmations.



const requestedTypesAndFields = Object.fromEntries([[discordcert.certificateType, discordcert.certificateFields]])

module.exports = {
  certifierPrivateKey,
  certifierPublicKey,
  certificateTypes: {
    [discordcert.certificateType]: {
      definition: discordcert.certificateDefinition,
      fields: discordcert.certificateFields
    },
    [phoneverification.certificateType]:{
      definition: phoneverification.certificateDefinition,
      fields: phoneverification.certificateFields
    }
  },
  // certificateType: discordcert.certificateType,
  // certificateDefinition: discordcert.certificateDefinition,
  // certificateFields: discordcert.certificateFields,
  // requestedTypesAndFields
}
