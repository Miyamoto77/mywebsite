"""Safety checks for unattended area-data publication."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('area_refresh', Path(__file__).resolve().parents[1] / 'scripts/update-area-data.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.target = Path(self.directory.name) / 'areas.json'
        self.snapshot = {
            'generatedAt': '2026-10-01T00:00:00Z',
            'priceMonth': '2026-07', 'rentMonth': '2026-08',
            'months': {'price': ['2026-07'], 'rent': ['2026-08']},
            'areas': [{'code': 'E06000044', 'price': 245954, 'rent': 1374,
                       'history': {'price': [245954], 'rent': [1374]}}],
        }
        self.target.write_text(json.dumps(self.snapshot))
        self.original = self.target.read_bytes()

    def rejected(self, candidate):
        with self.assertRaises((ValueError, TypeError)):
            refresh.write_snapshot(candidate, self.target)
        self.assertEqual(self.target.read_bytes(), self.original)
        self.assertFalse(self.target.with_suffix('.tmp').exists())

    def test_identical_release_keeps_original_snapshot_date_and_bytes(self):
        candidate = copy.deepcopy(self.snapshot)
        candidate['generatedAt'] = '2026-11-15T00:00:00Z'
        self.assertEqual(refresh.write_snapshot(candidate, self.target), 'unchanged')
        self.assertEqual(self.target.read_bytes(), self.original)

    def test_older_prices_or_rents_do_not_replace_published_data(self):
        for field in ['priceMonth', 'rentMonth']:
            with self.subTest(field=field):
                candidate = copy.deepcopy(self.snapshot)
                candidate[field] = '2025-01'
                self.rejected(candidate)

    def test_missing_invalid_and_nonfinite_figures_keep_last_snapshot(self):
        for field, value in [('price', None), ('price', 0), ('rent', -1), ('rent', float('inf'))]:
            with self.subTest(field=field, value=value):
                candidate = copy.deepcopy(self.snapshot)
                candidate['areas'][0][field] = value
                self.rejected(candidate)

    def test_duplicate_codes_and_truncated_history_are_rejected(self):
        candidate = copy.deepcopy(self.snapshot)
        candidate['areas'].append(copy.deepcopy(candidate['areas'][0]))
        self.rejected(candidate)
        candidate = copy.deepcopy(self.snapshot)
        candidate['areas'][0]['history']['rent'] = []
        self.rejected(candidate)

    def test_same_month_revisions_are_published(self):
        candidate = copy.deepcopy(self.snapshot)
        candidate['areas'][0]['price'] = 246000
        self.assertEqual(refresh.write_snapshot(candidate, self.target), 'updated')
        self.assertEqual(json.loads(self.target.read_text()), candidate)

    def test_new_month_is_published_and_missing_rents_remain_missing(self):
        candidate = copy.deepcopy(self.snapshot)
        candidate['priceMonth'] = '2026-08'
        candidate['rentMonth'] = '2026-09'
        candidate['areas'][0]['rent'] = None
        self.assertEqual(refresh.write_snapshot(candidate, self.target), 'updated')
        self.assertIsNone(json.loads(self.target.read_text())['areas'][0]['rent'])


if __name__ == '__main__':
    unittest.main()
