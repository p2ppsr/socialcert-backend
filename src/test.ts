// import {WalletClient, AuthFetch} from "@bsv/sdk"

// (async () => {
// let verifyEmail = "scottindiegrizzell@gmail.com"
// const data = { verifyEmail, funcAction: "verifyCode", verificationCode: '361881' }
// const clientWallet = new WalletClient('json-api', 'localhost')
// const identityKey = await clientWallet.getPublicKey({ identityKey: true })
//   console.log(identityKey)

//   // Cert test
//   // const verificationRequest = await new AuthFetch(clientWallet).fetch('http://localhost:8080/handleEmailVerification', {
//   //   method: 'POST',
//   //   headers:{'Content-Type': 'application/json'},
//   //   body: JSON.stringify(data),
//   //   })

//   const { certificates } = await clientWallet.listCertificates({
//     certifiers: [],
//     types: []
//   })

//   console.log({certificates})
//   //   const verificationRequest = await new AuthFetch(clientWallet).fetch('http://localhost:8080/handleEmailVerification', {
//   //     method: 'POST',
//   //     headers:{'Content-Type': 'application/json'},
//   //     body: JSON.stringify(data),
//   //     })
    
//   // const responseData = await verificationRequest.json()
//   // console.log({responseData})
//   // const result = await clientWallet.acquireCertificate({
//   //   certifier: '02cab461076409998157f05bb90f07886380186fd3d88b99c549f21de4d2511b83',
//   //   certifierUrl: 'http://localhost:8080',
//   //   type: 'exOl3KM0dIJ04EW5pZgbZmPag6MdJXd3/a1enmUU/BA=',
//   //   acquisitionProtocol: 'issuance',
//   //   fields: {
//   //     email: 'scottindiegrizzell@gmail.com'
//   //   }
//   // })
//   // console.log({result})

// })().catch(e => { console.error(e) })