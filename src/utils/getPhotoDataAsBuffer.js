const axios = require('axios')

const getPhotoDataAsBuffer = async (url) => {
  try {
    const encodedUrl = encodeURI(url)
    const response = await axios.get(encodedUrl, {
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Bearer ${process.env.PERSONA_TOKEN}`
      }
    })
    return Buffer.from(response.data)
  } catch (error) {
    console.error('Error fetching photo:', error)
    return null
  }
}
module.exports = getPhotoDataAsBuffer
