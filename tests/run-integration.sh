#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
test_dir=$(mktemp -d /tmp/letter-pointer-test.XXXXXX)
export LETTER_POINTER_SOURCE="$project_dir"
export XDG_CONFIG_HOME="$test_dir/config"
export XDG_DATA_HOME="$test_dir/data"
export XDG_CACHE_HOME="$test_dir/cache"
export GSETTINGS_BACKEND=keyfile
export GNOME_SHELL_SESSION_MODE=user
export GTK_A11Y=none
export GI_TYPELIB_PATH="/usr/lib/gnome-shell/girepository-1.0${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}"
unset DISPLAY WAYLAND_DISPLAY
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions/letter-pointer-test@inkble.local"
cp "$project_dir/tests/harness/"*.js "$project_dir/tests/harness/metadata.json" \
    "$XDG_DATA_HOME/gnome-shell/extensions/letter-pointer-test@inkble.local/"
glib-compile-schemas --strict "$project_dir/extension/schemas"
gsettings set org.gnome.shell enabled-extensions "['letter-pointer-test@inkble.local']"
gsettings set org.gnome.shell welcome-dialog-last-shown-version '99'
gsettings set org.gnome.desktop.interface enable-hot-corners false
printf 'Test artifacts: %s\n' "$test_dir"
timeout 30s dbus-run-session -- gnome-shell --headless --wayland --no-x11 \
    --virtual-monitor "${LETTER_POINTER_TEST_SIZE:-1280x720}" 2>&1 | tee "$test_dir/test.log"
grep -q 'LETTER_TEST COMPLETE' "$test_dir/test.log"
! grep -q 'LETTER_TEST FAIL' "$test_dir/test.log"
