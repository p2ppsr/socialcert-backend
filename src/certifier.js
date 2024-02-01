require('dotenv').config()
const bsv = require('babbage-bsv')

const discordcert = require('./certificates/discordcert')

const certifierPrivateKey = process.env.SERVER_PRIVATE_KEY
const certifierPublicKey = new bsv.PrivateKey(certifierPrivateKey).publicKey.toString('hex')

// The confirmCertificate route of this server can be used to confirm that
// the requester has been issued and has authorized access to specific
// certificate types and field values.
// This specifies which types and fields are to be requested by authrite for confirmations.
const requestedTypesAndFields = Object.fromEntries([[discordcert.certificateType, discordcert.certificateFields]])

module.exports = {
  certifierPrivateKey,
  certifierPublicKey,
  certificateType: discordcert.certificateType,
  certificateDefinition: discordcert.certificateDefinition,
  certificateFields: discordcert.certificateFields,
  requestedTypesAndFields
}
