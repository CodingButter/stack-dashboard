"""Pure parser functions for NAS agent stats. Stdlib only, no I/O in parsers.

Every function takes raw text (from /proc, /sys) and returns plain dicts,
so all logic is testable against committed fixtures without a live box.
Delta/rate math takes two snapshots plus elapsed seconds.
"""

import os
import re

# Whole-disk devices we report on (partitions and loop devices excluded).
_DEVICE_RE = re.compile(r"^(sd[a-z]+|nvme\d+n\d+|md\d+|bcache\d+|dm-\d+)$")

SECTOR_BYTES = 512


# ---------------------------------------------------------------- /proc/stat

def parse_proc_stat(text):
    """Return aggregate cpu jiffies: {'user':..,'nice':..,'system':..,'idle':..,
    'iowait':..,'irq':..,'softirq':..,'steal':..,'total':..}."""
    for line in text.splitlines():
        if line.startswith("cpu "):
            parts = line.split()
            fields = [int(x) for x in parts[1:9]]
            keys = ["user", "nice", "system", "idle", "iowait", "irq", "softirq", "steal"]
            d = dict(zip(keys, fields))
            d["total"] = sum(fields)
            return d
    raise ValueError("no aggregate cpu line in /proc/stat")


def cpu_percentages(prev, curr):
    """CPU busy%/iowait% between two parse_proc_stat snapshots."""
    dt = curr["total"] - prev["total"]
    if dt <= 0:
        return {"busy_pct": 0.0, "iowait_pct": 0.0}
    idle = curr["idle"] - prev["idle"]
    iowait = curr["iowait"] - prev["iowait"]
    busy = dt - idle - iowait
    return {
        "busy_pct": round(100.0 * busy / dt, 1),
        "iowait_pct": round(100.0 * iowait / dt, 1),
    }


# ------------------------------------------------------------- /proc/loadavg

def parse_loadavg(text):
    parts = text.split()
    running, total = parts[3].split("/")
    return {
        "load1": float(parts[0]),
        "load5": float(parts[1]),
        "load15": float(parts[2]),
        "running": int(running),
        "threads": int(total),
    }


# ------------------------------------------------------------- /proc/meminfo

def parse_meminfo(text):
    """Return mem/swap figures in kB plus used percentages."""
    vals = {}
    for line in text.splitlines():
        key, _, rest = line.partition(":")
        num = rest.strip().split()
        if num:
            vals[key] = int(num[0])
    total = vals.get("MemTotal", 0)
    avail = vals.get("MemAvailable", 0)
    swap_total = vals.get("SwapTotal", 0)
    swap_free = vals.get("SwapFree", 0)
    return {
        "mem_total_kb": total,
        "mem_available_kb": avail,
        "mem_used_pct": round(100.0 * (total - avail) / total, 1) if total else 0.0,
        "swap_total_kb": swap_total,
        "swap_free_kb": swap_free,
        "swap_used_pct": round(100.0 * (swap_total - swap_free) / swap_total, 1) if swap_total else 0.0,
    }


# -------------------------------------------------------------- /proc/vmstat

def parse_vmstat_swap(text):
    """Return cumulative swap-in/out page counts: {'pswpin':.., 'pswpout':..}."""
    out = {"pswpin": 0, "pswpout": 0}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[0] in out:
            out[parts[0]] = int(parts[1])
    return out


def swap_rates(prev, curr, elapsed):
    """Pages/sec swapped in/out between two parse_vmstat_swap snapshots."""
    if elapsed <= 0:
        return {"swap_in_per_s": 0.0, "swap_out_per_s": 0.0}
    return {
        "swap_in_per_s": round((curr["pswpin"] - prev["pswpin"]) / elapsed, 1),
        "swap_out_per_s": round((curr["pswpout"] - prev["pswpout"]) / elapsed, 1),
    }


# ----------------------------------------------------------- /proc/diskstats

def parse_diskstats(text):
    """Return {device: {reads, read_sectors, read_ms, writes, write_sectors,
    write_ms, io_ms, weighted_io_ms}} for whole-disk devices only."""
    out = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 14:
            continue
        name = parts[2]
        if not _DEVICE_RE.match(name):
            continue
        out[name] = {
            "reads": int(parts[3]),
            "read_sectors": int(parts[5]),
            "read_ms": int(parts[6]),
            "writes": int(parts[7]),
            "write_sectors": int(parts[9]),
            "write_ms": int(parts[10]),
            "io_ms": int(parts[12]),
            "weighted_io_ms": int(parts[13]),
        }
    return out


def disk_rates(prev, curr, elapsed):
    """Per-device util%/read-write MBs/await between two parse_diskstats snapshots."""
    out = {}
    if elapsed <= 0:
        return out
    for dev, c in curr.items():
        p = prev.get(dev)
        if p is None:
            continue
        d_reads = c["reads"] - p["reads"]
        d_writes = c["writes"] - p["writes"]
        d_ios = d_reads + d_writes
        d_rw_ms = (c["read_ms"] - p["read_ms"]) + (c["write_ms"] - p["write_ms"])
        out[dev] = {
            "util_pct": round(min(100.0, 100.0 * (c["io_ms"] - p["io_ms"]) / (elapsed * 1000.0)), 1),
            "read_mbs": round((c["read_sectors"] - p["read_sectors"]) * SECTOR_BYTES / elapsed / 1048576.0, 2),
            "write_mbs": round((c["write_sectors"] - p["write_sectors"]) * SECTOR_BYTES / elapsed / 1048576.0, 2),
            "await_ms": round(d_rw_ms / d_ios, 2) if d_ios else 0.0,
        }
    return out


# ---------------------------------------------------------------- bcache

def bcache_hit_ratio(hits, misses):
    total = hits + misses
    return round(100.0 * hits / total, 1) if total else 0.0


def parse_bcache_stats(text):
    """Parse 'cache_hits N\ncache_misses N' key-value text (as read from
    /sys/fs/bcache/<uuid>/stats_total/)."""
    vals = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 2:
            vals[parts[0]] = int(parts[1])
    hits = vals.get("cache_hits", 0)
    misses = vals.get("cache_misses", 0)
    return {"hits": hits, "misses": misses, "hit_ratio_pct": bcache_hit_ratio(hits, misses)}


# ------------------------------------------------------------- /proc/net/dev

def parse_net_dev(text, iface="eth0"):
    """Return cumulative {'rx_bytes':.., 'tx_bytes':..} for iface."""
    for line in text.splitlines():
        head, _, rest = line.partition(":")
        if head.strip() == iface:
            parts = rest.split()
            return {"rx_bytes": int(parts[0]), "tx_bytes": int(parts[8])}
    return {"rx_bytes": 0, "tx_bytes": 0}


def net_rates(prev, curr, elapsed):
    if elapsed <= 0:
        return {"rx_mbs": 0.0, "tx_mbs": 0.0}
    return {
        "rx_mbs": round((curr["rx_bytes"] - prev["rx_bytes"]) / elapsed / 1048576.0, 2),
        "tx_mbs": round((curr["tx_bytes"] - prev["tx_bytes"]) / elapsed / 1048576.0, 2),
    }


# --------------------------------------------------------------- /proc/uptime

def parse_uptime(text):
    return {"uptime_s": int(float(text.split()[0]))}


# ---------------------------------------------------------- filesystem fill

def fs_fill(path):
    """Fill stats for a mounted filesystem via statvfs (runtime helper)."""
    st = os.statvfs(path)
    total = st.f_blocks * st.f_frsize
    free = st.f_bavail * st.f_frsize
    used = total - free
    return {
        "path": path,
        "total_bytes": total,
        "used_bytes": used,
        "used_pct": round(100.0 * used / total, 1) if total else 0.0,
    }


# ------------------------------------------------------------ D-state count

def parse_dstate(stat_lines):
    """Count D-state processes given an iterable of /proc/<pid>/stat contents.

    The state field is the one after the last ')' — comm may contain spaces
    and parentheses, so split on the last ')'.
    """
    count = 0
    for line in stat_lines:
        _, _, after = line.rpartition(")")
        fields = after.split()
        if fields and fields[0] == "D":
            count += 1
    return count


def dstate_count(proc_root="/proc"):
    """Runtime scan of /proc/*/stat for D-state processes."""
    lines = []
    for entry in os.listdir(proc_root):
        if not entry.isdigit():
            continue
        try:
            with open(os.path.join(proc_root, entry, "stat"), "r") as f:
                lines.append(f.read())
        except OSError:
            continue  # process exited mid-scan
    return parse_dstate(lines)
