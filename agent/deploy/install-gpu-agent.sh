#!/usr/bin/env bash
# Idempotent installer for a GPU-node telemetry agent (bigbeast, zenbeast).
#
# Run from a control box with ssh to the target:
#   GPU_HOST=bigbeast bash agent/deploy/install-gpu-agent.sh
#   GPU_HOST=zenbeast bash agent/deploy/install-gpu-agent.sh
#
# Installs the SAME stdlib-python agent in gpu-node role: telemetry-only
# (/health /stats /smart /gpu + tdarr-node journal); docker/auth/actions are
# 404 in this role. Binds the tailnet IP (AGENT_BIND=tailscale auto-resolves
# it at startup, so a tailnet IP reassignment never bakes in a stale address).
#
# Prints the token + tailnet URL so you can register the box in the dashboard
# connect page (Settings → Services → "GPU Agent — <host>").
#
# Requires: passwordless ssh to $GPU_HOST as a user with sudo -n (root);
# python3, tailscale, and (for nvidia) nvidia-smi present on the target.
set -euo pipefail

GPU_HOST="${GPU_HOST:?set GPU_HOST=bigbeast or zenbeast}"
AGENT_GPU="${AGENT_GPU:-nvidia}"   # nvidia (default) | intel | none (dev-beast has no GPU)
AGENT_DIR="/usr/local/bin/nas-agent"
TOKEN_DIR="/etc/nas-agent"
TOKEN_FILE="${TOKEN_DIR}/token"
ENV_FILE="${TOKEN_DIR}/agent.env"
UNIT_DST="/etc/systemd/system/gpu-agent.service"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "${HERE}/.." && pwd)"   # the agent/ directory

echo ">> Installing GPU-node agent to ${GPU_HOST}:${AGENT_DIR}"

# 1. Ensure target dirs.
ssh "${GPU_HOST}" "sudo -n mkdir -p ${AGENT_DIR} ${TOKEN_DIR} && sudo -n chmod 700 ${TOKEN_DIR}"

# 2. Copy the three stdlib-only sources.
TMP="$(ssh "${GPU_HOST}" 'mktemp -d')"
scp -O -q "${SRC}/nas_agent.py" "${SRC}/statlib.py" "${SRC}/controlib.py" "${GPU_HOST}:${TMP}/"
ssh "${GPU_HOST}" "sudo -n cp ${TMP}/nas_agent.py ${TMP}/statlib.py ${TMP}/controlib.py ${AGENT_DIR}/ \
  && sudo -n chmod 755 ${AGENT_DIR}/*.py && rm -rf ${TMP}"

# 3. Token: generate on first install, preserve after.
ssh "${GPU_HOST}" "
  if sudo -n test ! -s ${TOKEN_FILE}; then
    umask 077
    sudo -n sh -c 'openssl rand -hex 32 > ${TOKEN_FILE}'
    sudo -n chmod 600 ${TOKEN_FILE}
    echo '>> generated new token'
  else
    echo '>> token already present — preserved'
  fi
"

# 4. Per-box env drop-in (role/gpu/bind) read by the unit's EnvironmentFile.
ssh "${GPU_HOST}" "sudo -n sh -c 'cat > ${ENV_FILE} <<ENV
AGENT_ROLE=gpu-node
AGENT_GPU=${AGENT_GPU}
AGENT_BIND=tailscale
AGENT_VOLUMES=/
AGENT_PORT=9101
ENV'
  sudo -n chmod 644 ${ENV_FILE}"

# 5. Install unit and (re)start.
scp -O -q "${HERE}/gpu-agent.service" "${GPU_HOST}:/tmp/gpu-agent.service"
ssh "${GPU_HOST}" "sudo -n cp /tmp/gpu-agent.service ${UNIT_DST} && rm -f /tmp/gpu-agent.service \
  && sudo -n systemctl daemon-reload \
  && sudo -n systemctl enable gpu-agent.service >/dev/null 2>&1 \
  && sudo -n systemctl restart gpu-agent.service"

sleep 2
ssh "${GPU_HOST}" "sudo -n systemctl is-active gpu-agent.service && sudo -n systemctl status gpu-agent.service --no-pager -l | head -n 12"

TAILNET_IP="$(ssh "${GPU_HOST}" 'tailscale ip -4 | head -n1')"
echo
echo ">> Register in the dashboard connect page (Settings -> Services -> 'GPU Agent - ${GPU_HOST}'):"
echo "   URL:   http://${TAILNET_IP}:9101"
echo "   Token: $(ssh "${GPU_HOST}" "sudo -n cat ${TOKEN_FILE}")"
