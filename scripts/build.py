#!/usr/bin/env python3
"""Build an extension archive and a portable source archive using the standard library."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def build():
    metadata = json.loads((ROOT / 'extension/metadata.json').read_text())
    version = metadata['version-name']
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    extension_zip = dist / f"{metadata['uuid']}.shell-extension.zip"
    with tempfile.TemporaryDirectory(prefix='letter-pointer-build-') as directory:
        stage = Path(directory) / 'extension'
        shutil.copytree(ROOT / 'extension', stage, ignore=shutil.ignore_patterns('gschemas.compiled'))
        subprocess.run(['glib-compile-schemas', '--strict', str(stage / 'schemas')], check=True)
        with zipfile.ZipFile(extension_zip, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(stage.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(stage))
    source_zip = dist / f'letter-pointer-{version}-source.zip'
    with zipfile.ZipFile(source_zip, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(ROOT.rglob('*')):
            relative = path.relative_to(ROOT)
            if any(part in {'dist', '.git', '__pycache__'} for part in relative.parts):
                continue
            if path.is_file() and path.name != 'gschemas.compiled':
                archive.write(path, Path(f'letter-pointer-{version}') / relative)
    checksums = []
    for path in [extension_zip, source_zip]:
        checksums.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}')
        print(path)
    (dist / 'SHA256SUMS').write_text('\n'.join(checksums) + '\n')


if __name__ == '__main__':
    build()
