import { AsyncSessionManager, PeerSession } from '@bsv/sdk'
import { Collection, Db, MongoServerError } from 'mongodb'
import { createHash } from 'crypto'

const IDLE_MS = 30 * 60 * 1000
const MAX_LIFETIME_MS = 24 * 60 * 60 * 1000
const MAX_MESSAGE_NONCES = 4096
const MAX_INITIAL_NONCES = 256
const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value))
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const digest = (value: string): string => createHash('sha256').update(value).digest('hex')

interface SessionRow {
  _id: string
  session: PeerSession
  revision: number
  expiresAt: Date
  absoluteExpiresAt: Date
  messageNonces: string[]
}
interface InitialRow {
  _id: string
  claims: { nonce: string, at: Date }[]
  expiresAt: Date
  lastClaimAccepted: boolean
}

/** Shared BRC-103 state. Mongo operations fail closed; no memory fallback. */
export class MongoSessionManager implements AsyncSessionManager {
  private readonly sessions: Collection<SessionRow>
  private readonly initials: Collection<InitialRow>
  private readonly snapshots = new WeakMap<PeerSession, SessionRow>()

  constructor(db: Db, private readonly now: () => number = Date.now) {
    const options = { writeConcern: { w: 'majority' as const, j: true, wtimeoutMS: 5000 } }
    this.sessions = db.collection('authSessions', options)
    this.initials = db.collection('authInitialNonces', options)
  }

  async initialize(): Promise<void> {
    await this.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    await this.sessions.createIndex({ 'session.peerIdentityKey': 1, 'session.lastUpdate': -1 })
    await this.initials.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  }

  async ready(): Promise<void> { await this.sessions.findOne({}, { projection: { _id: 1 }, maxTimeMS: 2000 }) }

  private validate(session: PeerSession): void {
    if (!session.sessionNonce || session.sessionNonce.length > 256 ||
      !Number.isSafeInteger(session.lastUpdate) || session.lastUpdate < 0 ||
      session.lastUpdate > this.now() + 10000 ||
      Buffer.byteLength(JSON.stringify(session)) > 65536) throw new Error('Invalid authentication session')
  }

  async addSession(session: PeerSession): Promise<void> {
    this.validate(session)
    const at = this.now()
    const row: SessionRow = { _id: session.sessionNonce, session: copy(session), revision: 0,
      expiresAt: new Date(Math.min(session.lastUpdate + IDLE_MS, at + MAX_LIFETIME_MS)),
      absoluteExpiresAt: new Date(at + MAX_LIFETIME_MS), messageNonces: [] }
    await this.sessions.insertOne(row)
    this.snapshots.set(session, row)
  }

  async getSession(identifier: string): Promise<PeerSession | undefined> {
    const active = { expiresAt: { $gt: new Date(this.now()) } }
    const row = await this.sessions.findOne({ _id: identifier, ...active }) ??
      await this.sessions.findOne({ 'session.peerIdentityKey': identifier, ...active }, { sort: { 'session.lastUpdate': -1, _id: 1 } })
    if (!row) return undefined
    const session = copy(row.session)
    this.snapshots.set(session, row)
    return session
  }

  async hasSession(identifier: string): Promise<boolean> { return (await this.getSession(identifier)) !== undefined }

  async updateSession(session: PeerSession): Promise<void> {
    this.validate(session)
    const original = this.snapshots.get(session)
    if (!original) throw new Error('Authentication session must be loaded before update')
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await this.sessions.findOne({ _id: session.sessionNonce, expiresAt: { $gt: new Date(this.now()) } })
      if (!current) throw new Error('Authentication session expired')
      const merged = copy(current.session)
      for (const key of ['sessionNonce', 'peerNonce', 'peerIdentityKey'] as const) {
        if (current.session[key] && session[key] && current.session[key] !== session[key]) throw new Error('Authentication session identity changed')
      }
      for (const key of Object.keys(session) as (keyof PeerSession)[]) {
        if (key === 'lastUpdate') { merged.lastUpdate = Math.max(current.session.lastUpdate, session.lastUpdate); continue }
        if (key === 'isAuthenticated' || key === 'certificatesRequired' || key === 'certificatesValidated') {
          if (session[key] !== undefined) (merged as any)[key] = current.session[key] === true || session[key] === true
          continue
        }
        if (equal(session[key], original.session[key])) continue
        if (!equal(current.session[key], original.session[key]) && !equal(current.session[key], session[key])) throw new Error('Concurrent authentication policy change')
        ;(merged as any)[key] = copy(session[key])
      }
      for (const key of Object.keys(original.session) as (keyof PeerSession)[]) {
        if (!(key in session) && !['sessionNonce', 'peerNonce', 'peerIdentityKey', 'isAuthenticated', 'certificatesRequired', 'certificatesValidated'].includes(key)) {
          if (!equal(current.session[key], original.session[key])) throw new Error('Concurrent authentication policy change')
          delete merged[key]
        }
      }
      this.validate(merged)
      const expiresAt = new Date(Math.min(merged.lastUpdate + IDLE_MS, current.absoluteExpiresAt.getTime()))
      const result = await this.sessions.updateOne({ _id: current._id, revision: current.revision, expiresAt: { $gt: new Date(this.now()) } },
        { $set: { session: merged, expiresAt }, $inc: { revision: 1 } })
      if (result.matchedCount === 1) {
        this.snapshots.set(session, { ...current, session: copy(merged), expiresAt, revision: current.revision + 1 })
        return
      }
    }
    throw new Error('Authentication session contention')
  }

  async removeSession(session: PeerSession): Promise<void> {
    const original = this.snapshots.get(session)
    if (!original) throw new Error('Authentication session must be loaded before removal')
    // A delayed replica cannot remove a session advanced by another replica.
    await this.sessions.deleteOne({ _id: original._id, revision: original.revision })
  }

  async claimMessageNonce(sessionNonce: string, messageNonce: string): Promise<boolean> {
    if (!messageNonce || messageNonce.length > 256) throw new Error('Invalid authentication nonce')
    // Claims live in the session document: unique, atomic, bounded, and retained
    // for the entire session lifetime even when its idle deadline advances.
    const hash = digest(messageNonce)
    const result = await this.sessions.updateOne({ _id: sessionNonce, expiresAt: { $gt: new Date(this.now()) },
      messageNonces: { $ne: hash }, $expr: { $lt: [{ $size: '$messageNonces' }, MAX_MESSAGE_NONCES] } },
    { $push: { messageNonces: hash } })
    return result.modifiedCount === 1
  }

  async claimInitialRequestNonce(identityKey: string, initialNonce: string): Promise<boolean> {
    if (!identityKey || identityKey.length > 256 || !initialNonce || initialNonce.length > 256) throw new Error('Invalid authentication nonce')
    const at = new Date(this.now())
    const hash = digest(initialNonce)
    const pipeline = [
      { $set: { claims: { $filter: { input: { $ifNull: ['$claims', []] }, as: 'claim', cond: { $gt: ['$$claim.at', new Date(at.getTime() - IDLE_MS)] } } } } },
      { $set: { lastClaimAccepted: { $and: [{ $not: [{ $in: [hash, '$claims.nonce'] }] }, { $lt: [{ $size: '$claims' }, MAX_INITIAL_NONCES] }] } } },
      { $set: { claims: { $cond: ['$lastClaimAccepted', { $concatArrays: ['$claims', [{ nonce: hash, at }]] }, '$claims'] },
        expiresAt: { $cond: ['$lastClaimAccepted', new Date(at.getTime() + IDLE_MS), '$expiresAt'] } } }
    ]
    const filter = { _id: digest(identityKey) }
    try {
      const result = await this.initials.findOneAndUpdate(filter, pipeline, { upsert: true, returnDocument: 'after' })
      return result.value?.lastClaimAccepted === true
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error
      // Only a proven concurrent first insert is retried, never an uncertain write.
      const result = await this.initials.findOneAndUpdate(filter, pipeline, { returnDocument: 'after' })
      return result.value?.lastClaimAccepted === true
    }
  }
}
