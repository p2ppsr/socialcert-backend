require('dotenv').config()
import { MongoClient } from "mongodb";
import { Response } from 'express';
import { AuthRequest } from '@bsv/auth-express-middleware'
import { VerificationCheck } from "../types/twilio"
import { certificateType } from "../certificates/emailcert";
import { CertifierRoute } from "../CertifierServer";
import { writeVerifiedCertifcate } from '../utils/databaseHelpers'
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
      sendEmailFunc(req, res)
    } else if (req.body.funcAction === 'verifyCode') {
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
  client.verify.v2.services(serviceSid)
    .verificationChecks
    .create({ to: req.body.verifyEmail, code: req.body.verificationCode })
    .then((verificationCheck: VerificationCheck) => {
      if (verificationCheck.status === 'approved') {
      (async () =>{
        await writeVerifiedCertifcate;
      })() 
      } else {
        console.log('INSIDE FAILED')
        return res.status(200).json({
          verificationStatus: false
        })
      }
    })
}
