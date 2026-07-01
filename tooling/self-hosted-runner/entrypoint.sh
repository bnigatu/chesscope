#!/usr/bin/env bash
# Registers the runner on first start using the short-lived RUNNER_TOKEN, then runs it. The
# .runner config persists in the container layer, so a restart (or a reboot, with the
# container's --restart policy) skips re-registration and just runs. Only the very first
# start needs a valid RUNNER_TOKEN.
set -euo pipefail
cd /actions-runner

if [ ! -f .runner ]; then
  : "${REPO_URL:?REPO_URL required for first registration}"
  : "${RUNNER_TOKEN:?RUNNER_TOKEN required for first registration}"
  ./config.sh --unattended --replace \
    --url "$REPO_URL" \
    --token "$RUNNER_TOKEN" \
    --name "${RUNNER_NAME:-chesscope-docker}" \
    --labels "${RUNNER_LABELS:-self-hosted,linux,x64}" \
    --work _work
fi

exec ./run.sh
