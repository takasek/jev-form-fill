"""Install a macOS Chrome native host and its user-selected field references."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
from tempfile import NamedTemporaryFile

HOST = 'local.jev_form_fill.onepassword'


def replace(path, text, mode=0o600):
    with NamedTemporaryFile(dir=path.parent, delete=False, mode='w', encoding='utf-8') as tmp:
        tmp.write(text)
    try:
        os.chmod(tmp.name, mode)
        os.replace(tmp.name, path)
    finally:
        Path(tmp.name).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('extension_id')
    parser.add_argument('--field', nargs=2, metavar=('LABEL', 'OP_REFERENCE'), action='append', required=True)
    parser.add_argument('--chrome-data', type=Path, default=Path.home() / 'Library/Application Support/Google/Chrome')
    args = parser.parse_args()
    op = shutil.which('op')
    if sys.platform != 'darwin' or not op or not re.fullmatch('[a-p]{32}', args.extension_id):
        parser.error('Requires macOS, 1Password CLI, and the extension ID from chrome://extensions.')
    fields = {}
    labels = set()
    for label, ref in args.field:
        if not label.strip() or not re.fullmatch(r'op://[^/?#\n]+/[^/?#\n]+/(?:[^/?#\n]+/)?[^/?#\n]+', ref):
            parser.error('Each field needs a label and a 1Password field reference.')
        key = hashlib.sha256(ref.encode()).hexdigest()
        if label in labels or key in fields:
            parser.error('Use distinct field labels and references.')
        labels.add(label)
        fields[key] = {'label': label, 'ref': ref}
    origin = f'chrome-extension://{args.extension_id}/'
    base = args.chrome_data.resolve() / 'NativeMessagingHosts'
    folder = base / HOST
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    host = folder / 'host.py'
    source = Path(__file__).with_name('host.py').read_text(encoding='utf-8').split('\n', 1)[1]
    replace(host, '#!' + sys.executable + '\n' + source, 0o700)
    replace(folder / 'fields.json', json.dumps({'origin': origin, 'op': op, 'fields': fields}))
    replace(base / (HOST + '.json'), json.dumps({'name': HOST, 'description': 'Jev Form Fill for 1Password',
                                                'path': str(host), 'type': 'stdio', 'allowed_origins': [origin]}))
    print(f'Installed host for {len(fields)} registered field(s).')


if __name__ == '__main__':
    main()
