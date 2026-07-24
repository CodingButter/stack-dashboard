# GPU-node agent variant

The same `nas_agent.py` + `statlib.py` + `controlib.py` files run on the GPU
Tdarr nodes (bigbeast, zenbeast) — no separate codebase. The role is selected
by environment in the systemd unit:

```ini
Environment=AGENT_ROLE=gpu-node
Environment=AGENT_GPU=nvidia
Environment=AGENT_BIND=<box tailnet IP>
Environment=AGENT_VOLUMES=/
```

## What `AGENT_ROLE=gpu-node` changes

| Endpoint | nas role | gpu-node role |
|---|---|---|
| `/health`, `/stats`, `/smart`, `/gpu` | ✓ | ✓ (`/gpu` uses `nvidia-smi`) |
| `/logs/journal` | recon unit allowlist | `tdarr-node` + `nas-agent` only |
| `/docker`, `/logs/docker`, `/logs/auth` | ✓ | 404 |
| `POST /actions/*` | allowlist | 404 (no mutations from GPU boxes) |

Rationale: the GPU boxes only need hardware telemetry (GPU util/encoder/VRAM/
temp/power for the Tdarr panels) and the tdarr-node journal. Tdarr node
control (pause, worker limits) goes through the Tdarr **server** API on the
NAS — never through the node boxes — because node IDs are ephemeral and node
mutations must use the server relay endpoints.

## Deploy (Segment 07 — not now)

Same install script shape as the NAS (`agent/deploy/`): copy the three files
to `/usr/local/bin/nas-agent/`, token to `/etc/nas-agent/token` (mode 600),
unit with `MemoryMax=128M`, `CPUQuota=20%`, bind tailnet IP only. Runs as
root for journal access; needs no docker group since docker endpoints are
disabled in this role.
