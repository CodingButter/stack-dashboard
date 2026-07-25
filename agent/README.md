# stack-dashboard node agent

A tiny, dependency-free Python 3 HTTP agent that exposes a box's telemetry and a
tightly-scoped set of control actions to the dashboard poller. Runs on the NAS
and on each GPU transcode node. Stdlib only — no pip install, no venv.

It reads from `/proc`, the docker socket, journald, and `nvidia-smi`/Intel GPU
counters. It **never** pushes; the dashboard poller pulls on a schedule.

## Endpoints

All require `Authorization: Bearer <token>`.

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | any | Version + liveness |
| GET | `/stats` | any | CPU, load, memory, swap, disks, bcache, net, D-state, uptime, failed units |
| GET | `/gpu` | any | GPU util / encoder / decoder / VRAM / temp / power (nvidia or intel) |
| GET | `/smart` | nas | Cached SMART per device |
| GET | `/docker` | nas | Container list + states |
| GET | `/logs/journal`, `/logs/docker`, `/logs/auth`, `/logs/kernel` | nas | Cursor-based log pull |
| POST | `/actions/*` | nas | Allowlisted, deny-listed, `X-Confirm`-gated actions |

On a `gpu-node` the docker, logs, actions, and SMART endpoints return 404 — a GPU
box only reports `/stats`, `/gpu`, and `/health`.

## Configuration (environment)

| Var | Default | Meaning |
| --- | --- | --- |
| `AGENT_TOKEN_FILE` | `/etc/nas-agent/token` | Path to the bearer token |
| `AGENT_BIND` | `127.0.0.1` | Bind address; `tailscale` resolves the tailnet IP at startup |
| `AGENT_PORT` | `9101` | Listen port |
| `AGENT_ROLE` | `nas` | `nas` (full) or `gpu-node` (stats/gpu/health only) |
| `AGENT_GPU` | `none` | `nvidia`, `intel`, or `none` |
| `AGENT_VOLUMES` | `/volume1,/volume2` | Mountpoints to report fill for |

## Install

### GPU node (bigbeast, zenbeast) — from a dashboard checkout

```bash
bash agent/deploy/install-gpu-agent.sh <host>
```

Copies the three agent files, installs a system-level systemd unit
(`AGENT_ROLE=gpu-node AGENT_GPU=nvidia AGENT_BIND=tailscale`), generates a token,
and prints the agent URL + token to paste into **Settings → Services**.

### NAS — full-role install

```bash
bash agent/deploy/install-nas.sh <host>
```

### Standalone one-liner (no repo clone on the target)

To stand the agent up on a box that does not have the dashboard repo, run on that
box:

```bash
sudo mkdir -p /opt/nas-agent /etc/nas-agent \
  && sudo curl -fsSL -o /opt/nas-agent/nas_agent.py https://raw.githubusercontent.com/CodingButter/stack-dashboard/main/agent/nas_agent.py \
  && sudo curl -fsSL -o /opt/nas-agent/statlib.py   https://raw.githubusercontent.com/CodingButter/stack-dashboard/main/agent/statlib.py \
  && sudo curl -fsSL -o /opt/nas-agent/controlib.py https://raw.githubusercontent.com/CodingButter/stack-dashboard/main/agent/controlib.py \
  && openssl rand -hex 32 | sudo tee /etc/nas-agent/token >/dev/null \
  && curl -fsSL https://raw.githubusercontent.com/CodingButter/stack-dashboard/main/agent/deploy/gpu-agent.service | sudo tee /etc/systemd/system/nas-agent.service >/dev/null \
  && sudo systemctl daemon-reload && sudo systemctl enable --now nas-agent \
  && echo "token: $(sudo cat /etc/nas-agent/token)"
```

Then paste the box's `http://<tailnet-ip>:9101` URL and the printed token into
**Settings → Services**. Adjust `AGENT_ROLE`/`AGENT_GPU` in the unit for a
full-role NAS install.

## Operate

```bash
systemctl status nas-agent
journalctl -u nas-agent -f
curl -H "Authorization: Bearer $(sudo cat /etc/nas-agent/token)" http://127.0.0.1:9101/health
```

## Tests

```bash
cd agent && python3 -m unittest discover -s tests
```

## Security notes

- Bearer-token auth on every endpoint; bind to the tailnet, never `0.0.0.0` on an
  untrusted network.
- Control actions are allowlisted **and** deny-listed (critical containers/units
  can never be touched), and destructive ones require an `X-Confirm` header — so
  they are gated both here and at the dashboard.
- Log/journal reads use fixed argv and cursor validation to avoid option
  injection.
