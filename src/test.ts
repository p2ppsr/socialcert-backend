import {WalletClient, AuthFetch} from "@bsv/sdk"

(async () => {
const clientWallet = new WalletClient('json-api', 'localhost')
  const identityKey = await clientWallet.getPublicKey({ identityKey: true })
  console.log(identityKey)

  // Cert test
  const verificationRequest = await new AuthFetch(clientWallet).fetch('http://localhost:8080/handleEmailVerification', {
    method: 'POST',
    headers:{'Content-Type': 'applciation'},
    body: JSON.stringify({
      funcAction: 'sendEmail',
      email: 'scottindiegrizzell@gmail.com'
    })
    
  })
  const responseData = await verificationRequest.json()
  console.log({responseData})
//   const result = await clientWallet.acquireCertificate({
//     certifier: '02cab461076409998157f05bb90f07886380186fd3d88b99c549f21de4d2511b83',
//     certifierUrl: 'http://localhost:8080',
//     type: 'exOl3KM0dIJ04EW5pZgbZmPag6MdJXd3/a1enmUU/BA=',
//     acquisitionProtocol: 'issuance',
//     fields: {
//       email: 'scottindiegrizzell@gmail.com'
//     }
//   })

})().catch(e => { console.error(e) })