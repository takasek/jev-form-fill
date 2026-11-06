import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_extension', ROOT / 'scripts/package.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)

class PackageTests(unittest.TestCase):
    def test_staging_from_a_moved_distribution_keeps_the_same_runtime_path(self):
        import shutil
        sys.path.insert(0,str(ROOT/'native'))
        from stage import stage
        with tempfile.TemporaryDirectory(prefix='jev-stage-') as folder:
            root=Path(folder).resolve();source=root/'download';destination=root/'stable'/'extension'
            archive=root/'download.zip';package.build(ROOT,archive)
            with zipfile.ZipFile(archive) as z:z.extractall(source)
            stage(source/'jev-form-fill',destination)
            (destination/'keep.txt').write_text('user note')
            moved=root/'moved-download';shutil.move(source,moved)
            (moved/'jev-form-fill/popup.css').write_text('/* fixture update */')
            self.assertEqual(stage(moved/'jev-form-fill',destination),destination)
            self.assertEqual((destination/'popup.css').read_text(),'/* fixture update */')
            self.assertEqual((destination/'keep.txt').read_text(),'user note')
            alias=root/'alias';alias.symlink_to(destination.parent, target_is_directory=True)
            with self.assertRaises(ValueError):stage(moved/'jev-form-fill',alias/'extension')
            self.assertEqual((destination/'keep.txt').read_text(),'user note')
            (moved/'jev-form-fill/profile.js').unlink()
            with self.assertRaises(ValueError):stage(moved/'jev-form-fill',destination)
            self.assertTrue((destination/'profile.js').is_file())

    def test_packaging_works_with_an_ascii_process_locale(self):
        with tempfile.TemporaryDirectory(prefix='jev-package-') as tmp:
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/package.py'), '--output', str(Path(tmp) / 'extension.zip')], env={**os.environ, 'PYTHONUTF8': '0', 'PYTHONCOERCECLOCALE': '0', 'LC_ALL': 'C'}, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode('utf-8', errors='replace'))

    def test_distribution_readme_has_no_missing_local_links(self):
        with tempfile.TemporaryDirectory(prefix='jev-package-') as tmp:
            archive = Path(tmp) / 'extension.zip'
            package.build(ROOT, archive)
            with zipfile.ZipFile(archive) as z:
                for name in ('README.md', 'README.ja.md', 'PRIVACY.md', 'PRIVACY.ja.md'):
                    text = z.read('jev-form-fill/' + name).decode('utf-8')
                    for link in re.findall(r'\[[^\]]+\]\(([^)]+)\)', text):
                        if not link.startswith(('https://', 'http://', '#')):
                            self.assertIn('jev-form-fill/' + link, z.namelist(), name)

    def test_runtime_files_are_exact_and_working_data_is_excluded(self):
        with tempfile.TemporaryDirectory(prefix='jev-package-') as tmp:
            archive = Path(tmp) / 'extension.zip'
            package.build(ROOT, archive)
            with zipfile.ZipFile(archive) as z:
                self.assertIsNone(z.testzip())
                self.assertEqual(set(z.namelist()), {'jev-form-fill/' + name for name in package.FILES})
                for name in package.FILES:
                    self.assertEqual(z.read('jev-form-fill/' + name), (ROOT / name).read_bytes())
                self.assertEqual(json.loads(z.read('jev-form-fill/manifest.json'))['version'], '0.1.5')
                manifest = json.loads(z.read('jev-form-fill/manifest.json'))
                self.assertEqual(manifest['default_locale'], 'en')
                for locale in ('en', 'ja'):
                    messages = json.loads(z.read('jev-form-fill/_locales/' + locale + '/messages.json'))
                    for reference in (manifest['name'], manifest['description'], manifest['action']['default_title']):
                        self.assertTrue(messages[reference[6:-2]]['message'])

    def test_existing_archive_is_preserved(self):
        with tempfile.TemporaryDirectory(prefix='jev-package-') as tmp:
            archive = Path(tmp) / 'extension.zip'
            archive.write_bytes(b'keep')
            with self.assertRaises(FileExistsError):
                package.build(ROOT, archive)
            self.assertEqual(archive.read_bytes(), b'keep')

if __name__ == '__main__':
    unittest.main()
