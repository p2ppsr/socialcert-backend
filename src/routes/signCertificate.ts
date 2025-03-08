import { Response } from 'express'
import { MongoClient } from 'mongodb'
const uri = "mongodb://localhost:27017"; // Local MongoDB connection string
const mongoClient = new MongoClient(uri);

import { Certificate, createNonce, MasterCertificate, Utils, verifyNonce } from '@bsv/sdk'
import { CertifierRoute } from '../CertifierServer';
import { AuthRequest } from '@bsv/auth-express-middleware';

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
export const signCertificate: CertifierRoute = {
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
  func: async (req: AuthRequest, res: Response, server: any) => {
    try {

      if (!req.auth) {
        return res.status(400).json({
          status: 'error',
          description: 'User not authenticated!'
        })
      }

      const { clientNonce, type, fields, masterKeyring } = req.body
      // Verify the client actually created the provided nonce
      await verifyNonce(clientNonce, server.wallet, req.auth.identityKey)

      // Server creates a random nonce that the client can verify
      const serverNonce = await createNonce(server.wallet, req.auth.identityKey)
      // The server computes a serial number from the client and server nonces
      const { hmac } = await server.wallet.createHmac({
        data: Utils.toArray(clientNonce + serverNonce, 'base64'),
        protocolID: [2, 'certificate issuance'],
        keyID: serverNonce + clientNonce,
        counterparty: req.auth.identityKey
      })
      const serialNumber = Utils.toBase64(hmac)


      // Decrypt certificate fields and verify them before signing
      const decryptedFields = await MasterCertificate.decryptFields(
        server.wallet,
        masterKeyring,
        fields,
        req.auth.identityKey
      )

      // Check encrypted fields and decrypt them
      console.log(`REQ BODY TYPE ${req.body.type}`)
      const selectedCertificate = certificateTypes[req.body.type]
      if (!selectedCertificate) {
        return res.status(400).json({
          status: 'error',
          code: 'ERR_CERT_TYPE',
          description: 'Selected certificate is not in certifacteTypes'
        })
      }
      const expectedFields = selectedCertificate.fields
      console.log(`EXPECTED FIELDS: ${expectedFields}`)
      // Only validate the expected field keys?
      if (!expectedFields.every((x: string) => !!decryptedFields[x])) {
        return res.status(400).json({
          status: 'error',
          code: 'ERR_EXPECTED_FIELDS',
          description: 'One or more expected certificate fields is missing or invalid.'
        })
      }
      await mongoClient.connect();
      const certifacteCollection = mongoClient.db('emailCertTesting').collection('certificates');

      const dbCertificate = await certifacteCollection.findOne({
        identityKey: req.auth.identityKey,
        certificateType: selectedCertificate
      });

      if (!dbCertificate) {
        return res.status(400).json({
          status: 'error',
          code: 'ERR_EXPECTED_FIELDS',
          description: 'Certificate could not be found in the database'
        })
      }

      if (!dbCertificate.certificateFields.every((x: string) => !!decryptedFields[x])) {
        return res.status(400).json({
          status: 'error',
          code: 'ERR_EXPECTED_FIELDS',
          description: 'One or more expected certificate fields is missing or invalid.'
        })
      }

      // Create a revocation outpoint (logic omitted for simplicity)
      const revocationTxid = '0000000000000000000000000000000000000000000000000000000000000000'

      const signedCertificate = new Certificate(
        type,
        serialNumber,
        req.auth.identityKey,
        ((await server.wallet.getPublicKey({ identityKey: true })).publicKey),
        `${revocationTxid}.0`,
        fields
      )

      await signedCertificate.sign(server.wallet)

      // Save certificate data and revocation key derivation information
      // await saveCertificate(req.auth?.identityKey, signedCertificate, "not_supported", "not_supported", "not_supported")
      const signedCertificatesCollection = mongoClient.db('emailCertTesting').collection('signedCertificates')

      // TODO: save cert
      await signedCertificatesCollection.updateOne(
            { identityKey: req.auth?.identityKey, signedCertificate: signedCertificatesCollection }, // Updating certificate if already there
            {
              $set: {
                identityKey: req.auth?.identityKey,
                signedCertificate: signedCertificatesCollection,
                createdAt: new Date()  // Optionally update the createdAt timestamp
              }
            },
            { upsert: true }  // This ensures a new document is created if no match is found
          );
      // Returns signed cert to the requester
      return res.status(200).json({
        certificate: signedCertificate,
        serverNonce
      })
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
