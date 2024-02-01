// Discordcert Certificate Type Definition
//
// An Authrite Certifier defines one or more certificate types that they issue and manage.
// The certificate type encompasses a list of fields and their expected and valid values.
// A certificate type is assigned a unique identifier which must be a random 32 byte value
// encoded as a base64 string.
// A new certificate type identifier can be generated by the following code:
//      require('crypto').randomBytes(32).toString('base64')
//
// Do not re-use type identifiers. The value is not private, so we keep it here with the
// certificate structure definition.
//
// The purpose of this certificate is to server as a self-certified external identity to
// be associated with the certificate owner.
const certificateType = 'z40BOInXkI8m7f/wBrv4MJ09bZfzZbTj2fJqCtONqCY='
const certificateDefinition = {
  username: 'John Discord',
  profilePhoto: 'https://cdn.discordapp.com/avatars/${id}/${avatar}.png' // Profile picture of discord account hosted by discord's CDN
}
const certificateFields = Object.keys(certificateDefinition)

module.exports = {
  certificateType,
  certificateDefinition,
  certificateFields
}
