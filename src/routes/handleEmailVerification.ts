require('dotenv').config()
import { MongoClient } from "mongodb";
import { Response } from 'express';
import { AuthRequest } from '@bsv/auth-express-middleware'
import { VerificationCheck } from "../types/twilio"
import { certificateType } from "../certificates/emailcert";
import { CertifierRoute } from "../CertifierServer";
const uri = "mongodb://localhost:27017/emailCertTesting"; // Local MongoDB connection string
const mongoClient = new MongoClient(uri);
const accountSid = process.env.TWILIO_ACCOUNT_SID as string
const authToken = process.env.TWILIO_AUTH_TOKEN as string
const serviceSid = process.env.TWILIO_SERVICE_SID as string
import twilio from 'twilio'
const client = twilio(accountSid, authToken)

export const checkEmailVerification: CertifierRoute = {
  type: 'post',
  path: '/handleEmailVerification',
  summary: 'Submit KYC verification proof for the current user',
  parameters: {
    email: {
      email: 'Code exchanged for authorization token from Discord' // TODO: Write docuentation
    },
    certificateFields: {}
  },
  exampleResponse: {
    status: 'verified | notVerified'
  },
  func: async (req: AuthRequest, res: Response) => {
    if (req.body.funcAction === 'sendEmail') {
      console.log("INSIDE SEND EMAIL FUNC");
      sendEmailFunc(req, res)
    } else if (req.body.funcAction === 'verifyCode') {
      console.log('INSIDE VERIFY CODE IF STATEMENT')
      verifyCode(req, res)
    }
  }
}

async function sendEmailFunc(req: AuthRequest, res: Response) {
  try {
    const email = req.body.email
    client.verify.v2.services(serviceSid)
      .verifications
      .create({ to: email, channel: 'email' })
    return res.status(200).json({
      emailSentStatus: true,
      sentEmail: email
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({
      textSentStatus: false,
      code: 'ERR_INTERNAL'
    })
  }
}

async function verifyCode(req: AuthRequest, res: Response) {
  console.log('RIGHT BEFORE TRYING TO VERIFY CODE')
  // client.verify.v2.services(serviceSid)
  //   .verificationChecks
  //   .create({ to: req.body.verifyEmail, code: req.body.verificationCode })
  //   .then((verificationCheck: VerificationCheck) => {
      if (true) {
        // Ugly async wrapping

       (async () => {
        console.log("Inside If")

          await mongoClient.connect();
          console.log("After mongoclient connect")
          const db = mongoClient.db('emailCertTesting');
          const certificationsCollection = db.collection('certificates');

          await certificationsCollection.updateOne(
            { identityKey: req.auth?.identityKey, certificateType: certificateType }, // Updating certificate if already there
            {
              $set: {
                identityKey: req.auth?.identityKey,
                certificateType: certificateType,
                certificateFields: {
                  email: req.body.verifyEmail,
                },
                createdAt: new Date()  // Optionally update the createdAt timestamp
              }
            },
            { upsert: true }  // This ensures a new document is created if no match is found
          );

          // If stuck look at coolcert repo
          // in index.ts add a createwallet look line 26 in coolcert server code on index.ts
          return res.status(200).json({
           verificationStatus: true
          })
        })();
      } else {
        console.log('INSIDE FAILED')
        return res.status(200).json({
          verificationStatus: false
        })
      }
    //})
}
