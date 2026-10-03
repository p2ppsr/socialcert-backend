const test = require('node:test')
const assert = require('node:assert/strict')
const { MongoClient } = require('mongodb')
const { AuthFetch, ProtoWallet, PrivateKey } = require('@bsv/sdk')
const { MongoSessionManager } = require('../src/auth/MongoSessionManager')
const { CertifierServer } = require('../src/CertifierServer')
const mongoUrl = process.env.SOCIALCERT_TEST_MONGO_URL

test('shared Mongo authentication: replicas, restart, concurrency, expiry and readiness', { skip: !mongoUrl }, async t => {
  const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 3000 })
  await client.connect()
  const db = client.db('socialcert_auth_test_' + process.pid + '_' + Date.now())
  const servers = []
  const listen = async manager => {
    const wallet = new ProtoWallet(PrivateKey.fromHex('2'.padStart(64, '0')))
    const service = new CertifierServer({}, { port: 0, wallet, monetize: false, sessionManager: manager, checkAuthStore: () => manager.ready() })
    const listener = await new Promise(resolve => {
      const listener = service.app.listen(0, '127.0.0.1', () => { resolve(listener) })
    })
    servers.push(listener)
    return 'http://127.0.0.1:' + listener.address().port
  }
  try {
    const a = new MongoSessionManager(db)
    const b = new MongoSessionManager(db)
    await Promise.all([a.initialize(), b.initialize()])
    const endpoints = [await listen(a), await listen(b)]
    const requests = []
    let next = 0
    const transport = async (url, init) => {
      const parsed = new URL(String(url))
      const endpoint = endpoints[next++ % 2]
      const result = await fetch(endpoint + parsed.pathname, { ...init, signal: AbortSignal.timeout(5000) })
      requests.push({ endpoint, path: parsed.pathname, status: result.status })
      assert.notEqual(result.status, 402, 'No paid endpoints in this fixture')
      return result
    }
    const send = auth => auth.fetch('http://127.0.0.1:19000/handleEmailVerification', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ funcAction: 'fixture-read-only' })
    })
    const expectApplication = async auth => {
      const result = await send(auth)
      assert.equal(result.status, 400)
      assert.equal((await result.json()).code, 'ERR_ACTION')
    }

    await t.test('real signed requests alternate replicas and concurrent requests authenticate', async () => {
      for (let i = 0; i < 8; i++) {
        const auth = new AuthFetch(new ProtoWallet(PrivateKey.fromRandom()), undefined, undefined, undefined, {}, transport)
        for (let j = 0; j < 8; j++) await expectApplication(auth)
        await Promise.all(Array.from({ length: 4 }, () => expectApplication(auth)))
      }
      assert.equal(requests.filter(r => r.status === 401).length, 0)
      assert.equal(requests.filter(r => r.path === '/.well-known/auth').length, 8)
      assert.equal(requests.filter(r => r.path === '/handleEmailVerification').length, 96)
    })

    await t.test('new server instance preserves an established session', async () => {
      const auth = new AuthFetch(new ProtoWallet(PrivateKey.fromRandom()), undefined, undefined, undefined, {}, transport)
      await expectApplication(auth)
      const restarted = new MongoSessionManager(db)
      await restarted.initialize()
      endpoints[1] = await listen(restarted)
      const before = requests.filter(r => r.path === '/.well-known/auth').length
      for (let i = 0; i < 6; i++) await expectApplication(auth)
      assert.equal(requests.filter(r => r.path === '/.well-known/auth').length, before)
    })

    await t.test('session state and one-time claims are atomic across independent managers', async () => {
      const session = { sessionNonce: 'fixture-session', peerIdentityKey: 'fixture-identity', peerNonce: 'fixture-peer', lastUpdate: Date.now(), isAuthenticated: false,
        certificatesRequired: true, certificatePolicy: { certifiers: [], types: {} } }
      await a.addSession(session)
      const first = await a.getSession(session.sessionNonce)
      const delayed = await b.getSession(session.sessionNonce)
      first.isAuthenticated = true
      first.certificatesValidated = true
      await a.updateSession(first)
      delayed.lastUpdate++
      await b.updateSession(delayed)
      const saved = await b.getSession(session.sessionNonce)
      assert.equal(saved.isAuthenticated, true)
      assert.equal(saved.certificatesRequired, true)
      assert.equal(saved.certificatesValidated, true)
      assert.deepEqual(saved.certificatePolicy, session.certificatePolicy)
      delayed.peerIdentityKey = 'changed-identity'
      await assert.rejects(b.updateSession(delayed), /identity changed/)
      const claims = await Promise.all(Array.from({ length: 16 }, (_, i) => (i % 2 ? a : b).claimMessageNonce(session.sessionNonce, 'one-time-fixture')))
      assert.equal(claims.filter(Boolean).length, 1)
      const initial = await Promise.all(Array.from({ length: 16 }, (_, i) => (i % 2 ? a : b).claimInitialRequestNonce('fixture-initial-identity', 'fixture-initial-nonce')))
      assert.equal(initial.filter(Boolean).length, 1)
      await a.removeSession(first) // stale revision must not delete the advanced session
      assert.equal(await b.hasSession(session.sessionNonce), true)
      const current = await b.getSession(session.sessionNonce)
      await b.removeSession(current)
      assert.equal(await a.hasSession(session.sessionNonce), false)
      assert.equal(await a.claimMessageNonce(session.sessionNonce, 'new-message'), false)
    })

    await t.test('idle expiry, absolute expiry, and bounded claim retention fail closed', async () => {
      let now = Date.now()
      const clock = new MongoSessionManager(db, () => now)
      const session = { sessionNonce: 'expiring-session', peerIdentityKey: 'expiry-identity', isAuthenticated: true, lastUpdate: now }
      await clock.addSession(session)
      assert.equal(await clock.claimMessageNonce(session.sessionNonce, 'retained-nonce'), true)
      now += 29 * 60000
      const touch = await clock.getSession(session.sessionNonce)
      touch.lastUpdate = now
      await clock.updateSession(touch)
      now += 2 * 60000
      assert.equal(await clock.claimMessageNonce(session.sessionNonce, 'retained-nonce'), false)
      assert.equal(await clock.hasSession(session.sessionNonce), true)
      now += 31 * 60000
      assert.equal(await clock.hasSession(session.sessionNonce), false)
      touch.lastUpdate = now
      await assert.rejects(clock.updateSession(touch), /expired/)
      assert.equal(await clock.claimMessageNonce(session.sessionNonce, 'late-message'), false)
      const absolute = { sessionNonce: 'absolute-session', lastUpdate: now, isAuthenticated: true }
      await clock.addSession(absolute)
      for (let i = 0; i < 47; i++) {
        now += 29 * 60000
        const active = await clock.getSession(absolute.sessionNonce)
        active.lastUpdate = now
        await clock.updateSession(active)
      }
      now += 2 * 60 * 60000
      assert.equal(await clock.hasSession(absolute.sessionNonce), false)
      await db.collection('authSessions').updateOne({ _id: 'capacity-session' }, { $set: {
        session: { sessionNonce: 'capacity-session', isAuthenticated: true, lastUpdate: now }, expiresAt: new Date(now + 60000),
        absoluteExpiresAt: new Date(now + 60000), revision: 0, messageNonces: Array.from({ length: 4096 }, (_, i) => String(i))
      } }, { upsert: true })
      assert.equal(await clock.claimMessageNonce('capacity-session', 'capacity-overflow'), false)
      for (let i = 0; i < 256; i++) assert.equal(await clock.claimInitialRequestNonce('capacity-identity', String(i)), true)
      assert.equal(await clock.claimInitialRequestNonce('capacity-identity', 'overflow'), false)
      now += 31 * 60000
      assert.equal(await clock.claimInitialRequestNonce('capacity-identity', 'fresh-after-expiry'), true)
    })

    await t.test('readiness checks Mongo; missing store cannot silently use memory', async () => {
      assert.throws(() => new CertifierServer({}, { port: 0, wallet: new ProtoWallet(PrivateKey.fromRandom()), monetize: false }), /Shared authentication/)
      assert.equal((await fetch(endpoints[0] + '/readyz')).status, 200)
      a.ready = async () => { throw new Error('fixture-store-outage') }
      const response = await fetch(endpoints[0] + '/readyz')
      assert.equal(response.status, 503)
      assert.equal((await response.json()).code, 'ERR_AUTH_STORE_UNAVAILABLE')
      assert.equal(await db.collection('verifications').countDocuments(), 0)
      assert.equal(await db.collection('certifications').countDocuments(), 0)
    })
  } finally {
    for (const listener of servers) {
      listener.closeAllConnections()
      await new Promise(resolve => { listener.close(resolve) })
    }
    await db.dropDatabase()
    await client.close()
  }
})
