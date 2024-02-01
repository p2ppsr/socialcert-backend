const {
  PERSONA_TOKEN
} = process.env

const getVerificationInfo = async (verificationId) => {
  // Validate the verificationId using the Persona API
  const response = await fetch(`https://withpersona.com/api/v1/inquiries/${verificationId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${PERSONA_TOKEN}`
    }
  })

  return await response.json()
}
module.exports = { getVerificationInfo }
