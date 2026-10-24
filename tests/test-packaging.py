"""Check release contents and an installation into disposable XDG directories."""
import os
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
UUID = 'letter-pointer@inkble.local'
VERSION = json.loads((ROOT / 'extension/metadata.json').read_text())['version-name']


class PackagingTests(unittest.TestCase):
    def test_archives_and_isolated_install(self):
        subprocess.run(['python3', str(ROOT / 'scripts/build.py')], check=True)
        with zipfile.ZipFile(ROOT / 'dist' / f'{UUID}.shell-extension.zip') as archive:
            self.assertIsNone(archive.testzip())
            self.assertTrue({'extension.js', 'prefs.js', 'metadata.json', 'schemas/gschemas.compiled'} <= set(archive.namelist()))
        with tempfile.TemporaryDirectory(prefix='letter-pointer-package-test-') as directory:
            directory = Path(directory)
            with zipfile.ZipFile(ROOT / 'dist' / f'letter-pointer-{VERSION}-source.zip') as archive:
                self.assertIsNone(archive.testzip())
                for name in archive.namelist():
                    self.assertNotIn('..', Path(name).parts)
                    self.assertFalse(Path(name).is_absolute())
                    self.assertNotIn('dist', Path(name).parts)
                archive.extractall(directory)
            source = directory / f'letter-pointer-{VERSION}'
            env = dict(os.environ, GSETTINGS_BACKEND='keyfile',
                       DBUS_SESSION_BUS_ADDRESS=f'unix:path={directory}/no-session-bus',
                       XDG_CONFIG_HOME=str(directory / 'config'),
                       XDG_DATA_HOME=str(directory / 'data'),
                       XDG_STATE_HOME=str(directory / 'state'))
            command = ['python3', str(source / 'scripts/install.py')]
            subprocess.run(command + ['--keyd'], env=env, check=True)
            installed = directory / 'data/gnome-shell/extensions' / UUID
            self.assertTrue((installed / 'schemas/gschemas.compiled').exists())
            self.assertEqual((installed / 'extension.js').read_bytes(), (source / 'extension/extension.js').read_bytes())
            subprocess.run(command + ['--keyd'], env=env, check=True)
            self.assertEqual(len(list((directory / 'state/letter-pointer/backups').iterdir())), 1)
            subprocess.run(command + ['--uninstall'], env=env, check=True)
            self.assertFalse(installed.exists())


if __name__ == '__main__':
    unittest.main()
