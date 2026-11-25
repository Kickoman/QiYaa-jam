#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")"
exec 9>deploy.lock
flock 9

compose() {
    preview_env=$1
    shift
    env -u JAM_DIGEST -u JAM_SHA docker compose --project-directory "$PWD" -p qiyaa-jam-preview         -f compose.preview.yml --env-file .env --env-file "$preview_env" "$@"
}

healthy() {
    attempts=0
    while [ "$attempts" -lt 25 ]; do
        if [ "$(curl -fsS --max-time 3 http://127.0.0.1:8091/healthz || true)" = ok ]; then
            return
        fi
        attempts=$((attempts + 1))
        sleep 2
    done
    return 1
}

command=${SSH_ORIGINAL_COMMAND:-}
if [ "$command" = rollback ]; then
    test -s previous.env
    cp previous.env candidate.env
elif printf '%s\n' "$command" | grep -Eq '^deploy sha256:[a-f0-9]{64} [a-f0-9]{40}$' &&
    [ "$(printf '%s' "$command" | tr -cd '\n' | wc -c)" -eq 0 ]; then
    digest=${command#deploy }
    sha=${digest#* }
    printf 'JAM_DIGEST=%s\nJAM_SHA=%s\n' "${digest%% *}" "$sha" > candidate.env
else
    echo "Expected deploy sha256:<digest> <commit-sha> or rollback" >&2
    exit 2
fi
registry_config=
cleanup() {
    rm -f candidate.env
    if [ -n "$registry_config" ]; then
        rm -f "$registry_config/config.json"
        rmdir "$registry_config"
    fi
}
trap cleanup EXIT
if [ "$command" != rollback ]; then
    if IFS= read -r registry_user; then
        registry_config=$(mktemp -d)
        export DOCKER_CONFIG="$registry_config"
        docker login ghcr.io --username "$registry_user" --password-stdin >/dev/null
    fi
    compose candidate.env pull
fi
if ! compose candidate.env up -d --pull never --wait --wait-timeout 60 || ! healthy; then
    echo "Preview failed its health check" >&2
    if [ -s current.env ]; then
        compose current.env up -d --pull never --wait --wait-timeout 60
        healthy
    else
        compose candidate.env stop
    fi
    exit 1
fi
if ! cmp -s candidate.env current.env; then
    retired=$(sed -n 's/^JAM_DIGEST=//p' previous.env 2>/dev/null || true)
    if [ -s current.env ]; then cp current.env previous.env; fi
    mv candidate.env current.env
    if [ -n "$retired" ] && ! grep -Fxq "JAM_DIGEST=$retired" current.env previous.env; then
        docker image rm "ghcr.io/kickoman/qiyaa-jam-preview@$retired" >/dev/null 2>&1 || true
    fi
fi
printf '%s %s\n' "$(date -u +%FT%TZ)" "$(tr '\n' ' ' < current.env)" >> deployed.log
