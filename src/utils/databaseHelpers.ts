import { MongoClient } from 'mongodb'
import { validAttributes, VERIFICATION_MAX_AGE_MS } from '../certifier'

let mongoClient: MongoClient | null = null
let connecting: Promise<MongoClient> | undefined
export const socialDatabaseName = (): string => `${process.env.NODE_ENV || 'development'}_socialcert`

export async function getMongoClient(): Promise<MongoClient> {
  if (mongoClient) return mongoClient
  if (!connecting) {
    connecting = (async () => {
      if (!process.env.SIGNIA_DB_CONNECTION) throw new Error('Database not configured')
      const client = new MongoClient(process.env.SIGNIA_DB_CONNECTION, {
        serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, socketTimeoutMS: 10000
      })
      try {
        await client.connect()
        mongoClient = client
        return client
      } catch (error) {
        await client.close().catch(() => undefined)
        throw error
      }
    })()
  }
  try { return await connecting } finally { connecting = undefined }
}

export async function connectToMongoDB(): Promise<void> { await getMongoClient() }

export async function writeVerifiedAttributes(identityKey: string, type: string, verifiedAttributes: Record<string, string>): Promise<void> {
  if (!identityKey || !validAttributes(type, verifiedAttributes)) throw new Error('Invalid verification decision')
  const client = await getMongoClient()
  await client.db(socialDatabaseName()).collection('verifications').updateOne(
    { identityKey, type },
    { $set: { identityKey, type, verifiedAttributes, createdAt: new Date() } },
    { upsert: true }
  )
}

export async function findVerifiedAttributes(identityKey: string, type: string): Promise<any> {
  const client = await getMongoClient()
  return await client.db(socialDatabaseName()).collection('verifications').findOne({
    identityKey, type, createdAt: { $gte: new Date(Date.now() - VERIFICATION_MAX_AGE_MS) }
  }, { sort: { createdAt: -1 } })
}

export async function writeSignedCertificate(identityKey: string, serialNumber: string, signedCertificate: any): Promise<void> {
  const client = await getMongoClient()
  await client.db(socialDatabaseName()).collection('certifications').updateOne(
    { identityKey, serialNumber },
    { $set: { identityKey, serialNumber, signedCertificate, createdAt: new Date() } },
    { upsert: true }
  )
}

// Existing request nonce/payload identifies an attempt, with no new wire member.
export async function getIssuance(id: string): Promise<any> {
  const client = await getMongoClient()
  return await client.db(socialDatabaseName()).collection('issuanceOperations').findOne({ _id: id as any })
}

export async function beginIssuance(id: string): Promise<any> {
  const client = await getMongoClient()
  const operations = client.db(socialDatabaseName()).collection('issuanceOperations')
  const result = await operations.updateOne(
    { _id: id as any }, { $setOnInsert: { state: 'pending', createdAt: new Date() } }, { upsert: true }
  )
  if (result.upsertedCount === 1) return { state: 'new' }
  return await operations.findOne({ _id: id as any })
}

export async function completeIssuance(id: string, response: any): Promise<void> {
  const client = await getMongoClient()
  const result = await client.db(socialDatabaseName()).collection('issuanceOperations').updateOne(
    { _id: id as any, state: 'pending' },
    { $set: { state: 'completed', response, completedAt: new Date() } }
  )
  if (result.matchedCount !== 1) throw new Error('Issuance operation could not be completed')
}

export async function deleteUserData(identityKey: string): Promise<void> {
  const client = await getMongoClient()
  await client.db(socialDatabaseName()).collection('certifications').deleteMany({ identityKey })
}

export async function loadCertificate(identityKey: string): Promise<any[]> {
  const client = await getMongoClient()
  return await client.db(socialDatabaseName()).collection('certifications')
    .find({ identityKey }).project({ signedCertificate: 1 }).toArray()
}
