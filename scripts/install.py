#!/usr/bin/env python3
"""Install or remove the local extension without root or package downloads."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
UUID = 'letter-pointer@inkble.local'


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keyd', action='store_true', help='Enable the existing Alt+M -> F13 keyd integration')
    parser.add_argument('--uninstall', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    data = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share'))
    state = Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local/state')) / 'letter-pointer'
    target = data / 'gnome-shell/extensions' / UUID
    if target.is_symlink():
        parser.error(f'Refusing to replace symlink: {target}')
    if args.dry_run:
        print(json.dumps({'action': 'uninstall' if args.uninstall else 'install',
                          'target': str(target), 'backups': str(state), 'keyd': args.keyd}, indent=2))
        return
    for tool in ['gjs', 'gnome-extensions', 'glib-compile-schemas', 'gnome-shell']:
        if not shutil.which(tool):
            parser.error(f'Missing required command: {tool}')
    version = run('gnome-shell', '--version', capture_output=True, text=True).stdout
    if not re.search(r'\b51(?:\.|\b)', version):
        parser.error(f'Only GNOME Shell 51 is supported and tested: {version.strip()}')
    if args.uninstall:
        if not target.exists():
            print('Extension is not installed.')
            return
        run('gjs', '-m', str(ROOT / 'scripts/settings.js'), 'uninstall', str(target / 'schemas'))
        subprocess.run(['gnome-extensions', 'disable', UUID], check=False)
        shutil.rmtree(target)
        print('Removed extension. Preferences and backups were retained.')
        return
    if target.exists():
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup = state / 'backups' / stamp
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(target, backup)
        print(f'Previous extension backed up to {backup}')
    shutil.copytree(ROOT / 'extension', target, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('gschemas.compiled'))
    run('glib-compile-schemas', '--strict', str(target / 'schemas'))
    run('gjs', '-m', str(ROOT / 'scripts/settings.js'),
        'install-keyd' if args.keyd else 'install', str(target / 'schemas'))
    subprocess.run(['gnome-extensions', 'enable', UUID], check=False)
    print('Installed. Save your work, log out, and log back in to load the new code.')
    print('Menu shortcut: Ctrl+Super+M. Normal shortcut: Alt+M.')
    if args.keyd:
        print('The conflicting GNOME XF86Tools settings shortcut was removed with backup.')
        print('Existing keyd configuration was not edited; it must already map Alt+M to f13.')


if __name__ == '__main__':
    main()
