require('dotenv').config()
import { Request, Response } from 'express';
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const serviceSid = process.env.TWILIO_SERVICE_SID
const client = require('twilio')(accountSid, authToken)
import {VerificationCheck } from "../types/twilio"

module.exports = {
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
  func: async (req: Request, res: Response) => {
    if (req.body.funcAction === 'sendEmail') {
      sendEmailFunc(req, res)
    } else if (req.body.funcAction === 'verifyCode') {
      console.log('INSIDE VERIFY CODE IF STATEMENT')
      verifyCode(req, res)
    }
  }
}

async function sendEmailFunc (req: Request, res: Response) {
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

async function verifyCode (req: Request, res: Response) {
  console.log('RIGHT BEFORE TRYING TO VERIFY CODE')
  client.verify.v2.services(serviceSid)
    .verificationChecks
    .create({ to: req.body.verifyEmail, code: req.body.verificationCode })
    .then((verificationCheck: VerificationCheck) => {
      if (verificationCheck.status === 'approved') {
        console.log('INSIDE APPROVED')
        return res.status(200).json({
          verificationStatus: true
        })
      } else {
        console.log('INSIDE FAILED')
        return res.status(200).json({
          verificationStatus: false
        })
      }
    })
}
