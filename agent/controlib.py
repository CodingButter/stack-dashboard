"""Control-plane logic for the NAS agent: allowlists, validation, action
planning, journal parsing, docker log demuxing. Pure functions, zero I/O —
everything here is unit-testable without a server or a NAS.

Security model:
- Every mutating capability is an entry in ACTIONS; there is no generic
  shell or generic docker passthrough.
- Container targets are validated against the live mediastack container
  list minus DENY_CONTAINERS. Deny-listed targets return 403 even with a
  valid token — enforced here, server-side.
- systemd unit names come only from fixed allowlists; nothing from the
  request is ever interpolated into a shell string (fixed argv only).
- Destructive actions require the X-Confirm: <action>:<target> header
  (second factor supplied by the dashboard's confirm flow) -> 428 without.
"""

import json

# Containers that must never be touched, regardless of token or list state.
DENY_CONTAINERS = frozenset({"wren-brain-pg", "tailscaled"})

# Custom units from DASHBOARD_RECON.md + the agent itself.
JOURNAL_UNITS = frozenset({
    "anime-sort", "binge-prefetch", "cifs-watchdog", "recent-warm",
    "stack-alerts", "stack-digest", "tdarr-sweep", "tier-mover",
    "tdarr-gate", "nas-agent",
})

# Units the gpu-node role may read (tdarr node + the agent itself).
GPU_JOURNAL_UNITS = frozenset({"tdarr-node", "nas-agent"})

# Units that may be restarted / run via actions.
SYSTEMD_UNITS = frozenset({
    "anime-sort", "binge-prefetch", "cifs-watchdog", "recent-warm",
    "stack-alerts", "stack-digest", "tdarr-sweep", "tier-mover",
    "tdarr-gate",
})

# action name -> (kind, destructive)
ACTIONS = {
    "docker_restart": ("docker", True),
    "docker_start": ("docker", False),
    "docker_stop": ("docker", True),
    "systemd_restart": ("systemd", True),
    "systemd_run": ("systemd", False),
    "tiermover_dry_run": ("fixed", False),
}

MAX_LINES = 1000


def clamp_lines(raw, default=100):
    """Parse a lines/tail parameter; clamp to [1, MAX_LINES]."""
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return default
    return max(1, min(n, MAX_LINES))


def valid_cursor(cursor):
    """Journal cursors are opaque but must be safe as a single argv element:
    non-empty, printable, no leading dash (option injection), no whitespace."""
    if not cursor or len(cursor) > 512:
        return False
    if cursor[0] == "-":
        return False
    return all(33 <= ord(c) <= 126 for c in cursor)


def journal_argv(unit, cursor, lines):
    """Build a fixed journalctl argv. Caller must have validated unit."""
    argv = ["journalctl", "-u", unit, "-o", "json", "-n", str(lines),
            "--no-pager"]
    if cursor:
        argv += ["--after-cursor", cursor]
    return argv


def auth_journal_argv(cursor, lines):
    argv = ["journalctl", "_COMM=sshd", "-o", "json", "-n", str(lines),
            "--no-pager"]
    if cursor:
        argv += ["--after-cursor", cursor]
    return argv


def parse_journal_json(raw, fallback_cursor=None):
    """journalctl -o json emits one JSON object per line. Return trimmed
    entries plus the cursor of the last entry (for the next poll)."""
    entries = []
    cursor = fallback_cursor
    for line in (raw or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            e = json.loads(line)
        except ValueError:
            continue
        ts_us = e.get("__REALTIME_TIMESTAMP")
        entries.append({
            "ts_us": int(ts_us) if ts_us else None,
            "unit": e.get("_SYSTEMD_UNIT"),
            "priority": e.get("PRIORITY"),
            "message": _as_text(e.get("MESSAGE")),
        })
        if e.get("__CURSOR"):
            cursor = e["__CURSOR"]
    return {"entries": entries, "cursor": cursor}


def _as_text(msg):
    # journald can emit MESSAGE as a byte array for non-UTF8 payloads
    if isinstance(msg, list):
        try:
            return bytes(msg).decode("utf-8", "replace")
        except (ValueError, TypeError):
            return None
    return msg


def demux_docker_logs(raw):
    """Docker log streams (non-TTY) are framed: 8-byte header per frame,
    byte 0 = stream (1 stdout, 2 stderr), bytes 4-7 = big-endian length.
    Returns decoded text. Falls back to raw decode for TTY streams."""
    if not raw:
        return ""
    if raw[0] not in (0, 1, 2):
        return raw.decode("utf-8", "replace")
    out = []
    i = 0
    n = len(raw)
    while i + 8 <= n:
        length = int.from_bytes(raw[i + 4:i + 8], "big")
        frame = raw[i + 8:i + 8 + length]
        out.append(frame.decode("utf-8", "replace"))
        i += 8 + length
    return "".join(out)


def plan_action(action, target, confirm_header, known_containers):
    """Validate an action request. Returns (status, payload, plan).

    plan is None when status != 200. Otherwise plan is a dict:
      {"kind": "docker", "op": "restart|start|stop", "container": name}
      {"kind": "systemd", "op": "restart|start", "unit": name}
      {"kind": "fixed", "argv": [...]}
    Deny-list is checked before anything else so a deny-listed target is
    always 403 — even if the action name or confirm header is also wrong.
    """
    if target and target in DENY_CONTAINERS:
        return 403, {"error": "target is deny-listed"}, None

    entry = ACTIONS.get(action)
    if entry is None:
        return 404, {"error": "unknown action"}, None
    kind, destructive = entry

    if kind == "docker":
        if not target or target not in known_containers:
            return 400, {"error": "unknown container target"}, None
    elif kind == "systemd":
        if not target or target not in SYSTEMD_UNITS:
            return 400, {"error": "unknown unit target"}, None
    elif kind == "fixed":
        target = target or "tier-mover"

    if destructive and confirm_header != "%s:%s" % (action, target):
        return 428, {"error": "confirmation required",
                     "expected": "X-Confirm: %s:%s" % (action, target)}, None

    if kind == "docker":
        op = action.split("_", 1)[1]
        return 200, None, {"kind": "docker", "op": op, "container": target}
    if kind == "systemd":
        op = "restart" if action == "systemd_restart" else "start"
        return 200, None, {"kind": "systemd", "op": op, "unit": target}
    # tiermover_dry_run
    return 200, None, {"kind": "fixed",
                       "argv": ["systemd-run", "--wait", "--collect", "--pipe",
                                "--unit", "tiermover-dry-run",
                                "/usr/bin/python3",
                                "/volume1/docker/mediastack/scripts/tier_mover.py",
                                "--dry-run"]}
