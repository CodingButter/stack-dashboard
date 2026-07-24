"""Fixture-driven tests for statlib parsers.

Fixtures under tests/fixtures/ were captured from the live NAS
(ssh nas 'cat /proc/...') on 2026-07-23.
"""

import os
import unittest

import statlib

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def fx(name):
    with open(os.path.join(FIXTURES, name), "r") as f:
        return f.read()


class TestProcStat(unittest.TestCase):
    def test_parses_aggregate_cpu_line(self):
        d = statlib.parse_proc_stat(fx("proc_stat.txt"))
        self.assertEqual(d["user"], 10738546)
        self.assertEqual(d["idle"], 3784169)
        self.assertEqual(d["iowait"], 144624)
        self.assertEqual(
            d["total"],
            10738546 + 1235 + 2326616 + 3784169 + 144624 + 0 + 311057 + 0,
        )

    def test_rejects_text_without_cpu_line(self):
        with self.assertRaises(ValueError):
            statlib.parse_proc_stat("intr 1 2 3\n")

    def test_cpu_percentages_from_synthetic_delta(self):
        prev = {"user": 0, "nice": 0, "system": 0, "idle": 0, "iowait": 0,
                "irq": 0, "softirq": 0, "steal": 0, "total": 0}
        # 1000 jiffies elapsed: 600 idle, 100 iowait -> 30% busy, 10% iowait
        curr = {"user": 250, "nice": 0, "system": 50, "idle": 600, "iowait": 100,
                "irq": 0, "softirq": 0, "steal": 0, "total": 1000}
        pct = statlib.cpu_percentages(prev, curr)
        self.assertEqual(pct["busy_pct"], 30.0)
        self.assertEqual(pct["iowait_pct"], 10.0)

    def test_zero_elapsed_is_safe(self):
        d = statlib.parse_proc_stat(fx("proc_stat.txt"))
        pct = statlib.cpu_percentages(d, d)
        self.assertEqual(pct, {"busy_pct": 0.0, "iowait_pct": 0.0})


class TestLoadavg(unittest.TestCase):
    def test_parses_fixture(self):
        d = statlib.parse_loadavg(fx("proc_loadavg.txt"))
        self.assertEqual(d["load1"], 9.42)
        self.assertEqual(d["load5"], 8.62)
        self.assertEqual(d["load15"], 8.63)
        self.assertEqual(d["running"], 22)
        self.assertEqual(d["threads"], 2374)


class TestMeminfo(unittest.TestCase):
    def test_parses_fixture(self):
        d = statlib.parse_meminfo(fx("proc_meminfo.txt"))
        self.assertEqual(d["mem_total_kb"], 32644776)
        self.assertEqual(d["mem_available_kb"], 23923568)
        self.assertEqual(d["swap_total_kb"], 18415596)
        self.assertEqual(d["swap_free_kb"], 15210724)
        # (32644776 - 23923568) / 32644776 = 26.716...%
        self.assertEqual(d["mem_used_pct"], 26.7)
        self.assertEqual(d["swap_used_pct"], 17.4)

    def test_zero_totals_safe(self):
        d = statlib.parse_meminfo("MemTotal: 0 kB\nSwapTotal: 0 kB\n")
        self.assertEqual(d["mem_used_pct"], 0.0)
        self.assertEqual(d["swap_used_pct"], 0.0)


class TestVmstatSwap(unittest.TestCase):
    def test_parses_fixture(self):
        d = statlib.parse_vmstat_swap(fx("proc_vmstat.txt"))
        self.assertEqual(d["pswpin"], 480958)
        self.assertEqual(d["pswpout"], 1307813)

    def test_rates(self):
        r = statlib.swap_rates({"pswpin": 0, "pswpout": 0},
                               {"pswpin": 50, "pswpout": 100}, 10.0)
        self.assertEqual(r["swap_in_per_s"], 5.0)
        self.assertEqual(r["swap_out_per_s"], 10.0)


class TestDiskstats(unittest.TestCase):
    def test_fixture_includes_whole_disks_not_partitions(self):
        d = statlib.parse_diskstats(fx("proc_diskstats.txt"))
        self.assertIn("nvme1n1", d)
        self.assertNotIn("nvme1n1p1", d)
        self.assertNotIn("nvme1n1p2", d)

    def test_fixture_values(self):
        d = statlib.parse_diskstats(fx("proc_diskstats.txt"))
        nv = d["nvme1n1"]
        self.assertEqual(nv["reads"], 786946)
        self.assertEqual(nv["read_sectors"], 76551202)
        self.assertEqual(nv["write_sectors"], 635047864)
        self.assertEqual(nv["io_ms"], 2360636)

    def test_delta_math_synthetic(self):
        prev = {"sda": {"reads": 0, "read_sectors": 0, "read_ms": 0,
                        "writes": 0, "write_sectors": 0, "write_ms": 0,
                        "io_ms": 0, "weighted_io_ms": 0}}
        # over 10s: 2048 sectors read (1 MiB), 4096 written (2 MiB),
        # 5000ms doing io -> 50% util, 100 ios with 400ms total -> 4.0 await
        curr = {"sda": {"reads": 60, "read_sectors": 2048, "read_ms": 150,
                        "writes": 40, "write_sectors": 4096, "write_ms": 250,
                        "io_ms": 5000, "weighted_io_ms": 9000}}
        r = statlib.disk_rates(prev, curr, 10.0)["sda"]
        self.assertEqual(r["util_pct"], 50.0)
        self.assertEqual(r["read_mbs"], 0.1)
        self.assertEqual(r["write_mbs"], 0.2)
        self.assertEqual(r["await_ms"], 4.0)

    def test_util_clamped_to_100(self):
        prev = {"sda": {"reads": 0, "read_sectors": 0, "read_ms": 0,
                        "writes": 0, "write_sectors": 0, "write_ms": 0,
                        "io_ms": 0, "weighted_io_ms": 0}}
        curr = {"sda": {"reads": 1, "read_sectors": 0, "read_ms": 0,
                        "writes": 0, "write_sectors": 0, "write_ms": 0,
                        "io_ms": 99999, "weighted_io_ms": 0}}
        r = statlib.disk_rates(prev, curr, 1.0)["sda"]
        self.assertEqual(r["util_pct"], 100.0)

    def test_new_device_between_snapshots_skipped(self):
        curr = statlib.parse_diskstats(fx("proc_diskstats.txt"))
        r = statlib.disk_rates({}, curr, 5.0)
        self.assertEqual(r, {})


class TestBcache(unittest.TestCase):
    def test_parses_fixture(self):
        d = statlib.parse_bcache_stats(fx("bcache_stats.txt"))
        self.assertEqual(d["hits"], 629704)
        self.assertEqual(d["misses"], 449537)
        # 629704 / (629704+449537) = 58.34...%
        self.assertEqual(d["hit_ratio_pct"], 58.3)

    def test_zero_total_safe(self):
        self.assertEqual(statlib.bcache_hit_ratio(0, 0), 0.0)


class TestNetDev(unittest.TestCase):
    def test_parses_eth0_fixture(self):
        d = statlib.parse_net_dev(fx("proc_net_dev.txt"), "eth0")
        self.assertEqual(d["rx_bytes"], 263965615829)
        self.assertEqual(d["tx_bytes"], 574788018649)

    def test_missing_iface_returns_zeros(self):
        d = statlib.parse_net_dev(fx("proc_net_dev.txt"), "nosuch0")
        self.assertEqual(d, {"rx_bytes": 0, "tx_bytes": 0})

    def test_rates(self):
        r = statlib.net_rates({"rx_bytes": 0, "tx_bytes": 0},
                              {"rx_bytes": 10485760, "tx_bytes": 5242880}, 10.0)
        self.assertEqual(r["rx_mbs"], 1.0)
        self.assertEqual(r["tx_mbs"], 0.5)


class TestUptime(unittest.TestCase):
    def test_parses_fixture(self):
        d = statlib.parse_uptime(fx("proc_uptime.txt"))
        self.assertEqual(d["uptime_s"], 43434)


class TestDstate(unittest.TestCase):
    def test_counts_d_state_with_tricky_comm(self):
        lines = [
            "1 (systemd) S 0 1 1 0 -1",
            "2 (kworker/0:1) D 2 0 0 0 -1",
            # comm containing spaces and a ')' — state is after the LAST ')'
            "3 (weird proc)name) D 1 3 3 0 -1",
            "4 (bash) R 1 4 4 0 -1",
        ]
        self.assertEqual(statlib.parse_dstate(lines), 2)

    def test_empty(self):
        self.assertEqual(statlib.parse_dstate([]), 0)
