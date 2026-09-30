#!/bin/sh
# Deploys the jam server at a release tag: ./deploy.sh vX.Y.Z
# It is also the forced command of the CI deploy key, which passes the tag as SSH_ORIGINAL_COMMAND.
set -eu
tag="${1:-${SSH_ORIGINAL_COMMAND:-}}"
case "$tag" in
    *[!0-9v.]* | "") tag_ok=no ;;
    *) tag_ok=yes ;;
esac
if [ "$tag_ok" != yes ] || ! printf '%s' "$tag" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "usage: deploy.sh vX.Y.Z (got '$tag')" >&2
    exit 2
fi
cd "$(dirname "$0")"
curl -fsSL "https://raw.githubusercontent.com/Kickoman/QiYaa-jam/$tag/deploy/compose.yml" -o compose.yml.new
mv compose.yml.new compose.yml
printf 'JAM_TAG=%s\n' "${tag#v}" > tag.env
docker compose --env-file .env --env-file tag.env pull --quiet
docker compose --env-file .env --env-file tag.env up -d
printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$tag" >> deployed.log
echo "deployed $tag"
