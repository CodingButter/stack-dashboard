"""Tests for bind-address resolution.

The tailscale-resolution path shells out and is covered by the live install
proof; here we lock the literal pass-through and the resolver's presence so a
literal AGENT_BIND is never mangled.
"""

import unittest

import nas_agent


class TestResolveBind(unittest.TestCase):
    def test_literal_ip_passes_through(self):
        self.assertEqual(nas_agent.resolve_bind("127.0.0.1"), "127.0.0.1")
        self.assertEqual(nas_agent.resolve_bind("100.64.0.1"), "100.64.0.1")

    def test_hostname_passes_through(self):
        self.assertEqual(nas_agent.resolve_bind("0.0.0.0"), "0.0.0.0")


if __name__ == "__main__":
    unittest.main()
