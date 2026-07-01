# Self-hosted GitHub Actions runner for chesscope. It is Linux on purpose: the OpenNext
# build/deploy is broken on Windows (its bundler emits a dynamic require that fails at
# runtime), so the deploy must run on Linux. The sync-broadcasts workflow installs Python
# and Node itself (actions/setup-python, actions/setup-node), so this image only carries
# the runner agent, git, and the runner's own dependencies.
#
# Base is ubuntu:24.04 (NOT node:22-bookworm like the censusio runner). actions/setup-python@v5
# serves a CPython 3.12 linked against glibc 2.38; bookworm ships glibc 2.36, so the workflow's
# "Set up Python" step dies with `GLIBC_2.38 not found` (it's a glibc floor, unfixable by apt).
# ubuntu:24.04 ships glibc 2.39 and is exactly what the ubuntu-latest fallback runs, so
# setup-python / setup-node / OpenNext behave identically. Node is not preinstalled here — the
# workflow's setup-node provides it, and the runner agent uses its own bundled Node for JS actions.
#
# Build:  docker build --build-arg RUNNER_VERSION=2.335.1 -t chesscope-runner:latest tooling/self-hosted-runner
# Run:    see tooling/self-hosted-runner/README.md (needs a short-lived registration token).
FROM ubuntu:24.04

ARG RUNNER_VERSION=2.335.1

# Base tools plus the runner agent and its dependencies. installdependencies.sh pulls libicu
# and friends; we run it as root at build time so no sudo is needed at run time. zstd is added
# so actions/cache (cache:pip, cache:npm) uses zstd instead of the slower gzip fallback, matching
# GitHub-hosted runners.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates git jq sudo zstd \
  && useradd -m runner \
  && mkdir -p /actions-runner \
  && chown runner:runner /actions-runner \
  && cd /actions-runner \
  && curl -fsSL -o runner.tar.gz \
       "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
  && tar xzf runner.tar.gz \
  && rm runner.tar.gz \
  && ./bin/installdependencies.sh \
  && chown -R runner:runner /actions-runner \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /actions-runner
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
# Strip any CRLF (the file may be authored on Windows) so the Linux shebang works, then make
# it executable.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

USER runner
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
