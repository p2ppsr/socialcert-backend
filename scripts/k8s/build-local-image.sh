#!/usr/bin/env bash
set -euo pipefail

if [[ "${ENVIRONMENT:-}" != "prod" && "${ENVIRONMENT:-}" != "production" ]]; then
  echo "ENVIRONMENT=prod is required" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

source_sha="${SOURCE_SHA:-$(git rev-parse HEAD)}"
short_sha="${source_sha:0:12}"
image_date="${IMAGE_DATE:-$(date -u +%F)}"
image_tag="${IMAGE_TAG:-${short_sha}-prod-${image_date}}"
registry_push="${REGISTRY_PUSH:-10.152.183.28:5000}"
registry_pull="${REGISTRY_PULL:-registry.cars-operator-system.svc.cluster.local:5000}"

push_image="${registry_push}/p2ppsr/socialcert-backend:${image_tag}"
pull_image="${registry_pull}/p2ppsr/socialcert-backend:${image_tag}"

docker build --build-arg SOURCE_COMMIT="${source_sha}" -t "${push_image}" .
# The scoped runner intentionally has no host compiler/Python toolchain.
# Validate the exact candidate in its existing build/runtime environment.
docker run --rm --network none "${push_image}" sh -c \
  'npm run lint && npm run typecheck && npm test && npm run build'
docker push "${push_image}"

# Pin the pushed content, rather than asking Kubernetes to resolve a mutable tag.
image_digest="$(docker image inspect "${push_image}" --format '{{index .RepoDigests 0}}')"
image_digest="${image_digest##*@}"
if [[ ! "${image_digest}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo 'Unable to establish the pushed image digest' >&2
  exit 1
fi
immutable_image="${registry_pull}/p2ppsr/socialcert-backend@${image_digest}"

cat > release-manifest.json <<EOF
{
  "source_sha": "${source_sha}",
  "environment": "prod",
  "image_tag": "${image_tag}",
  "image": "${immutable_image}",
  "image_digest": "${image_digest}"
}
EOF

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'image_tag=%s\n' "${image_tag}"
    printf 'image=%s\n' "${immutable_image}"
    printf 'image_digest=%s\n' "${image_digest}"
  } >> "${GITHUB_OUTPUT}"
fi

printf 'Pushed image %s\n' "${pull_image}"
