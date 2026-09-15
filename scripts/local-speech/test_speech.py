import unittest
from speech import normalize_targets, Unsupported
from g2pk2 import G2p

class NormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.g = G2p(use_konlpy=False)
        # Synthetic normalization fixture, not acoustic/model evidence.
        cls.v = {c: i for i, c in enumerate('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ|')}
    def test_phonology_and_determinism(self):
        for source, expected in [('좋은','조은'), ('입력','임녁'), ('옷이','오시'), ('할 수 있어','할 쑤 이써')]:
            a = normalize_targets(source, self.g, self.v)
            self.assertEqual(a[0], expected)
            self.assertEqual(a, normalize_targets(source, self.g, self.v))
            self.assertEqual(a[2], [self.v[c] for c in a[1]])
    def test_unsupported(self):
        for text in ['', '😀', '漢字', '가' * 301]:
            with self.subTest(text=text[:10]), self.assertRaises(Unsupported):
                normalize_targets(text, self.g, self.v)
    def test_oov(self):
        with self.assertRaises(Unsupported):
            normalize_targets('안녕', self.g, {})

if __name__ == '__main__':
    unittest.main()
