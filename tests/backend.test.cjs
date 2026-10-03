const test = require('node:test')
const assert = require('node:assert/strict')
const { PrivateKey, ProtoWallet, Certificate, MasterCertificate, createNonce, verifyNonce, Utils } = require('@bsv/sdk')
const { createSignCertificate } = require('../src/routes/signCertificate')
const { createEmailVerification } = require('../src/routes/handleEmailVerification')
const { createXVerification } = require('../src/routes/handleXVerification')
const { createDiscordVerification } = require('../src/routes/handleDiscordVerification')
const { checkVerification } = require('../src/routes/checkVerification')
const { issuerMetadata } = require('../src/routes/metadata')
const { certificateType: emailType } = require('../src/certificates/emailcert')
const { certificateType: xType } = require('../src/certificates/xcert')
const { certificateType: discordType } = require('../src/certificates/discordcert')

const email = 'alice@example.invalid'
const profile = { userName: 'synthetic-account', profilePhoto: 'https://example.invalid/avatar.png' }
function response() {
  return { statusCode: 200, sends: 0, status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; this.sends++; return this } }
}
async function invoke(route, body, subject = 'fixture-subject', server = {}) {
  const res = response()
  await route.func({ body, auth: subject ? { identityKey: subject } : undefined }, res, server)
  assert.equal(res.sends, 1)
  return res
}
async function signingFixture(type = emailType, attributes = { email }) {
  const client = new ProtoWallet(PrivateKey.fromHex('1'.padStart(64, '0')))
  const issuer = new ProtoWallet(PrivateKey.fromHex('2'.padStart(64, '0')))
  const subject = (await client.getPublicKey({ identityKey: true })).publicKey
  const issuerKey = (await issuer.getPublicKey({ identityKey: true })).publicKey
  const { certificateFields: fields, masterKeyring } = await MasterCertificate.createCertificateFields(client, issuerKey, attributes)
  const clientNonce = await createNonce(client, issuerKey)
  const body = { type, fields, masterKeyring, clientNonce }
  const operations = new Map()
  const fixture = { client, issuer, issuerKey, subject, attributes, body, writes: 0,
    evidence: { identityKey: subject, type, verifiedAttributes: attributes, createdAt: new Date() } }
  fixture.dependencies = {
    findVerifiedAttributes: async () => fixture.evidence,
    getIssuance: async id => operations.get(id),
    beginIssuance: async id => {
      if (operations.has(id)) return operations.get(id)
      operations.set(id, { state: 'pending' })
      return { state: 'new' }
    },
    completeIssuance: async (id, value) => operations.set(id, { state: 'completed', response: JSON.parse(JSON.stringify(value)) }),
    writeSignedCertificate: async () => { fixture.writes++ }
  }
  fixture.route = createSignCertificate(fixture.dependencies)
  fixture.run = async (request = body, requestSubject = subject) => invoke(fixture.route, request, requestSubject, { wallet: issuer })
  return fixture
}

for (const [name, type, fields] of [['Email', emailType, { email }], ['X', xType, profile], ['Discord', discordType, profile]]) {
  test(name + ': real encrypted issuance has independently valid signature, serial, binding and plaintext', async () => {
    const f = await signingFixture(type, fields)
    const result = await f.run()
    assert.equal(result.statusCode, 200)
    const c = result.body.certificate
    assert.equal(c.subject, f.subject)
    assert.equal(c.certifier, f.issuerKey)
    assert.equal(c.type, type)
    assert.deepEqual(c.fields, f.body.fields)
    assert.equal(c.revocationOutpoint, '0'.repeat(64) + '.0')
    const independent = new Certificate(c.type, c.serialNumber, c.subject, c.certifier, c.revocationOutpoint, c.fields, c.signature)
    assert.equal(await independent.verify(), true)
    assert.equal(await verifyNonce(result.body.serverNonce, f.client, f.issuerKey), true)
    const serial = await f.client.createHmac({
      data: Utils.toArray(f.body.clientNonce + result.body.serverNonce, 'base64'),
      protocolID: [2, 'certificate issuance'], keyID: result.body.serverNonce + f.body.clientNonce, counterparty: f.issuerKey
    })
    assert.equal(c.serialNumber, Utils.toBase64(serial.hmac))
    assert.deepEqual({ ...await MasterCertificate.decryptFields(f.client, f.body.masterKeyring, c.fields, f.issuerKey) }, fields)
    assert.equal(f.writes, 1)
    const replay = await f.run()
    assert.deepEqual(JSON.parse(JSON.stringify(replay.body)), JSON.parse(JSON.stringify(result.body)))
    assert.equal(f.writes, 1)
  })
}

test('completed exact request re-delivery survives later evidence expiry/change without new signing', async () => {
  const f = await signingFixture()
  const first = await f.run()
  f.evidence = undefined
  const replay = await f.run()
  assert.equal(replay.statusCode, 200)
  assert.deepEqual(JSON.parse(JSON.stringify(replay.body)), JSON.parse(JSON.stringify(first.body)))
  assert.equal(f.writes, 1)
})

test('family/subject/value/missing/historical/expired evidence is rejected before signing', async () => {
  const f = await signingFixture(xType, profile)
  const valid = f.evidence
  for (const evidence of [
    undefined,
    { ...valid, type: discordType },
    { ...valid, identityKey: 'another-fixture-subject' },
    { ...valid, verifiedAttributes: { ...profile, userName: 'different-account' } },
    { ...valid, verifiedAttributes: { email } },
    { ...valid, type: undefined },
    { ...valid, createdAt: new Date(Date.now() - 901000) },
    { ...valid, createdAt: new Date(Date.now() + 60000) }
  ]) {
    f.evidence = evidence
    const r = await f.run()
    assert.equal(r.statusCode, 409)
    assert.equal(r.body.code, 'ERR_VERIFICATION_REQUIRED')
    assert.equal(f.writes, 0)
  }
})

test('exact encrypted field/key schema, malformed nonce, and disabled type fail closed', async () => {
  const f = await signingFixture()
  for (const body of [
    { ...f.body, fields: { ...f.body.fields, extra: 'unchecked' } },
    { ...f.body, masterKeyring: {} },
    { ...f.body, masterKeyring: { ...f.body.masterKeyring, extra: 'unchecked' } },
    { ...f.body, clientNonce: Utils.toBase64(new Array(48).fill(0)) },
    { ...f.body, clientNonce: 'invalid!' },
    { ...f.body, fields: { email: 'not-ciphertext' } },
    { ...f.body, type: 'mffUklUzxbHr65xLohn0hRL0Tq2GjW1GYF/OPfzqJ6A=' }
  ]) {
    const r = await f.run(body)
    assert.equal(r.statusCode, 400)
    assert.equal(f.writes, 0)
  }
  assert.equal((await f.run(f.body, null)).statusCode, 401)
})

test('DB read/write or issuer failure cannot return acquisition success; pending remains honest', async () => {
  for (const dependency of ['getIssuance', 'findVerifiedAttributes', 'writeSignedCertificate', 'completeIssuance']) {
    const f = await signingFixture()
    f.dependencies[dependency] = async () => { throw new Error('fixture storage unavailable') }
    const r = await f.run()
    assert.equal(r.statusCode, 503)
    assert.equal(r.body.certificate, undefined)
  }
  const f = await signingFixture()
  f.dependencies.writeSignedCertificate = async () => { throw new Error('fixture failure after signing') }
  assert.equal((await f.run()).statusCode, 503)
  assert.equal((await f.run()).body.code, 'ERR_ISSUANCE_PENDING')
})

test('concurrent duplicate CSR yields one signature/storage write and a pending or completed peer', async () => {
  const f = await signingFixture()
  const [a, b] = await Promise.all([f.run(), f.run()])
  assert.equal([a, b].filter(r => r.statusCode === 200).length, 1)
  assert.equal([a, b].filter(r => r.statusCode === 409).length, 1)
  assert.equal(f.writes, 1)
})

function emailRoute(send, check, persist = async () => {}) {
  return createEmailVerification({
    provider: () => ({ verify: { v2: { services: () => ({
      verifications: { create: send }, verificationChecks: { create: check }
    }) } } }),
    writeVerifiedAttributes: persist
  })
}
test('Email delivery waits for provider acceptance and never claims inbox delivery or false success', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const route = emailRoute(() => pending, async () => ({}))
  const res = response()
  const request = route.func({ body: { funcAction: 'sendEmail', email }, auth: { identityKey: 'synthetic' } }, res)
  await new Promise(done => { setImmediate(done) })
  assert.equal(res.sends, 0)
  resolve({ status: 'pending', to: email })
  await request
  assert.equal(res.body.emailSentStatus, true)
  for (const send of [
    async () => { throw { response: { status: 429, data: 'private fixture token' } } },
    async () => { throw new Error('private fixture token') },
    async () => ({ status: 'failed', to: email }),
    async () => ({ status: 'pending', to: 'wrong@example.invalid' })
  ]) {
    const r = await invoke(emailRoute(send, async () => ({})), { funcAction: 'sendEmail', email })
    assert.notEqual(r.statusCode, 200)
    assert.equal(r.body.emailSentStatus, undefined)
    assert.ok(!JSON.stringify(r.body).includes('private fixture token'))
  }
})

test('Email persists only approved same-mailbox evidence under authenticated subject, without code', async () => {
  let recorded
  const route = emailRoute(async () => ({}), async () => ({ status: 'approved', to: email }), async (...args) => { recorded = args })
  const r = await invoke(route, { funcAction: 'verifyCode', verifyEmail: email, verificationCode: '123456' })
  assert.equal(r.body.verificationStatus, true)
  assert.deepEqual(recorded, ['fixture-subject', emailType, { email }])
  for (const result of [{ status: 'pending', to: email }, { status: 'approved', to: 'other@example.invalid' }]) {
    recorded = undefined
    const denied = await invoke(emailRoute(async () => ({}), async () => result, async (...args) => { recorded = args }),
      { funcAction: 'verifyCode', verifyEmail: email, verificationCode: '123456' })
    assert.equal(denied.body.verificationStatus, false)
    assert.equal(recorded, undefined)
  }
  const failed = await invoke(emailRoute(async () => ({}), async () => ({ status: 'approved', to: email }), async () => { throw new Error('DB offline') }),
    { funcAction: 'verifyCode', verifyEmail: email, verificationCode: '123456' })
  assert.equal(failed.statusCode, 503)
  assert.equal(failed.body.verificationStatus, undefined)
  assert.equal((await invoke(route, { funcAction: 'unknown' })).statusCode, 400)
})

function xFixture() {
  const f = { recorded: undefined, deleted: false, filters: [], record: { _id: 'fixture', requestTokenSecret: 'fixture-secret' } }
  const requests = {
    insertOne: async value => { f.inserted = value },
    findOneAndUpdate: async filter => { f.filters.push(filter); return { value: f.record } },
    deleteOne: async () => { f.deleted = true }
  }
  f.http = {
    post: async (url, _body, options) => { assert.equal(options.timeout, 10000); return ({ data: url.includes('request_token')
      ? 'oauth_token=fixture-request&oauth_token_secret=fixture-secret&oauth_callback_confirmed=true'
      : 'oauth_token=fixture-access&oauth_token_secret=fixture-access-secret' }) },
    get: async (_url, options) => { assert.equal(options.timeout, 10000); return ({ data: { screen_name: profile.userName, profile_image_url_https: profile.profilePhoto } }) }
  }
  f.dependencies = { http: f.http, getMongoClient: async () => ({ db: () => ({ collection: () => requests }) }),
    writeVerifiedAttributes: async (...args) => { f.recorded = args }, oauth: () => ({ authorize: () => ({}), toHeader: () => ({ Authorization: 'synthetic' }) }) }
  f.route = createXVerification(f.dependencies)
  return f
}
test('X persists exactly returned provider attributes, subject/freshness-binds OAuth request, then removes temporary secret', async () => {
  const f = xFixture()
  const begin = await invoke(f.route, { funcAction: 'makeRequest' })
  assert.equal(begin.statusCode, 200)
  assert.equal(f.inserted.identityKey, 'fixture-subject')
  assert.ok(f.inserted.createdAt instanceof Date)
  const r = await invoke(f.route, { funcAction: 'getUserInfo', oauthToken: 'fixture-request', oauthVerifier: 'fixture-verifier' })
  assert.equal(r.statusCode, 200)
  assert.deepEqual(r.body, profile)
  assert.deepEqual(f.recorded, ['fixture-subject', xType, profile])
  assert.equal(f.deleted, true)
  assert.equal(f.filters[0].identityKey, 'fixture-subject')
  assert.ok(f.filters[0].createdAt.$gte instanceof Date)
  assert.deepEqual(f.filters[0].processing, { $ne: true })
})
test('X missing/expired OAuth state and failed provider/storage never return attributes as verified', async () => {
  for (const fault of ['state', 'provider', 'storage', 'attributes']) {
    const f = xFixture()
    if (fault === 'state') f.record = undefined
    if (fault === 'provider') f.http.get = async () => { throw { response: { status: 401, data: 'secret' } } }
    if (fault === 'storage') f.dependencies.writeVerifiedAttributes = async () => { throw new Error('storage') }
    if (fault === 'attributes') f.http.get = async () => ({ data: { screen_name: profile.userName } })
    const r = await invoke(f.route, { funcAction: 'getUserInfo', oauthToken: 'fixture-request', oauthVerifier: 'fixture-verifier' })
    assert.notEqual(r.statusCode, 200)
    assert.equal(r.body.userName, undefined)
    assert.equal(f.deleted, false)
  }
})
function discordFixture(user = { id: '123456789012345678', username: profile.userName, avatar: 'abcdef' }) {
  const f = { recorded: undefined }
  f.http = { post: async () => ({ data: { access_token: 'fixture-private-token' } }),
    get: async () => ({ status: 200, data: { user } }) }
  f.dependencies = { http: f.http, writeVerifiedAttributes: async (...args) => { f.recorded = args } }
  f.route = createDiscordVerification(f.dependencies)
  return f
}
test('Discord returns and stores same provider profile with no token/code in decision', async () => {
  const f = discordFixture()
  const r = await invoke(f.route, { funcAction: 'getDiscordData', accessCode: 'fixture-private-code' })
  assert.equal(r.statusCode, 200)
  assert.deepEqual(f.recorded, ['fixture-subject', discordType, r.body])
  assert.ok(!JSON.stringify(r.body).includes('fixture-private'))
})
test('Discord provider/storage/missing profile failures and legacy generic route cannot report verification', async () => {
  for (const fault of ['provider', 'storage', 'attributes']) {
    const f = discordFixture(fault === 'attributes' ? { id: 'synthetic', avatar: null } : undefined)
    if (fault === 'provider') f.http.post = async () => { throw new Error('fixture-private-token') }
    if (fault === 'storage') f.dependencies.writeVerifiedAttributes = async () => { throw new Error('storage') }
    const r = await invoke(f.route, { funcAction: 'getDiscordData', accessCode: 'fixture-private-code' })
    assert.notEqual(r.statusCode, 200)
    assert.equal(r.body.userName, undefined)
  }
  assert.equal((await invoke(checkVerification, { preVerifiedData: { verificationType: 'email', email } })).statusCode, 410)
})

test('metadata uses actual injected issuer identity and preserves enabled exact types/sentinel limits', async () => {
  const issuer = new ProtoWallet(PrivateKey.fromHex('2'.padStart(64, '0')))
  const metadata = await issuerMetadata(issuer, 'test')
  assert.equal(metadata.version, require('../package.json').version)
  assert.equal(metadata.issuer.publicKey, (await issuer.getPublicKey({ identityKey: true })).publicKey)
  assert.deepEqual(metadata.families.filter(f => f.enabled).map(f => f.type), [emailType, xType, discordType])
  assert.equal(metadata.families.find(f => f.name === 'Telephone').enabled, false)
  assert.equal(metadata.verification.maxAgeSeconds, 900)
  assert.equal(metadata.revocation.supported, false)
  assert.equal(metadata.publication.required, false)
  await assert.rejects(() => issuerMetadata({ getPublicKey: async () => { throw new Error('unavailable') } }, 'test'))
})


test('Discord maps authenticated default avatars for migrated and legacy accounts', async () => {
  for (const [discriminator, expected] of [['0', '5'], ['1234', '4']]) {
    const f = discordFixture({ id: '20971520', username: 'synthetic', avatar: null, discriminator })
    const r = await invoke(f.route, { funcAction: 'getDiscordData', accessCode: 'synthetic-code' })
    assert.equal(r.statusCode, 200)
    assert.equal(r.body.profilePhoto, 'https://cdn.discordapp.com/embed/avatars/' + expected + '.png')
    assert.deepEqual(f.recorded, ['fixture-subject', discordType, r.body])
  }
})

test('provider exceptions do not disclose sensitive config or log payloads', async () => {
  const captured = []
  const originalLog = console.log
  const originalError = console.error
  console.log = (...args) => { captured.push(args) }
  console.error = (...args) => { captured.push(args) }
  try {
    const f = discordFixture()
    f.http.post = async () => { throw { config: { headers: { Authorization: 'fixture-private-token' } }, response: { status: 401, data: 'fixture-private-code' } } }
    const r = await invoke(f.route, { funcAction: 'getDiscordData', accessCode: 'fixture-private-code' })
    assert.equal(r.statusCode, 503)
    assert.ok(!JSON.stringify(r.body).includes('fixture-private'))
    assert.deepEqual(captured, [])
  } finally {
    console.log = originalLog
    console.error = originalError
  }
})


test('Discord refuses malformed default-avatar evidence instead of fabricating an image', async () => {
  for (const user of [
    { id: '20971520', username: 'synthetic', avatar: null },
    { id: '20971520', username: 'synthetic', avatar: null, discriminator: 'abc' },
    { id: 'not-a-snowflake', username: 'synthetic', avatar: null, discriminator: '0' }
  ]) {
    const f = discordFixture(user)
    const r = await invoke(f.route, { funcAction: 'getDiscordData', accessCode: 'synthetic-code' })
    assert.equal(r.statusCode, 422)
    assert.equal(f.recorded, undefined)
  }
})


test('local HTTP BRC authentication transports real encrypted issuance and leaves metadata public', { timeout: 15000 }, async () => {
  const { CertifierServer } = require('../src/CertifierServer')
  const { AuthFetch } = require('@bsv/sdk')
  const f = await signingFixture()
  const { SessionManager } = require('@bsv/sdk')
  const service = new CertifierServer({}, { port: 0, wallet: f.issuer, monetize: false, sessionManager: new SessionManager() })
  // Test-only downstream route uses the production global authentication
  // middleware and the same signing handler with an isolated fixture store.
  service.app.post('/fixture-issuance', (req, res) => f.route.func(req, res, service))
  const listener = await new Promise(resolve => {
    const listener = service.app.listen(0, '127.0.0.1', () => { resolve(listener) })
  })
  const base = 'http://127.0.0.1:' + listener.address().port
  try {
    const metadata = await fetch(base + '/metadata')
    assert.equal(metadata.status, 200)
    assert.equal((await metadata.json()).issuer.publicKey, f.issuerKey)
    const anonymous = await fetch(base + '/fixture-issuance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f.body)
    })
    assert.notEqual(anonymous.status, 200)
    assert.equal(f.writes, 0)
    const client = new AuthFetch(f.client)
    const result = await client.fetch(base + '/fixture-issuance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f.body)
    })
    assert.equal(result.status, 200)
    const { certificate: c } = await result.json()
    assert.equal(c.subject, f.subject)
    assert.equal(c.certifier, f.issuerKey)
    assert.equal(await new Certificate(c.type, c.serialNumber, c.subject, c.certifier, c.revocationOutpoint, c.fields, c.signature).verify(), true)
    assert.deepEqual({ ...await MasterCertificate.decryptFields(f.client, f.body.masterKeyring, c.fields, f.issuerKey) }, { email })
    assert.equal(f.writes, 1)
  } finally {
    listener.closeAllConnections()
    await new Promise(resolve => { listener.close(resolve) })
  }
})
