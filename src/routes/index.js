module.exports = [
  require('./initialRequest'),
  require('./identify'),
  require('./checkVerification'),
  require('./signCertificate'),
  require('./revokeCertificate'),
  require("./sendVerificationText"),
  require("./handleXVerification")
]
