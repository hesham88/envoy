#!/usr/bin/env bash
# One-time, run by the owner (it uses your GitHub login): enables automatic deploys from `main`.
#   1. Sets the public Firebase web config and reCAPTCHA site key as GitHub Actions secrets
#      (read from apps/web/.env.local; the App Check debug token is never uploaded).
#   2. Reminds you to create the deploy key with `firebase init hosting:github`.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=apps/web/.env.local
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE"; exit 1; }
while IFS='=' read -r key value; do
  case "$key" in
    VITE_FIREBASE_*|VITE_RECAPTCHA_SITE_KEY)
      if [ -n "$value" ]; then printf '%s' "$value" | gh secret set "$key" -R hesham88/envoy && echo "set $key"; fi ;;
  esac
done < "$ENV_FILE"
echo
echo "Next (interactive, opens GitHub in your browser):"
echo "  firebase init hosting:github --project envoy-hybrid-ai"
echo "    repository: hesham88/envoy"
echo "    'Set up the workflow to run a build script before every deploy?'  -> No"
echo "    'Set up automatic deployment to your site's live channel when a PR is merged?' -> No"
echo "    (our workflows already exist; we only need the FIREBASE_SERVICE_ACCOUNT_ENVOY_HYBRID_AI secret it creates)"
