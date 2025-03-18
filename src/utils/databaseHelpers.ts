import { MongoClient } from 'mongodb'

// Declare a minimal type for res so that it can be used in writeVerifiedAttributes.
declare const res: {
  status: (code: number) => { json: (body: any) => any }
}

const { NODE_ENV } = process.env
const nodeEnv: string = NODE_ENV! // non-null assertion since NODE_ENV is required
let mongoClient: MongoClient | null = null
const DB_NAME: string = `${nodeEnv}_socialcert`

// Connect to MongoDB if not already connected.
export async function connectToMongoDB(): Promise<void> {
  if (!mongoClient) {
    try {
      const connectionString: string = process.env.SIGNIA_DB_CONNECTION!
      mongoClient = new MongoClient(connectionString)
      await mongoClient.connect()
      console.log('Connected to MongoDB')
    } catch (err) {
      console.error('Error connecting to MongoDB:', err)
      // Handle error, e.g., throw an exception or exit the application.
    }
  }
}

// Ensure a MongoClient instance is available.
export async function getMongoClient(): Promise<MongoClient> {
  if (!mongoClient) {
    await connectToMongoDB()
  }
  return mongoClient!
}

// Writes verified attributes to the verificationData collection.
export const writeVerifiedAttributes = async (
  identityKey: string,
  certificateType: string,
  certificateFields: any
): Promise<any> => {
  const client = await getMongoClient()
  const collection = client.db(DB_NAME).collection('verificationData')
  await collection.updateOne(
    { identityKey, certificateType }, // Update certificate if already exists.
    {
      $set: {
        identityKey,
        certificateType,
        certificateFields,
        createdAt: new Date(), // Optionally update the createdAt timestamp.
      },
    },
    { upsert: true } // This ensures a new document is created if no match is found.
  )

  return res.status(200).json({
    verificationStatus: true,
    certType: certificateType,
  })
}

// Writes a signed certificate to the certifications collection.
export const writeSignedCertificate = async (
  identityKey: string,
  serialNumber: string,
  signedCertificate: any
): Promise<void> => {
  const client = await getMongoClient()
  const collection = client.db(DB_NAME).collection('certifications')

  await collection.updateOne(
    { identityKey, serialNumber }, // Update certificate if already exists.
    {
      $set: {
        identityKey,
        serialNumber,
        signedCertificate,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  )
}

// Deletes all certifications for a given identityKey.
export const deleteUserData = async (identityKey: string): Promise<void> => {
  const client = await getMongoClient()
  await client.db(DB_NAME).collection('certifications').deleteMany({ identityKey })
}

// Loads a certificate from the certifications collection.
export const loadCertificate = async (identityKey: string): Promise<any[]> => {
  const client = await getMongoClient()
  const results = await client
    .db(DB_NAME)
    .collection('certifications')
    .find({ identityKey })
    .project({ certificate: 1 })
    .toArray()

  return results
}
