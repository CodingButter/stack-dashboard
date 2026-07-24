"""Tests for the agent control plane: action allowlist/deny-list planning,
unit and cursor validation, journal parsing, docker log demuxing.

All pure controlib functions — no server, no docker, no NAS required.
"""

import json
import unittest

import controlib

KNOWN = {"sonarr": {"id": "aaa"}, "sabnzbd": {"id": "bbb"},
         "wren-brain-pg": {"id": "ccc"}, "tailscaled": {"id": "ddd"}}


class TestDenyList(unittest.TestCase):
    def test_wren_brain_pg_is_403_even_with_confirm(self):
        status, err, plan = controlib.plan_action(
            "docker_restart", "wren-brain-pg",
            "docker_restart:wren-brain-pg", KNOWN)
        self.assertEqual(status, 403)
        self.assertIsNone(plan)

    def test_tailscaled_is_403_for_every_docker_action(self):
        for action in ("docker_restart", "docker_start", "docker_stop"):
            status, _, plan = controlib.plan_action(
                action, "tailscaled", "%s:tailscaled" % action, KNOWN)
            self.assertEqual(status, 403, action)
            self.assertIsNone(plan)

    def test_deny_beats_unknown_action(self):
        # deny-list is checked first: even a bogus action on a protected
        # target reports 403, not 404
        status, _, _ = controlib.plan_action(
            "docker_nuke", "wren-brain-pg", None, KNOWN)
        self.assertEqual(status, 403)


class TestActionValidation(unittest.TestCase):
    def test_unknown_action_is_404(self):
        status, _, plan = controlib.plan_action("shell_exec", "sonarr", None, KNOWN)
        self.assertEqual(status, 404)
        self.assertIsNone(plan)

    def test_destructive_without_confirm_is_428(self):
        status, err, plan = controlib.plan_action(
            "docker_restart", "sonarr", None, KNOWN)
        self.assertEqual(status, 428)
        self.assertIsNone(plan)
        self.assertIn("docker_restart:sonarr", err["expected"])

    def test_wrong_confirm_value_is_428(self):
        status, _, _ = controlib.plan_action(
            "docker_stop", "sonarr", "docker_stop:sabnzbd", KNOWN)
        self.assertEqual(status, 428)

    def test_valid_confirmed_restart_yields_plan(self):
        status, err, plan = controlib.plan_action(
            "docker_restart", "sonarr", "docker_restart:sonarr", KNOWN)
        self.assertEqual(status, 200)
        self.assertEqual(plan, {"kind": "docker", "op": "restart",
                                "container": "sonarr"})

    def test_docker_start_needs_no_confirm(self):
        status, _, plan = controlib.plan_action(
            "docker_start", "sabnzbd", None, KNOWN)
        self.assertEqual(status, 200)
        self.assertEqual(plan["op"], "start")

    def test_container_not_in_mediastack_list_is_400(self):
        status, _, _ = controlib.plan_action(
            "docker_restart", "mailu-front", "docker_restart:mailu-front", KNOWN)
        self.assertEqual(status, 400)

    def test_systemd_unit_injection_rejected(self):
        status, _, _ = controlib.plan_action(
            "systemd_restart", "tier-mover; rm -rf /",
            "systemd_restart:tier-mover; rm -rf /", KNOWN)
        self.assertEqual(status, 400)

    def test_systemd_restart_allowlisted_unit(self):
        status, _, plan = controlib.plan_action(
            "systemd_restart", "tier-mover", "systemd_restart:tier-mover", KNOWN)
        self.assertEqual(status, 200)
        self.assertEqual(plan, {"kind": "systemd", "op": "restart",
                                "unit": "tier-mover"})

    def test_systemd_run_is_start_without_confirm(self):
        status, _, plan = controlib.plan_action(
            "systemd_run", "binge-prefetch", None, KNOWN)
        self.assertEqual(status, 200)
        self.assertEqual(plan["op"], "start")

    def test_tiermover_dry_run_has_fixed_argv(self):
        status, _, plan = controlib.plan_action(
            "tiermover_dry_run", None, None, KNOWN)
        self.assertEqual(status, 200)
        self.assertEqual(plan["kind"], "fixed")
        self.assertIn("--dry-run", plan["argv"])

    def test_nas_reboot_requires_confirm(self):
        status, err, plan = controlib.plan_action(
            "nas_reboot", None, None, KNOWN)
        self.assertEqual(status, 428)
        self.assertIsNone(plan)
        self.assertIn("nas_reboot:nas", err["expected"])

    def test_nas_reboot_confirmed_is_delayed_systemctl(self):
        status, _, plan = controlib.plan_action(
            "nas_reboot", None, "nas_reboot:nas", KNOWN)
        self.assertEqual(status, 200)
        self.assertEqual(plan["kind"], "fixed")
        self.assertIn("reboot", plan["argv"])
        # response must escape before the box goes down
        self.assertIn("--on-active=5", plan["argv"])


class TestJournalValidation(unittest.TestCase):
    def test_cursor_rejects_leading_dash(self):
        self.assertFalse(controlib.valid_cursor("--since=yesterday"))

    def test_cursor_rejects_whitespace_and_newline(self):
        self.assertFalse(controlib.valid_cursor("a b"))
        self.assertFalse(controlib.valid_cursor("a\nb"))
        self.assertFalse(controlib.valid_cursor(""))

    def test_real_journal_cursor_accepted(self):
        c = "s=8f9b6e5c;i=1a2b;b=deadbeef;m=1;t=5;x=9"
        self.assertTrue(controlib.valid_cursor(c))

    def test_journal_argv_is_fixed_shape(self):
        argv = controlib.journal_argv("tier-mover", "s=1;i=2", 50)
        self.assertEqual(argv[:3], ["journalctl", "-u", "tier-mover"])
        self.assertIn("--after-cursor", argv)
        self.assertEqual(argv[argv.index("--after-cursor") + 1], "s=1;i=2")

    def test_clamp_lines(self):
        self.assertEqual(controlib.clamp_lines("50"), 50)
        self.assertEqual(controlib.clamp_lines("999999"), controlib.MAX_LINES)
        self.assertEqual(controlib.clamp_lines("0"), 1)
        self.assertEqual(controlib.clamp_lines("junk"), 100)
        self.assertEqual(controlib.clamp_lines(None), 100)

    def test_gpu_role_allowlist_is_narrow(self):
        self.assertIn("tdarr-node", controlib.GPU_JOURNAL_UNITS)
        self.assertNotIn("tier-mover", controlib.GPU_JOURNAL_UNITS)


class TestJournalParsing(unittest.TestCase):
    def test_cursor_passthrough_when_no_entries(self):
        out = controlib.parse_journal_json("", fallback_cursor="s=prev")
        self.assertEqual(out, {"entries": [], "cursor": "s=prev"})

    def test_last_entry_cursor_wins(self):
        raw = "\n".join([
            json.dumps({"__CURSOR": "c1", "__REALTIME_TIMESTAMP": "1000",
                        "MESSAGE": "one", "PRIORITY": "6",
                        "_SYSTEMD_UNIT": "tier-mover.service"}),
            json.dumps({"__CURSOR": "c2", "__REALTIME_TIMESTAMP": "2000",
                        "MESSAGE": "two", "PRIORITY": "4",
                        "_SYSTEMD_UNIT": "tier-mover.service"}),
        ])
        out = controlib.parse_journal_json(raw, fallback_cursor="c0")
        self.assertEqual(out["cursor"], "c2")
        self.assertEqual(len(out["entries"]), 2)
        self.assertEqual(out["entries"][0]["message"], "one")
        self.assertEqual(out["entries"][1]["ts_us"], 2000)

    def test_byte_array_message_decoded(self):
        raw = json.dumps({"__CURSOR": "c1",
                          "MESSAGE": [104, 105]})  # "hi"
        out = controlib.parse_journal_json(raw)
        self.assertEqual(out["entries"][0]["message"], "hi")

    def test_garbage_lines_skipped(self):
        out = controlib.parse_journal_json("not json\n{}", None)
        self.assertEqual(len(out["entries"]), 1)


class TestDockerLogDemux(unittest.TestCase):
    def test_demuxes_stdout_and_stderr_frames(self):
        def frame(stream, payload):
            return bytes([stream, 0, 0, 0]) + len(payload).to_bytes(4, "big") + payload
        raw = frame(1, b"out line\n") + frame(2, b"err line\n")
        self.assertEqual(controlib.demux_docker_logs(raw),
                         "out line\nerr line\n")

    def test_tty_stream_falls_back_to_raw(self):
        self.assertEqual(controlib.demux_docker_logs(b"plain text"),
                         "plain text")

    def test_empty(self):
        self.assertEqual(controlib.demux_docker_logs(b""), "")


if __name__ == "__main__":
    unittest.main()
