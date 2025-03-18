const { MongoClient } = require('mongodb')

const {
  NODE_ENV
} = process.env

let mongoClient
const DB_NAME = `${NODE_ENV}_socialcert`

async function connectToMongoDB() {
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

async function getMongoClient() {
  if (!mongoClient) {
    await connectToMongoDB()
  }
  return mongoClient
}

const writeVerifiedAttributes = (async (identityKey, certificateType, certificateFields) => {
  const mongoClient = await getMongoClient()

  mongoClient.db(`${DB_NAME}`).collection('verificationData');

  await certificationsCollection.updateOne(
    { identityKey:identityKey, certificateType: certificateType }, // Updating certificate if already there
    {
      $set: {
        identityKey: identityKey,
        certificateType: certificateType,
        certificateFields: certificateFields,
        createdAt: new Date()  // Optionally update the createdAt timestamp
      }
    },
    { upsert: true }  // This ensures a new document is created if no match is found
  );

  return res.status(200).json({
   verificationStatus: true,
   certType: certificateType
  })
})();

const writeSignedCertificate = async (identityKey, serialNumber, signedCertificate) =>{
  const mongoClient = await getMongoClient()

   mongoClient.db(`${DB_NAME}`).collection('certificates')

  await mongoClient.updateOne(
        { identityKey: identityKey, serialNumber: serialNumber }, // Updating certificate if already there
        {
          $set: {
            identityKey: identityKey,
            serialNumber: serialNumber,
            signedCertificate: signedCertificate,
            createdAt: new Date()  
          }
        },
        { upsert: true }  // This ensures a new document is creatd if no match is found
      );
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
  loadCertificate,
  deleteUserData,
  connectToMongoDB,
  getMongoClient,
  writeVerifiedAttributes,
  writeSignedCertificate,
}
