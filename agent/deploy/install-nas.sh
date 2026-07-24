#!/usr/bin/env bash
# Idempotent installer for the NAS command-center agent.
#
# Run FROM dev-beast (or any control box with ssh to the NAS):
#   bash agent/deploy/install-nas.sh
#
# What it does, all idempotently:
#   - rsync/scp the agent sources to NAS /usr/local/bin/nas-agent/
#   - install the systemd unit
#   - generate a bearer token on first install (preserved on re-install),
#     store it 0600 at NAS /etc/nas-agent/token, and echo it so the caller
#     can put it in dev-beast .env.local as AGENT_TOKEN (never committed)
#   - enable + restart the service, then print status
#
# Requires: passwordless ssh to $NAS_HOST as a user with sudo -n (root).
set -euo pipefail

NAS_HOST="${NAS_HOST:-nas}"
AGENT_DIR="/usr/local/bin/nas-agent"
TOKEN_DIR="/etc/nas-agent"
TOKEN_FILE="${TOKEN_DIR}/token"
UNIT_DST="/etc/systemd/system/nas-agent.service"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "${HERE}/.." && pwd)"   # the agent/ directory

echo ">> Installing NAS agent to ${NAS_HOST}:${AGENT_DIR}"

# 1. Ensure target dirs exist (root).
ssh "${NAS_HOST}" "sudo -n mkdir -p ${AGENT_DIR} ${TOKEN_DIR} && sudo -n chmod 700 ${TOKEN_DIR}"

# 2. Copy agent sources (stdlib-only: nas_agent.py, statlib.py, controlib.py).
#    Copy to a temp dir first, then sudo-move into place (scp can't sudo).
TMP="$(ssh "${NAS_HOST}" 'mktemp -d')"
# -O forces the legacy SCP protocol; UGOS's sshd SFTP subsystem rejects the
# modern (SFTP-backed) transfer to a directory target.
scp -O -q "${SRC}/nas_agent.py" "${SRC}/statlib.py" "${SRC}/controlib.py" "${NAS_HOST}:${TMP}/"
ssh "${NAS_HOST}" "sudo -n cp ${TMP}/nas_agent.py ${TMP}/statlib.py ${TMP}/controlib.py ${AGENT_DIR}/ \
  && sudo -n chmod 755 ${AGENT_DIR}/*.py && rm -rf ${TMP}"

# 3. Generate token on first install, preserve on re-install.
ssh "${NAS_HOST}" "
  if sudo -n test ! -s ${TOKEN_FILE}; then
    umask 077
    sudo -n sh -c 'openssl rand -hex 32 > ${TOKEN_FILE}'
    sudo -n chmod 600 ${TOKEN_FILE}
    echo '>> generated new token'
  else
    echo '>> token already present — preserved'
  fi
"

# 4. Install unit and (re)start.
scp -O -q "${HERE}/nas-agent.service" "${NAS_HOST}:/tmp/nas-agent.service"
ssh "${NAS_HOST}" "sudo -n cp /tmp/nas-agent.service ${UNIT_DST} && rm -f /tmp/nas-agent.service \
  && sudo -n systemctl daemon-reload \
  && sudo -n systemctl enable nas-agent.service >/dev/null 2>&1 \
  && sudo -n systemctl restart nas-agent.service"

sleep 2
ssh "${NAS_HOST}" "sudo -n systemctl is-active nas-agent.service && sudo -n systemctl status nas-agent.service --no-pager -l | head -n 12"

echo
echo ">> AGENT_TOKEN (put this in dev-beast .env.local, do not commit):"
ssh "${NAS_HOST}" "sudo -n cat ${TOKEN_FILE}"
