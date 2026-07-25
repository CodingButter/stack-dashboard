#!/usr/bin/env bash
# Idempotent production installer for the stackdash dashboard on dev-beast.
#
# Run from a checkout (e.g. on bigbeast) that can ssh to dev-beast:
#   bash deploy/install-devbeast.sh
#
# What it does, all idempotently:
#   - rsync the repo to dev-beast:~/stack-dashboard (excludes .git, node_modules,
#     .next, local env/proof artifacts)
#   - copy the production env file if present locally and not yet on the target
#     (never overwrites an existing one; the env file is 0600 and untracked)
#   - pnpm install (frozen), build the Next standalone bundle, assemble the
#     standalone tree (static + public), run drizzle migrations
#   - install the two systemd USER units, enable lingering, enable + restart them
#   - print service status
#
# Requires: passwordless ssh to dev-beast; node+pnpm already on dev-beast.
set -euo pipefail

TARGET="${TARGET:-dev-beast}"
APP_DIR="stack-dashboard"                 # under the remote user's home
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE=".env.production.local"

echo ">> Deploying stackdash to ${TARGET}:~/${APP_DIR}"

# 1. Sync the repo (code only — never local secrets/build/proof).
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env*' \
  --exclude '.mastracode' \
  --exclude '.playwright-mcp' \
  "${HERE}/" "${TARGET}:${APP_DIR}/"

# 2. Env file: copy ONLY if we have one locally and the target lacks one.
#    Never clobber an existing production env on the target.
if [ -f "${HERE}/${ENV_FILE}" ]; then
  if ssh "${TARGET}" "test ! -f ${APP_DIR}/${ENV_FILE}"; then
    scp -q "${HERE}/${ENV_FILE}" "${TARGET}:${APP_DIR}/${ENV_FILE}"
    ssh "${TARGET}" "chmod 600 ${APP_DIR}/${ENV_FILE}"
    echo ">> copied ${ENV_FILE} to target (0600)"
  else
    echo ">> target already has ${ENV_FILE} — preserved"
  fi
else
  echo ">> WARNING: no local ${ENV_FILE}; target must already have one"
fi

# 3. Build + migrate on the target.
ssh "${TARGET}" bash -s <<EOF
set -euo pipefail
cd ${APP_DIR}
export \$(grep -v '^#' ${ENV_FILE} | xargs -d '\n')
echo ">> pnpm install"
pnpm install --frozen-lockfile --prod=false
echo ">> next build (standalone)"
pnpm build
# The standalone server needs the static assets and public/ beside it.
cp -r .next/static .next/standalone/.next/static
if [ -d public ]; then cp -r public .next/standalone/public; fi
echo ">> drizzle migrate"
pnpm exec drizzle-kit migrate
EOF

# 4. Install the two systemd USER units + enable lingering for boot persistence.
ssh "${TARGET}" bash -s <<EOF
set -euo pipefail
mkdir -p ~/.config/systemd/user
cp ~/${APP_DIR}/deploy/stackdash-web.service    ~/.config/systemd/user/
cp ~/${APP_DIR}/deploy/stackdash-poller.service ~/.config/systemd/user/
# Lingering lets user services start at boot without an active login session.
loginctl enable-linger "\$USER" || sudo -n loginctl enable-linger "\$USER" || true
systemctl --user daemon-reload
systemctl --user enable stackdash-web.service stackdash-poller.service
systemctl --user restart stackdash-web.service stackdash-poller.service
sleep 2
systemctl --user --no-pager status stackdash-web.service stackdash-poller.service | sed -n '1,6p'
EOF

echo ">> done. web on :3800 (tailnet + localhost), poller running."
