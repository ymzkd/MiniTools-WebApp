import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import app


class GeocoderTests(unittest.TestCase):
    def setUp(self):
        app.search_address.cache_clear()
        app.reverse_address.cache_clear()
        app.rate_window = 0
        app.rate_count = 0
        self.client = TestClient(app.app)

    def test_forward_cache_and_address_normalization(self):
        node = {'x': 139.69, 'y': 35.68, 'level': 7, 'fullname': ['東京都', '新宿区', '西新宿', '二丁目', '8番']}
        with patch.object(app.jageocoder, 'search', return_value={'matched': '西新宿2-8', 'candidates': [node]}) as search:
            for _ in range(2):
                r = self.client.get('/search', params={'q': ' 西新宿2-8-1 '})
                self.assertEqual(r.status_code, 200)
                self.assertEqual(r.json()['result']['address'], '東京都新宿区西新宿二丁目8番')
            search.assert_called_once_with('西新宿2-8-1')

    def test_unrecognized_facility_does_not_match_a_prefecture(self):
        with patch.object(app.jageocoder, 'search', return_value={'candidates': [{'level': 1, 'x': 139, 'y': 35}]}):
            self.assertIsNone(self.client.get('/search', params={'q': '施設名'}).json()['result'])

    def test_reverse_is_nearest_candidate_with_distance_not_a_cadastral_claim(self):
        node = {'x': 139.69, 'y': 35.68, 'level': 7, 'fullname': ['東京都', '新宿区']}
        with patch.object(app.jageocoder, 'reverse', return_value=[{'candidate': node, 'dist': 80}, {'candidate': node, 'dist': 20}]) as reverse:
            result = self.client.get('/reverse?lat=35.68000001&lng=139.69000001').json()['result']
            self.assertEqual(result['distance_m'], 20)
            self.assertTrue(result['approximate'])
            reverse.assert_called_once_with(139.69, 35.68, level=7)
        app.reverse_address.cache_clear()
        with patch.object(app.jageocoder, 'reverse', return_value=[{'candidate': node, 'dist': 2000}]):
            self.assertIsNone(self.client.get('/reverse?lat=35&lng=139').json()['result'])

    def test_validation_and_rate_limit(self):
        for url in ['/search?q=', '/search?q=%20', '/reverse?lat=nan&lng=139', '/reverse?lat=91&lng=139']:
            self.assertEqual(self.client.get(url).status_code, 422)
        with patch.object(app, 'REQUESTS_PER_MINUTE', 1):
            app.rate_window = 0
            self.client.get('/search?q=')
            self.assertEqual(self.client.get('/search?q=').status_code, 429)

    def test_startup_is_local_and_preserves_license(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'dictionary').mkdir()
            (root / 'dictionary/README.md').write_text('dictionary license', encoding='utf-8')
            with patch.object(app, 'DATA_DIR', root), patch.object(app.jageocoder, 'init') as init:
                with TestClient(app.app) as client:
                    self.assertEqual(client.get('/health').json()['network_geocoding'], False)
                    self.assertEqual(client.get('/license').text, 'dictionary license')
                init.assert_called_once_with(db_dir=str(root / 'dictionary'), mode='r')


if __name__ == '__main__':
    unittest.main()
