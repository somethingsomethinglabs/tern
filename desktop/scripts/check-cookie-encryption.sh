#!/usr/bin/env bash
set -euo pipefail
script_path="$(realpath -- "${BASH_SOURCE[0]}")"
if [[ "${TERN_ISOLATED_KEYRING_CHECK:-}" != 1 ]]; then
  exec dbus-run-session -- env TERN_ISOLATED_KEYRING_CHECK=1 bash "$script_path"
fi
cd -- "$(dirname -- "$script_path")/../.."
keyring_test_root="$(mktemp -d /tmp/tern-keyring-test-XXXXXXXX)"
chmod 700 "$keyring_test_root"
mkdir "$keyring_test_root/data" "$keyring_test_root/control"
# The private D-Bus session and data directory protect the user's normal keyring.
export XDG_DATA_HOME="$keyring_test_root/data"
printf '%s' 'isolated-tern-test-password' | gnome-keyring-daemon --foreground --unlock --components=secrets --control-directory "$keyring_test_root/control" > "$keyring_test_root/keyring.log" 2>&1 &
keyring_test_pid=$!
cleanup() { kill "$keyring_test_pid" 2>/dev/null || true; wait "$keyring_test_pid" 2>/dev/null || true; rm -rf -- "$keyring_test_root"; }
trap cleanup EXIT
printf '%s' 'fixture' | secret-tool store --label='Tern isolated test' tern-test ready
TERN_PACKAGE_REQUIRE_ENCRYPTION=1 npm run test:package:desktop
