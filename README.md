# SocialCert Backend

SocialCert Key Registry Certificate Issuance Server

A Stageline ("socialcert") deployment of the master branch of this repository is available at [https://staging-backend.socialcert.net](https://staging-backend.socialcert.net)

Having a SocialCert certificate allows you to register your MetaNet Identity with the key registry.

[UI for interacting with SocialCert](https://github.com/p2ppsr/socialcert-ui) as well.

## The SocialCert Certificate

## License

The license for the code in this repository is the Open BSV License.
# Shared authentication sessions

Production authentication uses `authSessions` and `authInitialNonces` in the
existing `${NODE_ENV}_socialcert` Mongo database via `SIGNIA_DB_CONNECTION`.
Startup creates additive indexes before accepting requests; `/readyz` checks
the store while `/healthz` remains process liveness. Database failures do not
fall back to local sessions. Session and claim writes require journaled majority
acknowledgment; no wallet key is stored in these collections.

Sessions expire after 30 minutes idle or 24 hours absolute lifetime. Signed
nonce claims are atomic and retained inside their session for its whole lifetime,
with 4,096 claims per session. Initial nonce claims are bounded to 256 per
identity in a sliding 30-minute window. Clients must establish a new session
after expiry/capacity. Mongo TTL cleanup is eventual; reads and updates enforce
expiry themselves. Concurrent updates cannot weaken authentication flags, change
established identities, or erase newer policy state.

Run the real Mongo integration suite with
`SOCIALCERT_TEST_MONGO_URL=mongodb://127.0.0.1:27017 npm test`. It uses disposable
test databases, synthetic wallets and unsupported provider actions, and performs
no email delivery, wallet transactions or real certificate issuance. CI supplies
an isolated Mongo service; offline image-build tests skip this integration suite.
The deployment workflow supports `candidate_only=true` for amd64 build and push
before operator canary qualification. Ordinary master pushes deploy production.
