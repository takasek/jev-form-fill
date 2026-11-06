"""Install a macOS Chrome native host and its user-selected field references."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from tempfile import NamedTemporaryFile
from host import run_op

HOST = 'local.jev_form_fill.onepassword'


def distribution_id():
    manifest = json.loads(Path(__file__).resolve().parents[1].joinpath('manifest.json').read_text(encoding='utf-8'))
    key = base64.b64decode(manifest['key'], validate=True)
    if not key:
        raise ValueError('The distribution has no extension key.')
    digest = hashlib.sha256(key).hexdigest()[:32]
    return ''.join(chr(ord('a') + int(character, 16)) for character in digest)


def select_python(explicit=None):
    """Use a stable OS/package-manager entrypoint, never the setup virtualenv."""
    candidates = [explicit] if explicit else ['/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3']
    for candidate in candidates:
        if not candidate or not Path(candidate).is_absolute() or not os.access(candidate, os.X_OK):
            continue
        if '.pyenv' in Path(candidate).parts or 'Cellar' in Path(candidate).parts:
            continue
        try:
            check = subprocess.run([candidate, '-I', '-c',
                'import sys; sys.exit(0 if sys.version_info >= (3,9) and sys.prefix == sys.base_prefix else 1)'],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            if check.returncode == 0:
                return candidate
        except (OSError, subprocess.TimeoutExpired):
            pass
    raise ValueError('Install Python 3.9+ at a stable system/Homebrew path, or specify --python /absolute/path/python3 (not a virtualenv or pyenv version).')


def identities(op, vault=None):
    args = ['item', 'list', '--categories', 'Identity', '--format=json']
    if vault:
        args.append('--vault=' + vault)
    records = json.loads(run_op(op, *args))
    return [{'vault': record['vault']['id'], 'item': record['id'],
             'label': record.get('title', 'Identity') + ' / ' + record['vault'].get('name', record['vault']['id'])}
            for record in records if re.fullmatch('[a-z0-9]{26}', record.get('id', ''))]


def choose_profiles(records):
    if not records:
        raise ValueError('No Identity items found in the selected account/vault.')
    for index, record in enumerate(records, 1):
        # Strip terminal control characters from user-controlled item titles.
        print(str(index) + '. ' + ''.join(c for c in record['label'] if c.isprintable()))
    answer = input('Choose identities by number (comma-separated; blank cancels): ').strip()
    if not re.fullmatch(r'\d+(?:\s*,\s*\d+)*', answer):
        raise ValueError('No identities selected. Nothing was installed.')
    indices = list(dict.fromkeys(int(part) - 1 for part in answer.split(',')))
    if any(index < 0 or index >= len(records) for index in indices):
        raise ValueError('Selection is out of range. Nothing was installed.')
    return [records[index] for index in indices]


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
    parser.add_argument('extension_id', nargs='?', help='Defaults to this distribution’s fixed extension ID.')
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--profile', nargs=2, action='append', metavar=('VAULT', 'IDENTITY_ITEM_ID'))
    source.add_argument('--choose', nargs='?', const='', metavar='VAULT', help='Choose one or more Identity items from a local list.')
    source.add_argument('--repair', action='store_true', help='Keep registered items; repair the extension connection and Python path.')
    source.add_argument('--field', nargs=2, metavar=('LABEL', 'OP_REFERENCE'), action='append')
    parser.add_argument('--python', help='Stable absolute Python 3.9+ executable (not a virtualenv).')
    parser.add_argument('--chrome-data', type=Path, default=Path.home() / 'Library/Application Support/Google/Chrome')
    args = parser.parse_args()
    if args.extension_id is None:
        try:
            args.extension_id = distribution_id()
        except (OSError, ValueError, KeyError):
            parser.error('Could not determine the extension ID. Use a complete distribution or specify the ID shown in chrome://extensions.')
    op = shutil.which('op')
    if sys.platform != 'darwin' or not op or not re.fullmatch('[a-p]{32}', args.extension_id):
        parser.error('Requires macOS, 1Password CLI, and the extension ID from chrome://extensions.')
    try:
        python = select_python(args.python)
    except ValueError as error:
        parser.error(str(error))
    base = args.chrome_data.resolve() / 'NativeMessagingHosts'
    folder = base / HOST
    fields = {}
    labels = set()
    for label, ref in args.field or []:
        if not label.strip() or not re.fullmatch(r'op://[^/?#\n]+/[^/?#\n]+/(?:[^/?#\n]+/)?[^/?#\n]+', ref):
            parser.error('Each field needs a label and a 1Password field reference.')
        key = hashlib.sha256(ref.encode()).hexdigest()
        if label in labels or key in fields:
            parser.error('Use distinct field labels and references.')
        labels.add(label)
        fields[key] = {'label': label, 'ref': ref}
    source_config = {'fields': fields}
    try:
        selected = []
        if args.choose is not None:
            selected = choose_profiles(identities(op, args.choose))
        elif args.profile:
            for vault, item in args.profile:
                if not vault.strip() or not re.fullmatch('[a-z0-9]{26}', item):
                    raise ValueError('Use a vault and the ID of an Identity item.')
                matches = [record for record in identities(op, vault) if record['item'] == item]
                if len(matches) != 1:
                    raise ValueError('Identity item not found in that vault. Use --choose to select from the list.')
                selected.append(matches[0])
        elif args.repair:
            current = json.loads((folder / 'fields.json').read_text(encoding='utf-8'))
            source_config = {key: current[key] for key in ['fields', 'profile', 'profiles'] if key in current}
            if len(source_config) != 1:
                raise ValueError('Registration is missing or invalid. Use --choose to configure identities.')
        if selected:
            source_config = {'profiles': {hashlib.sha256((p['vault'] + '/' + p['item']).encode()).hexdigest(): p for p in selected}}
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, EOFError) as error:
        # CLI diagnostics may contain account details. Do not echo them.
        parser.error(str(error) if isinstance(error, ValueError) else 'Could not load the registration or Identity list. Check 1Password CLI authorization and retry.')
    origin = f'chrome-extension://{args.extension_id}/'
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    host = folder / 'host.py'
    source = Path(__file__).with_name('host.py').read_text(encoding='utf-8').split('\n', 1)[1]
    replace(host, '#!' + python + '\n' + source, 0o700)
    replace(folder / 'fields.json', json.dumps({'origin': origin, 'op': op, **source_config}))
    replace(base / (HOST + '.json'), json.dumps({'name': HOST, 'description': 'Jev Form Fill for 1Password',
                                                'path': str(host), 'type': 'stdio', 'allowed_origins': [origin]}))
    print('Installed 1Password helper.')


if __name__ == '__main__':
    main()
