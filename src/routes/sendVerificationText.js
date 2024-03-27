require('dotenv').config();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_SERVICE_SID;
const client = require('twilio')(accountSid, authToken);
const verificationCode = Math.floor(100000 + Math.random() * 900000);

module.exports = {
  type: 'post',
  path: '/sendVerificationText',
  summary: 'Submit KYC verification proof for the current user',
  parameters: {
    phoneNumber: {
      phoneNumber: 'Code exchanged for authorization token from Discord' // TODO: Write docuentation
    },
    certificateFields: {}
  },
  exampleResponse: {
    status: 'verified | notVerified'
  },
  func: async (req, res) => {
    if (req.body.funcAction == "sendText") {
      console.log("INSIDE SEND TEXT IF STATEMENT")
      sendTextFunc(req, res)
    }

    else if (req.body.funcAction == "verifyCode") {
      verifyCodeFunc(req, res)
    }

  }
}

async function sendTextFunc(req, res) {
  try {
    const phoneNumber = req.body.phoneNumber;
    const textSent = req.body.textSent;
    client.verify.v2.services(serviceSid)
      .verifications
      .create({ to: phoneNumber, channel: 'sms', code: verificationCode, }) // TODO: Double check that this is actually sending random code
    return res.status(200).json({
      textSentStatus: true,
      textSentPhonenumber: phoneNumber
    })

  } catch (e) {
    console.error(e)
    res.status(500).json({
      textSentStatus: false,
      code: "ERR_INTERNAL"
    })
  }
}

async function verifyCodeFunc(req, res) {
  try {

    client.verify.v2.services(serviceSid)
      .verificationChecks
      .create({ to: req.body.phoneNumber, code: req.body.verificationCode })
      .then(verificationCheck => {
        if (verificationCheck.status === 'approved') {
          console.log('Verification successful!')
          return res.status(200).json({
            verificationStatus: true,
            verifiedPhonenumber: req.body.phoneNumber
          })
        } else {
          console.log('Verification failed.')
          return res.status(200).json({
            verificationStatus: false
          })
        }
      })
  } catch (e) {
    console.error(e)
    res.status(500).json({
      code: "Error trying to verify text code"
    })
  }
}