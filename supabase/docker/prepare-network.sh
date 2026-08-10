#!/usr/bin/env bash
# Nested Docker (Cloud Agent VMs, DinD) often blocks inter-container TCP on
# custom bridges when bridge-nf-call-iptables=1. Call before compose up.
set -euo pipefail

if [ -w /proc/sys/net/bridge/bridge-nf-call-iptables ] 2>/dev/null; then
	echo 0 >/proc/sys/net/bridge/bridge-nf-call-iptables || true
	echo 0 >/proc/sys/net/bridge/bridge-nf-call-ip6tables || true
elif command -v sysctl >/dev/null 2>&1; then
	sysctl -w net.bridge.bridge-nf-call-iptables=0 >/dev/null 2>&1 || true
	sysctl -w net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true
fi

# Some nested engines DROP unmatched FORWARD traffic.
if command -v iptables >/dev/null 2>&1; then
	iptables -P FORWARD ACCEPT 2>/dev/null || true
fi
