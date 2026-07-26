#!/usr/bin/env bash
# Pull-based redeploy for the stackdash dashboard. Runs ON dev-beast itself.
#
#   ssh dev-beast 'cd ~/stack-dashboard && bash deploy/redeploy.sh'
#
# What it does, all idempotently:
#   - git pull the current branch (fast-forward only) from origin
#   - pnpm install (frozen), build the Next standalone bundle, assemble the
#     standalone tree (static + public), run drizzle migrations
#   - reinstall the two systemd USER units (in case they changed), restart them
#   - print service status
#
# The production env file (.env.production.local, 0600, untracked) is never
# touched — it stays put across pulls.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_DIR}/.env.production.local"
cd "${REPO_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  echo ">> ERROR: ${ENV_FILE} missing — cannot deploy without production env." >&2
  exit 1
fi

echo ">> git pull (fast-forward only) on $(git branch --show-current)"
git pull --ff-only

echo ">> loading env"
set -a
# shellcheck disable=SC1090
export $(grep -v '^#' "${ENV_FILE}" | xargs -d '\n')
set +a

echo ">> pnpm install"
pnpm install --frozen-lockfile --prod=false

echo ">> next build (standalone)"
pnpm build

# The standalone server needs the static assets and public/ beside it.
# IMPORTANT: replace (don't nest). `cp -r src dst` when dst exists copies INTO
# dst, producing .next/standalone/.next/static/static/... — the standalone
# server then serves LAST deploy's chunks while the HTML references the NEW
# hashes, which shows up in the browser as a ChunkLoadError ("This page
# couldn't load") on every redeploy. Wipe the destination first so the fresh
# chunk hashes are the only ones present.
echo ">> assemble standalone tree"
rm -rf .next/standalone/.next/static
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
if [ -d public ]; then rm -rf .next/standalone/public && cp -r public .next/standalone/public; fi

echo ">> drizzle migrate"
pnpm exec drizzle-kit migrate

echo ">> install + restart systemd user units"
mkdir -p ~/.config/systemd/user
cp deploy/stackdash-web.service    ~/.config/systemd/user/
cp deploy/stackdash-poller.service ~/.config/systemd/user/
loginctl enable-linger "$USER" 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user enable stackdash-web.service stackdash-poller.service
systemctl --user restart stackdash-web.service stackdash-poller.service
sleep 2
systemctl --user --no-pager status stackdash-web.service stackdash-poller.service | sed -n '1,6p'

echo ">> done. deployed $(git log --oneline -1). web on :3800, poller running."
