# Self-hosted runner (local Docker)

A Linux GitHub Actions runner that runs the `Sync Lichess broadcasts` workflow from a Docker
container on a local machine. We use it as the **primary** runner so the long ingest + deploy
job stops burning GitHub-hosted Actions minutes; GitHub-hosted `ubuntu-latest` stays as the
fallback. It is Linux because the OpenNext build/deploy is broken on Windows.

The workflow picks its runner from the `RUNNER_LABELS` repo variable:

```yaml
runs-on: ${{ fromJSON(vars.RUNNER_LABELS || '"ubuntu-latest"') }}
```

- Variable set to `["self-hosted","linux","x64"]` -> the job runs on this local runner (no
  GitHub minutes consumed).
- Variable unset/empty -> the job runs on `ubuntu-latest` (GitHub-hosted). This is the fallback.

GitHub cannot auto-fall-back between runners inside one `runs-on`, so "local first, hosted
fallback" is a one-command flip of that variable, not automatic. If the local machine is off
when the weekly cron fires and `RUNNER_LABELS` is still set, the job queues until the runner is
back online (up to 24h) rather than running on GitHub — clear the variable to force a hosted run.

## Start it

```bash
# 1. Build the image (run from the repo root).
docker build --build-arg RUNNER_VERSION=2.335.1 -t chesscope-runner:latest tooling/self-hosted-runner

# 2. Mint a short-lived registration token (needs gh with repo admin).
RUNNER_TOKEN=$(gh api -X POST repos/bnigatu/chesscope/actions/runners/registration-token -q .token)

# 3. Start the always-on runner container.
docker run -d --restart unless-stopped --name chesscope-runner \
  -e REPO_URL=https://github.com/bnigatu/chesscope \
  -e RUNNER_TOKEN="$RUNNER_TOKEN" \
  -e RUNNER_NAME=chesscope-docker \
  -e RUNNER_LABELS=self-hosted,linux,x64 \
  chesscope-runner:latest
# Do NOT bind-mount a fresh volume at /actions-runner/_work: a new volume mounts root-owned and
# the runner (uid 1001) cannot write to it, so every job fails instantly at checkout. _work lives
# in the container layer (the image chowns it to the runner user) and persists across restarts via
# the --restart policy.

# 4. Point the workflow at it.
gh variable set RUNNER_LABELS --body '["self-hosted","linux","x64"]'
```

The registration token expires in ~1 hour but is only used on the first start; the
container persists its registration across restarts and reboots.

## Fall back to GitHub-hosted

```bash
gh variable delete RUNNER_LABELS    # the workflow goes back to ubuntu-latest
```

## Status / logs / teardown

```bash
docker logs -f chesscope-runner                                 # should say "Listening for Jobs"
gh api repos/bnigatu/chesscope/actions/runners -q '.runners[]|{name,status}'

docker rm -f chesscope-runner                                   # stop + remove
RUNNER_TOKEN=$(gh api -X POST repos/bnigatu/chesscope/actions/runners/remove-token -q .token)
# (or remove the now-offline runner from the repo Settings > Actions > Runners UI)
```

## Housekeeping (disk)

This runner is persistent — `_work` lives in the container layer across runs (unlike a fresh
GitHub-hosted VM). The workflow prunes the ingest download cache itself (an `if: always()` step
deletes `./cache`), but a hard-killed run can still leave scratch in `_work/_temp`. Reclaim disk
periodically:

```bash
docker exec chesscope-runner rm -rf _work/_temp        # clear runner scratch
# or, to fully reset the container (re-registration persists across this? no — recreate + re-register):
docker rm -f chesscope-runner && docker run -d ...      # see "Start it" (needs a fresh RUNNER_TOKEN)
```

## Why ubuntu:24.04 (not node:22-bookworm)

The censusio runner uses `node:22-bookworm`, but chesscope's job runs `actions/setup-python@v5`,
which serves a CPython 3.12 linked against glibc 2.38. Bookworm ships glibc 2.36, so "Set up
Python" fails with `GLIBC_2.38 not found` (a glibc floor, unfixable by apt). `ubuntu:24.04`
(glibc 2.39) is exactly what the `ubuntu-latest` fallback runs, so the toolchain behaves the same
on the local runner and the fallback.
