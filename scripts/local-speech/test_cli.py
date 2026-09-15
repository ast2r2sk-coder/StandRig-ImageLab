"""Real subprocess regression tests; no mocked synthesis or model responses."""
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / 'scripts/local-speech/speech.py'
MODEL = os.environ.get('STANDRIG_SPEECH_MODEL')
CORPUS = Path(__file__).with_name('corpus.json')

class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run([sys.executable, '-B', str(CLI), *map(str, args)], capture_output=True, text=True, timeout=45)

    def test_invalid_input_before_model_or_output(self):
        for text in ['', '   ', '가' * 1001, None]:
            with self.subTest(text=str(text)[:10]), tempfile.TemporaryDirectory() as tmp:
                output = Path(tmp) / 'output'
                corpus = Path(tmp) / 'input.json'
                corpus.write_text(json.dumps([dict(id='invalid', text=text)]))
                result = self.run_cli('--corpus', corpus, '--model', Path(tmp) / 'nonexistent-model', '--output', output)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('input', result.stderr)
                self.assertNotIn('Traceback', result.stderr)
                self.assertFalse(output.exists(), result.stderr)

    @unittest.skipUnless(MODEL, 'opt-in integration: set STANDRIG_SPEECH_MODEL to an installed local model directory')
    @unittest.skipUnless(sys.platform == 'darwin' and shutil.which('say') and shutil.which('afconvert'), 'integration requires macOS say, afconvert and installed Yuna voice')
    def test_real_exit_codes_and_partial_retention(self):
        self.assertTrue(Path(MODEL).is_dir(), 'STANDRIG_SPEECH_MODEL must be an existing directory')
        corpus = json.loads(CORPUS.read_text())
        good = next(c for c in corpus if c['id'] == 'new-01')
        bad = next(c for c in corpus if c['id'] == 'hello-ko')
        oversized = dict(id='oversized', text='가' * 151)
        for name, cases, expected, statuses in [
            ('good', [good], 0, ['aligned']),
            ('bad', [bad], 1, ['low_confidence']),
            ('partial', [bad, oversized, good], 1, ['low_confidence', 'unsupported', 'aligned']),
        ]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                source = Path(tmp) / 'corpus.json'
                source.write_text(json.dumps(cases, ensure_ascii=False))
                output = Path(tmp) / 'output'
                result = self.run_cli('--corpus', source, '--model', MODEL, '--output', output)
                self.assertEqual(result.returncode, expected, result.stderr + result.stdout)
                report = json.loads((output / 'results.json').read_text())
                self.assertEqual([r['status'] for r in report['cases']], statuses)
                self.assertEqual(report['counts']['completed'], len(cases))
                self.assertEqual(report['counts']['aligned'], statuses.count('aligned'))
                for row in report['cases']:
                    folder = output / row['id']
                    self.assertEqual((folder / 'utterance.speech.json').exists(), row['status'] == 'aligned')
                    if row['status'] == 'unsupported':
                        self.assertFalse((folder / 'audio.wav').exists())
                        self.assertFalse((folder / 'audio.aiff').exists())
                        self.assertNotIn('synthesis_seconds', row['timings'])
                print(name, 'exit=' + str(result.returncode), json.dumps(report['counts']), flush=True)

if __name__ == '__main__':
    unittest.main()
