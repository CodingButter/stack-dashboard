#!/usr/bin/env python3
"""NAS agent — poll-only stats server. Python stdlib only.

Endpoints (all require Authorization: Bearer <token>):
  GET /health  liveness + agent meta
  GET /stats   cpu/load/mem/swap/disk/bcache/fs/net/dstate/uptime/failed-units
  GET /smart   smartctl JSON per device, cached 30 min
  GET /gpu     intel_gpu_top / nvidia-smi snapshot, cached 10 s

Environment:
  AGENT_TOKEN_FILE  path to bearer token file (default /etc/nas-agent/token)
  AGENT_BIND        bind address (default 127.0.0.1 — set to tailnet IP in unit)
  AGENT_PORT        port (default 9101)
  AGENT_GPU         intel | nvidia | none (default none)
  AGENT_VOLUMES     comma-separated mountpoints to report fill for
                    (default /volume1,/volume2)

Design constraints: the NAS is disk-I/O bound. Hot-path reads are /proc and
/sys only. Subprocesses are limited to smartctl (30-min cache), GPU tools
(10-s cache), and systemctl --failed (30-s cache).
"""

import glob
import hmac
import json
import os
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import statlib

AGENT_VERSION = "0.1.0"

TOKEN_FILE = os.environ.get("AGENT_TOKEN_FILE", "/etc/nas-agent/token")
BIND = os.environ.get("AGENT_BIND", "127.0.0.1")
PORT = int(os.environ.get("AGENT_PORT", "9101"))
GPU_MODE = os.environ.get("AGENT_GPU", "none")
VOLUMES = [v for v in os.environ.get("AGENT_VOLUMES", "/volume1,/volume2").split(",") if v]

SMART_CACHE_S = 30 * 60
GPU_CACHE_S = 10
FAILED_UNITS_CACHE_S = 30


def log(msg):
    sys.stderr.write("%s %s\n" % (time.strftime("%Y-%m-%dT%H:%M:%S"), msg))
    sys.stderr.flush()


def read_file(path):
    with open(path, "r") as f:
        return f.read()


def load_token():
    tok = read_file(TOKEN_FILE).strip()
    if not tok:
        raise SystemExit("empty token file: %s" % TOKEN_FILE)
    return tok


TOKEN = None  # set in main()


# --------------------------------------------------------------- samplers

class StatsSampler:
    """Holds the previous /proc snapshot; each poll computes rates vs it."""

    def __init__(self):
        self._lock = threading.Lock()
        self._prev = None  # (ts, stat, vmstat, disks, net)

    def snapshot(self):
        ts = time.monotonic()
        stat = statlib.parse_proc_stat(read_file("/proc/stat"))
        vmstat = statlib.parse_vmstat_swap(read_file("/proc/vmstat"))
        disks = statlib.parse_diskstats(read_file("/proc/diskstats"))
        net = statlib.parse_net_dev(read_file("/proc/net/dev"), "eth0")
        with self._lock:
            prev = self._prev
            self._prev = (ts, stat, vmstat, disks, net)
        rates = {"cpu": {"busy_pct": 0.0, "iowait_pct": 0.0},
                 "swap": {"swap_in_per_s": 0.0, "swap_out_per_s": 0.0},
                 "disks": {}, "net": {"rx_mbs": 0.0, "tx_mbs": 0.0}}
        if prev is not None:
            p_ts, p_stat, p_vm, p_disks, p_net = prev
            elapsed = ts - p_ts
            rates["cpu"] = statlib.cpu_percentages(p_stat, stat)
            rates["swap"] = statlib.swap_rates(p_vm, vmstat, elapsed)
            rates["disks"] = statlib.disk_rates(p_disks, disks, elapsed)
            rates["net"] = statlib.net_rates(p_net, net, elapsed)
        return rates


class TimedCache:
    """Thread-safe single-value cache with a TTL; compute runs at most once
    per TTL regardless of concurrent callers."""

    def __init__(self, ttl_s, fn):
        self._ttl = ttl_s
        self._fn = fn
        self._lock = threading.Lock()
        self._val = None
        self._at = 0.0

    def get(self):
        with self._lock:
            now = time.monotonic()
            if self._val is None or (now - self._at) > self._ttl:
                self._val = self._fn()
                self._at = now
            return self._val


def run_cmd(argv, timeout=15):
    """Run a fixed-argv subprocess (never a shell). Returns stdout or None."""
    try:
        out = subprocess.run(argv, capture_output=True, timeout=timeout)
        if out.returncode != 0:
            log("cmd %s rc=%d stderr=%r" % (argv[0], out.returncode, out.stderr[:200]))
        return out.stdout.decode("utf-8", "replace")
    except (OSError, subprocess.TimeoutExpired) as e:
        log("cmd %s failed: %s" % (argv[0], e))
        return None


def bcache_stats():
    dirs = glob.glob("/sys/fs/bcache/*-*/stats_total")
    if not dirs:
        return None
    try:
        hits = int(read_file(os.path.join(dirs[0], "cache_hits")))
        misses = int(read_file(os.path.join(dirs[0], "cache_misses")))
    except (OSError, ValueError):
        return None
    return {"hits": hits, "misses": misses,
            "hit_ratio_pct": statlib.bcache_hit_ratio(hits, misses)}


def list_smart_devices():
    devs = []
    for path in sorted(glob.glob("/sys/block/*")):
        name = os.path.basename(path)
        if re.match(r"^(sd[a-z]+|nvme\d+n\d+)$", name):
            devs.append("/dev/" + name)
    return devs


def collect_smart():
    out = {}
    for dev in list_smart_devices():
        raw = run_cmd(["smartctl", "-j", "-A", "-H", dev], timeout=30)
        if raw is None:
            out[dev] = {"error": "smartctl failed"}
            continue
        try:
            j = json.loads(raw)
        except ValueError:
            out[dev] = {"error": "unparseable smartctl output"}
            continue
        out[dev] = {
            "healthy": j.get("smart_status", {}).get("passed"),
            "temperature_c": j.get("temperature", {}).get("current"),
            "power_on_hours": j.get("power_on_time", {}).get("hours"),
            "nvme": j.get("nvme_smart_health_information_log"),
            "model": j.get("model_name"),
        }
    return {"collected_at": int(time.time()), "devices": out}


def collect_gpu():
    if GPU_MODE == "nvidia":
        raw = run_cmd(["nvidia-smi",
                       "--query-gpu=utilization.gpu,utilization.encoder,utilization.decoder,"
                       "memory.used,memory.total,temperature.gpu,power.draw",
                       "--format=csv,noheader,nounits"], timeout=10)
        if not raw:
            return {"mode": "nvidia", "error": "nvidia-smi failed"}
        f = [x.strip() for x in raw.strip().splitlines()[0].split(",")]
        return {"mode": "nvidia", "util_pct": float(f[0]), "encoder_pct": float(f[1]),
                "decoder_pct": float(f[2]), "vram_used_mb": float(f[3]),
                "vram_total_mb": float(f[4]), "temp_c": float(f[5]), "power_w": float(f[6])}
    if GPU_MODE == "intel":
        # intel_gpu_top -J streams JSON samples; take ~2 samples then stop.
        raw = run_cmd(["timeout", "3", "intel_gpu_top", "-J", "-s", "1000"], timeout=6)
        if not raw:
            return {"mode": "intel", "error": "intel_gpu_top failed"}
        sample = _last_json_object(raw)
        if sample is None:
            return {"mode": "intel", "error": "no parseable sample"}
        engines = sample.get("engines", {})
        busy = {name.rstrip("/0123456789"): eng.get("busy", 0.0)
                for name, eng in engines.items()}
        return {"mode": "intel",
                "freq_mhz": sample.get("frequency", {}).get("actual"),
                "engines_busy_pct": busy,
                "power_w": sample.get("power", {}).get("Package")}
    return {"mode": "none"}


def _last_json_object(text):
    """Extract the last complete brace-balanced JSON object from streamed text."""
    end = text.rfind("}")
    while end != -1:
        depth = 0
        for i in range(end, -1, -1):
            c = text[i]
            if c == "}":
                depth += 1
            elif c == "{":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[i:end + 1])
                    except ValueError:
                        break
        end = text.rfind("}", 0, end)
    return None


def collect_failed_units():
    raw = run_cmd(["systemctl", "--failed", "--output=json", "--no-pager"], timeout=10)
    if raw is None:
        return {"error": "systemctl failed"}
    try:
        units = json.loads(raw) if raw.strip() else []
    except ValueError:
        return {"error": "unparseable systemctl output"}
    return {"count": len(units), "units": [u.get("unit") for u in units]}


SAMPLER = StatsSampler()
SMART_CACHE = TimedCache(SMART_CACHE_S, collect_smart)
GPU_CACHE = TimedCache(GPU_CACHE_S, collect_gpu)
FAILED_UNITS_CACHE = TimedCache(FAILED_UNITS_CACHE_S, collect_failed_units)
STARTED_AT = time.time()


def build_stats():
    rates = SAMPLER.snapshot()
    fills = []
    for vol in VOLUMES:
        try:
            fills.append(statlib.fs_fill(vol))
        except OSError:
            fills.append({"path": vol, "error": "statvfs failed"})
    return {
        "cpu": rates["cpu"],
        "loadavg": statlib.parse_loadavg(read_file("/proc/loadavg")),
        "memory": statlib.parse_meminfo(read_file("/proc/meminfo")),
        "swap_rates": rates["swap"],
        "disks": rates["disks"],
        "bcache": bcache_stats(),
        "filesystems": fills,
        "net": rates["net"],
        "dstate": statlib.dstate_count(),
        "uptime": statlib.parse_uptime(read_file("/proc/uptime")),
        "failed_units": FAILED_UNITS_CACHE.get(),
        "sampled_at": int(time.time()),
    }


# ------------------------------------------------------------------ server

class Handler(BaseHTTPRequestHandler):
    server_version = "nas-agent/" + AGENT_VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # route access logs through our logger
        log("http %s %s" % (self.address_string(), fmt % args))

    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self):
        auth = self.headers.get("Authorization", "")
        expected = "Bearer " + TOKEN
        return hmac.compare_digest(auth.encode(), expected.encode())

    def do_GET(self):
        if not self._authorized():
            self._send_json(401, {"error": "unauthorized"})
            return
        path = self.path.split("?", 1)[0]
        try:
            if path == "/health":
                self._send_json(200, {"ok": True, "version": AGENT_VERSION,
                                      "uptime_s": int(time.time() - STARTED_AT),
                                      "gpu_mode": GPU_MODE})
            elif path == "/stats":
                self._send_json(200, build_stats())
            elif path == "/smart":
                self._send_json(200, SMART_CACHE.get())
            elif path == "/gpu":
                self._send_json(200, GPU_CACHE.get())
            else:
                self._send_json(404, {"error": "not found"})
        except Exception as e:  # never let a handler kill the thread silently
            log("handler error %s: %r" % (path, e))
            self._send_json(500, {"error": "internal error"})


def main():
    global TOKEN
    TOKEN = load_token()
    SAMPLER.snapshot()  # prime the delta baseline
    srv = ThreadingHTTPServer((BIND, PORT), Handler)
    log("nas-agent %s listening on %s:%d (gpu=%s)" % (AGENT_VERSION, BIND, PORT, GPU_MODE))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
