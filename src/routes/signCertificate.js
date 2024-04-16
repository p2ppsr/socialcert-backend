const { decryptCertificateFields, certifierSignCheckArgs, certifierCreateSignedCertificate } = require('authrite-utils')
const { saveCertificate, getVerificationProof } = require('../utils/databaseHelpers')
const { Ninja } = require('ninja-base')
const pushdrop = require('pushdrop')
const { getPaymentPrivateKey } = require('sendover')
const bsv = require('babbage-bsv')
const crypto = require('crypto')

const {
  SERVER_PRIVATE_KEY,
  DOJO_URL
} = process.env

const {
  certifierPrivateKey,
  certificateTypes, // Array of all certifacte types and they're corresponding defintion and fields
  certificateType,
  certificateFields
} = require('../certifier')

/*
 * This route handles signCertificate for the ficate protocol.
 *
 * It validates the certificate signing request (CSR) received from the client,
 * decrypts and validates the field values,
 * and signs the certificate and its encrypted field values.
 *
 * The validated and signed certificate is returned to the client where the client saves their copy.
 *
 * As an optional next step, the confirmCertificate route can be used.
 */
module.exports = {
  type: 'post',
  path: '/signCertificate',
  summary: 'Validate and sign a new certificate. Requested as a side effect of AuthriteClient.ficate.',
  exampleBody: {
    messageType: 'certificateSigningRequest',
    type: 'jVNgF8+rifnz00856b4TkThCAvfiUE4p+t/aHYl1u0c=',
    clientNonce: 'VhQ3UUGl4L76T9v3M2YLd/Es25CEwAAoGTowblLtM3s=',
    serverSerialNonce: 'BCJDJ1Bf1nu4qrE9j27lEZLxEEQ/meWESfHuX2vGlGQ=',
    serverValidationNonce: 'H2/nAFdua/kktwXmYBn/MMgbfE9ckT3zEB6xzKhx7EM=',
    validationKey: 'i0P2MiTG/gt1Q0aUjAfmUp0i9vIq8YEzC5FAYPzE1PU=',
    serialNumber: 'zFpvOxvuewvvUnmE4DncNHELvlTUVs0bVOK/Z9KR3tc=',
    fields: {
      domain: '4Rp/1H7RKPE5zxhzIM5C098sRpvxRlfugVKum6spOGMQ15JBaAh+wntQuxa656JPh3iQ88nDQhqdjzE=',
      identity: 'LZzi8GCRF4SjU63lTorT9ej/Nb8MhW1hASeiJSYT7VOO+pMXJXVingKc+3+ZSW82oIl6BA==',
      when: 'flSOcvWx+MSunYkGeBRkTlj9aDlHxYADecf3Lr13gh/ndrJtouvB+3/75o3C4jpwG2550nxWAHBgR6s5oW+K5PDzKj9G1nPN',
      stake: '1Y4Z1a216atKFQOrUeU+xz8j4PdbD9bIZblHeKMjJNcI1MZYVP0KO6D0LCN0w7A66Pwx2g=='
    },
    keyring: {
      domain: 'onytj0JwhbzNZIhyurV51fPuHV7EL+HtcABrlFTw9kKO49sUQW46QZyH68lk5rTG3FzVJ2ciO1gH1O+frqvwYWzOQPlt5W9WI8IKQUDfuY4=',
      identity: '6gwVIU2mfA7Nxv25xeHUUAM2UPR2alFELrRZv64BgzkHhyvn/Lp7242GIn31kk3+1pQkAjTWJBId62qMuCw5futNxlrEtlJqRmj2KhXkw/c=',
      when: 'TuY8JppuF5BwFRnUdx/CYpRjnUZgxlYqUMrqE6FtMZdy3Kg5SHHnoHK4o9tjoMZE4Ef62v5CQE4z3ONz09r3iTaiWWPL7D9afnEzwkIMzV4=',
      stake: 'Eb8Nc9euJNuXNDRH4/50EQBbSRWWEJ5AvJKB/BFHNWcGIljSt1jE2RMQJmJPXi/OkaQuJuT0CGduPDlh3WbBtBztWXPzxcgdIifNpkV9Cp4='
    }
  },
  exampleResponse: {
    type: 'jVNgF8+rifnz00856b4TkThCAvfiUE4p+t/aHYl1u0c=',
    subject: '02a1c81d78f5c404fd34c418525ba4a3b52be35328c30e67234bfcf30eb8a064d8',
    validationKey: 'ONQPCHi7Kvus7VqrbZCYHB6zTi70U6JV+hLafN9emc8=',
    serialNumber: 'C9JwOFjAqOVgLi+lK7HpHlxHyYtNNN/Fgp9SJmfikh0=',
    fields: {
      domain: '0qfi4dzxZ/+tdiDViZXOPSOSo38hHNpH89+01Rt1JaCldL+zFHhkhcYt5XO5Bd7z3yUt1zP+Sn0hq64=',
      identity: 'f6euJ2qlRS3VRyCY1qD2fcdloUBLsDr98gqNyv/7QzKjUKo2gYQ11mzFGB/lxqAbifL4IQ==',
      when: 'kppntXMUk035dZpTWgshdGqJPcSBvgaUG/qYEtKgOAmsNIe0wndEkUeMVqvyo5RuIrbAspbEpY3dn+J2U7HvRtmCNR9ZxEEJ',
      stake: 'cVfowEAzvbFbAq6xIYcqi0yosFzUIcWWzCIyV0S53nMa//7JVJgZyATANog7absKajq6Qw=='
    },
    revocationOutpoint: '000000000000000000000000000000000000000000000000000000000000000000000000',
    certifier: '025384871bedffb233fdb0b4899285d73d0f0a2b9ad18062a062c01c8bdb2f720a',
    signature: '3045022100a613d9a094fac52779b29c40ba6c82e8deb047e45bda90f9b15e976286d2e3a7022017f4dead5f9241f31f47e7c4bfac6f052067a98021281394a5bc859c5fb251cc'
  },
  func: async (req, res) => {
    try {
      // const checkError = certifierSignCheckArgs({
      //   ...req.body,
      //   certifierPrivateKey,
      //   certificateType
      // })
      // if (checkError) {
      //   return res.status(400).json({
      //     status: 'error',
      //     ...checkError
      //   })
      //}

      // Save the sender's identityKey as the subject of the certificate
      req.body.subject = req.authrite.identityKey

      // NOTE: There is no certificate at this point yet! Maybe there should be an identifier that the user data came from this server?
      // Make sure this certificate has been verified
      // const results = await getVerificationProof(req.authrite.identityKey)
      // Make sure a validated certificate has been added 
      // if (!results || !results.certificate) {
      //   return res.status(400).json({
      //     status: 'error',
      //     code: 'ERR_CERTIFICATE_NOT_VALID',
      //     description: 'The identity certificate information has not been verified or is expired!'
      //   })
      // }

      // Check encrypted fields and decrypt them
      console.log(`REQ BODY TYPE: ${req.body.type}`)
      const decryptedFields = await decryptCertificateFields(req.body, req.body.keyring, certifierPrivateKey)
      let selectedCertificate = certificateTypes[req.body.type];
      if(!selectedCertificate){
        return res.stats(400).json({
          status: 'error',
          code: 'ERR_CERT_TYPE',
          description: 'Selected certificate is not in certifacteTypes'
        })
      }
      const expectedFields = selectedCertificate.fields
  console.log(`EXPECTED FIELDS: ${expectedFields}`)
      // Only validate the expected field keys?
      if (!expectedFields.every(x => !!decryptedFields[x])) {
        return res.status(400).json({
          status: 'error',
          code: 'ERR_EXPECTED_FIELDS',
          description: 'One or more expected certificate fields is missing or invalid.'
        })
      }

      // Create an actual spendable revocation outpoint
      const ninja = new Ninja({
        privateKey: SERVER_PRIVATE_KEY,
        config: {
          dojoURL: DOJO_URL
        }
      })

      // Random key derivation data
      const derivationPrefix = require('crypto')
        .randomBytes(10)
        .toString('base64')
      const derivationSuffix = require('crypto')
        .randomBytes(10)
        .toString('base64')
      const invoiceNumber = `2-3241645161d8-${derivationPrefix} ${derivationSuffix}`

      // Derive a new key for the revocation tx locking script
      const derivedPrivateKey = getPaymentPrivateKey({
        recipientPrivateKey: SERVER_PRIVATE_KEY,
        senderPublicKey: new bsv.PrivateKey(SERVER_PRIVATE_KEY).publicKey.toString('hex'),
        invoiceNumber
      })

      // Create a pushdrop revocation token with the serial number of the certificate to sign
      const lockingScript = await pushdrop.create({
        fields: [
          Buffer.from(req.body.serialNumber)
        ],
        key: derivedPrivateKey
      })

      // Hmac the user data to tag for privacy
     const fieldKey =Object.keys(decryptedFields)[0]
      const fieldValue = crypto.createHmac('sha256', SERVER_PRIVATE_KEY) 
        .update(Object.values(decryptedFields)[0])                            
        .digest('hex')
      const subjectHmac = crypto.createHmac('sha256', SERVER_PRIVATE_KEY)
        .update(req.body.subject)
        .digest('hex')
      
      // Create a new Bitcoin transaction
      const tx = await ninja.getTransactionWithOutputs({
        outputs: [{
          satoshis: 500,
          script: lockingScript,
          tags: [`${fieldKey} ${fieldValue}`, `subject ${subjectHmac}`],
          customInstructions: JSON.stringify({
            derivationPrefix,
            derivationSuffix
          })
        }],
        labels: [
          'SocialCert'
        ],
        note: 'SocialCert Certificate Issuance',
        autoProcess: true
      })

      // Set the revocation outpoint for this certificate
      const revocationOutpoint = tx.txid + '00000000'
      console.log(`REQ.BODY.TYPE ${req.body.type}`)
      console.log(`VREVOCATION OUT POINT: ${revocationOutpoint}`)
      console.log(`CERTIFIER PRIVATE KEY: ${certifierPrivateKey}`)
      const certificate = certifierCreateSignedCertificate({
        ...req.body,
        revocationOutpoint,
        certifierPrivateKey,
        certificateType: req.body.type
      })

      // Save certificate data and revocation key derivation information
      await saveCertificate(req.authrite.identityKey, certificate, tx, derivationPrefix, derivationSuffix)

      // Returns signed cert to the requester
      return res.status(200).json(certificate)
    } catch (e) {
      console.error(e)
      return res.status(500).json({
        status: 'error',
        code: 'ERR_INTERNAL',
        description: 'An internal error has occurred.'
      })
    }
  }
}
