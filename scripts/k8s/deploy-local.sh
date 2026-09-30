#!/usr/bin/env bash
set -euo pipefail

if [[ "${ENVIRONMENT:-}" != "prod" && "${ENVIRONMENT:-}" != "production" ]]; then
  echo "ENVIRONMENT=prod is required" >&2
  exit 2
fi

if [[ ! "${IMAGE_DIGEST:-}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo 'IMAGE_DIGEST is required and must name immutable pushed content' >&2
  exit 2
fi

if [[ -z "${IMAGE_TAG:-}" ]]; then
  if [[ -z "${SOURCE_SHA:-}" ]]; then
    echo "IMAGE_TAG or SOURCE_SHA is required" >&2
    exit 2
  fi
  IMAGE_TAG="${SOURCE_SHA:0:12}-prod-$(date -u +%F)"
fi

repo_root="$(git rev-parse --show-toplevel)"
registry_pull="${REGISTRY_PULL:-registry.cars-operator-system.svc.cluster.local:5000}"
kubectl_cmd="${KUBECTL:-kubectl}"
tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "${tmp_dir}"; }
trap cleanup EXIT

mkdir -p "${tmp_dir}/infra"
cp -R "${repo_root}/infra/kubernetes" "${tmp_dir}/infra/kubernetes"

overlay_dir="${tmp_dir}/infra/kubernetes/overlays/prod"
kustomization="${overlay_dir}/kustomization.yaml"

export IMAGE_TAG IMAGE_DIGEST REGISTRY_PULL="${registry_pull}"
perl -0pi -e 's#newName: [^\n]*/p2ppsr/socialcert-backend#newName: $ENV{REGISTRY_PULL}/p2ppsr/socialcert-backend#g' "${kustomization}"
perl -0pi -e 's#newTag: [^\n]+#digest: $ENV{IMAGE_DIGEST}#g' "${kustomization}"

# Gateway routes and their TLS listeners are owned by network-ops. Preserve
# those objects and refuse a release if the existing customer route is absent.
"${kubectl_cmd}" -n socialcert-backend-prod get httproutes.gateway.networking.k8s.io -o json |
  jq -e 'any(.items[]; .metadata.generation as $generation |
    ((.spec.hostnames // []) | index("backend.socialcert.net")) != null and
    any(.spec.rules[]?.backendRefs[]?; .name == "socialcert-backend" and .port == 8080) and
    any(.status.parents[]?.conditions[]?; .type == "Accepted" and .status == "True" and .observedGeneration == $generation))' >/dev/null

rendered="${tmp_dir}/rendered.yaml"
"${kubectl_cmd}" kustomize "${overlay_dir}" > "${rendered}"
if grep -Eq 'kind: Ingress|ingressClassName: nginx' "${rendered}"; then
  echo 'Refusing to recreate retired Ingress routing' >&2
  exit 1
fi

"${kubectl_cmd}" apply -f "${overlay_dir}/namespace.yaml"
"${kubectl_cmd}" apply -f "${rendered}"
"${kubectl_cmd}" -n socialcert-backend-prod rollout status deployment/socialcert-backend --timeout=15m
"${kubectl_cmd}" -n socialcert-backend-prod wait --for=condition=Ready certificate/socialcert-backend-tls --timeout=15m

expected_image="${registry_pull}/p2ppsr/socialcert-backend@${IMAGE_DIGEST}"
"${kubectl_cmd}" -n socialcert-backend-prod get deployment socialcert-backend -o json |
  jq -e --arg image "${expected_image}" '
    .status.observedGeneration == .metadata.generation and
    .spec.replicas == 2 and .status.updatedReplicas == 2 and
    .status.readyReplicas == 2 and .status.availableReplicas == 2 and
    .spec.template.spec.containers[0].image == $image' >/dev/null
"${kubectl_cmd}" -n socialcert-backend-prod get pods -l app.kubernetes.io/name=socialcert-backend -o json |
  jq -e --arg digest "${IMAGE_DIGEST}" '
    [.items[] | select(.metadata.deletionTimestamp == null) |
      .status.containerStatuses[]? | select(.ready == true)] as $ready |
    ($ready | length) == 2 and all($ready[]; .imageID | endswith("@" + $digest))' >/dev/null
"${kubectl_cmd}" -n socialcert-backend-prod get endpointslices.discovery.k8s.io -l kubernetes.io/service-name=socialcert-backend -o json |
  jq -e '[.items[].endpoints[]? | select(.conditions.ready == true) | .nodeName] | unique | length == 2' >/dev/null

"${kubectl_cmd}" -n socialcert-backend-prod run "socialcert-backend-smoke-$(date +%s)" \
  --quiet \
  --rm \
  -i \
  --restart=Never \
  --image=curlimages/curl:8.11.1 \
  --command -- curl --fail --show-error --silent http://socialcert-backend:8080/healthz

printf 'socialcert-backend prod deployment completed for image %s\n' "${expected_image}"
