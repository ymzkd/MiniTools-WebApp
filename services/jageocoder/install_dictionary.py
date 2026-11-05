"""Download and verify the pinned national dictionary once. Never run at API startup."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

URL = 'https://www.info-proto.com/static/jageocoder/latest/v2/jukyo_all_20250423_v22.zip'
SHA1 = 'dda32145e621b45b691208fc72b2bc78f60405e9'

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, required=True)
    parser.add_argument('--archive', type=Path, required=True)
    args = parser.parse_args()
    dictionary = args.data_dir / 'dictionary'
    if dictionary.exists() and any(dictionary.iterdir()):
        raise SystemExit('Target dictionary already exists; use a new directory for updates')
    args.archive.parent.mkdir(parents=True, exist_ok=True)
    if not args.archive.exists():
        partial = args.archive.with_suffix('.zip.partial')
        print('Downloading 4.5 GB dictionary...', flush=True)
        urllib.request.urlretrieve(URL, partial)
        partial.rename(args.archive)
    digest = hashlib.sha1()
    with args.archive.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != SHA1:
        raise SystemExit('Checksum mismatch; dictionary was not installed')
    dictionary.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.archive) as archive:
        for entry in archive.infolist():
            if not (dictionary / entry.filename).resolve().is_relative_to(dictionary.resolve()):
                raise SystemExit('Unsafe archive path')
        archive.extractall(dictionary)
    (args.data_dir / 'dataset.json').write_text(json.dumps({
        'name': args.archive.name, 'version': '2025-04-23', 'source_url': URL,
        'sha1': SHA1, 'dictionary_format': 'v22',
    }, indent=2), encoding='utf-8')
    print('Installed. Read dictionary/README.md and run prepare.py before starting the API.')
