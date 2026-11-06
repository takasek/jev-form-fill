"""Copy the distribution to a stable Chrome load path, independent of the download folder."""
import argparse
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

FILES = ('manifest.json', 'popup.html', 'popup.css', 'popup.js', 'core.js',
         'onepassword.html', 'onepassword.js', 'profile.js', 'profile-formats.js', 'native/host.py', 'native/install.py',
         'native/stage.py', 'page.js', 'client.js', 'i18n.js', '_locales/en/messages.json',
         '_locales/ja/messages.json', 'README.md', 'README.ja.md', 'PRIVACY.md', 'PRIVACY.ja.md', 'LICENSE',
         'docs/images/review-proposals.jpg', 'docs/images/filled-form.jpg')


def replace(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temporary.write(data)
    try:
        os.chmod(temporary.name, 0o644)
        os.replace(temporary.name, path)
    finally:
        Path(temporary.name).unlink(missing_ok=True)


def stage(source, destination):
    source, destination = Path(source).absolute(), Path(destination).absolute()
    contents = {}
    before = {}
    for name in FILES:
        src, dst = source / name, destination / name
        if src.is_symlink() or not src.is_file():
            raise ValueError('Incomplete distribution: ' + name)
        if any(path.is_symlink() for path in [dst, *dst.parents]):
            raise ValueError('The installation path must not contain symbolic links.')
        contents[name] = src.read_bytes()
        before[name] = dst.read_bytes() if dst.exists() else None
    manifest = json.loads(contents['manifest.json'])
    if before['manifest.json'] is not None:
        old = json.loads(before['manifest.json'])
        if old.get('name') != manifest.get('name'):
            raise ValueError('The destination contains another extension.')
    written = []
    try:
        for name, data in contents.items():
            if data == before[name]:
                continue
            replace(destination / name, data)
            written.append(name)
        for name, data in contents.items():
            if (destination / name).read_bytes() != data:
                raise OSError('Copy verification failed: ' + name)
    except BaseException:
        for name in reversed(written):
            if before[name] is None:
                (destination / name).unlink(missing_ok=True)
            else:
                replace(destination / name, before[name])
        raise
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination', type=Path,
                        default=Path.home() / 'Library/Application Support/Jev Form Fill/extension')
    args = parser.parse_args()
    result = stage(Path(__file__).resolve().parents[1], args.destination)
    print('In chrome://extensions, load or reload this folder:')
    print(result)
