const { MongoClient } = require('mongodb')

const {
  NODE_ENV
} = process.env

let mongoClient
const DB_NAME = `${NODE_ENV}_signicert`

async function connectToMongoDB () {
  if (!mongoClient) {
    try {
      mongoClient = new MongoClient(process.env.SIGNIA_DB_CONNECTION, { useUnifiedTopology: true })
      await mongoClient.connect()
      console.log('Connected to MongoDB')
    } catch (err) {
      console.error('Error connecting to MongoDB:', err)
      // Handle error, e.g., throw an exception or exit the application.
    }
  }
}

async function getMongoClient () {
  if (!mongoClient) {
    await connectToMongoDB()
  }
  return mongoClient
}

// unsure what identityKey is
const saveCertificate = async (identityKey, certificate, tx, derivationPrefix, derivationSuffix) => {
  const mongoClient = await getMongoClient()

  // Inserts certified data for created user
  await mongoClient.db(`${DB_NAME}`).collection('certifications').insertOne({
    identityKey,
    certificate, 
    tx, 
    derivationPrefix,
    derivationSuffix,
    createdAt: new Date()
  })
  
}



const getVerificationProof = async (identityKey) => {
  const mongoClient = await getMongoClient()

  // Filter by identity key and identityKey
  const filter = {
    identityKey,
  }

  // Only select relevant data
  const projection = {
    certificate: 1
  }

  // Return the matching result
  return await mongoClient.db(`${DB_NAME}`).collection('certifications').findOne(filter, { projection })
}

const getRevocationData = async (identityKey, serialNumber) => {
  const mongoClient = await getMongoClient()

  // Filter by identity key or certificate serialNumber
  const filter = {
    $or: [
      { identityKey },
      { 'certificate.serialNumber': serialNumber }
    ]
  }

  // Only select relevant data
  const projection = {
    tx: 1,
    derivationPrefix: 1,
    derivationSuffix: 1,
    'certificate.serialNumber': 1,
    _id: 1
  }

  // Return the matching result
  return await mongoClient.db(`${DB_NAME}`).collection('certifications').findOne(filter, { projection })
}

const insertRevocationRecord = async (_id, tx) => {
  const mongoClient = await getMongoClient()
  // Add the revocation tx to the revoked certificate
  const filter = {
    _id
  }
  const update = {
    $set: {
      revocationTx: tx,
      updatedAt: new Date()
    }
  }

  await mongoClient.db(`${DB_NAME}`).collection('certifications').updateOne(filter, update)
}

const deleteUserData = async (identityKey) => {
  const mongoClient = await getMongoClient()

  await mongoClient.db(`${DB_NAME}`).collection('certifications').deleteMany({
    identityKey
  })
}

const loadCertificate = async (identityKey) => {
  const mongoClient = await getMongoClient()

  const results = await mongoClient.db(`${DB_NAME}`).collection('certifications').find({
    identityKey
  }).project({ certificate: 1 }).toArray()

  return results
}

module.exports = {
  saveCertificate,
  getVerificationProof,
  getRevocationData,
  loadCertificate,
  deleteUserData,
  insertRevocationRecord,
  connectToMongoDB,
  getMongoClient
}
