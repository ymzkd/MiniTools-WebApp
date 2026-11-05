"""Internal-only Japanese address API. No remote geocoding fallback or downloads."""
from contextlib import asynccontextmanager
from functools import lru_cache
import json
import math
import os
from pathlib import Path
import threading
import time

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse
import jageocoder

DATA_DIR = Path(os.environ.get('DATA_DIR', '/data'))
MAX_REVERSE_DISTANCE_M = float(os.environ.get('MAX_REVERSE_DISTANCE_M', '1500'))
REQUESTS_PER_MINUTE = int(os.environ.get('REQUESTS_PER_MINUTE', '120'))
# Jageocoder's global tree/configuration is mutable, so serialize all lookups.
tree_lock = threading.Lock()
rate_lock = threading.Lock()
rate_window = 0.0
rate_count = 0
ready = False


@asynccontextmanager
async def lifespan(_app):
    global ready
    dictionary = DATA_DIR / 'dictionary'
    if not (dictionary / 'README.md').is_file():
        raise RuntimeError('Local dictionary and its license README must be installed first')
    # Explicit local path prevents accidentally using the public demo RPC service.
    jageocoder.init(db_dir=str(dictionary), mode='r')
    ready = True
    yield
    ready = False


app = FastAPI(title='Japanese address API (Jageocoder)', lifespan=lifespan)


@app.middleware('http')
async def rate_limit(request: Request, call_next):
    global rate_window, rate_count
    if request.url.path in ('/search', '/reverse'):
        with rate_lock:
            now = time.monotonic()
            if now - rate_window >= 60:
                rate_window, rate_count = now, 0
            if rate_count >= REQUESTS_PER_MINUTE:
                return JSONResponse({'detail': 'Geocoding request limit reached'}, status_code=429,
                                    headers={'Retry-After': str(max(1, math.ceil(60 - (now - rate_window))))})
            rate_count += 1
    response = await call_next(request)
    response.headers['X-Geocoding-Provider'] = 'jageocoder'
    return response


def candidate_result(candidate: dict, **extra):
    lat, lng = candidate.get('y'), candidate.get('x')
    if lat is None or lng is None or not math.isfinite(lat) or not math.isfinite(lng):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return {'lat': lat, 'lng': lng, 'address': ''.join(candidate.get('fullname') or []),
            'level': candidate.get('level'), 'approximate': True, **extra}


@lru_cache(maxsize=2048)
def search_address(query: str):
    with tree_lock:
        got = jageocoder.search(query)
    for candidate in got.get('candidates', []):
        # Do not send an unrecognized facility name to a prefectural representative point.
        if (candidate.get('level') or 0) >= 3:
            result = candidate_result(candidate, matched=got.get('matched', ''))
            if result:
                return result
    return None


@lru_cache(maxsize=2048)
def reverse_address(lat: float, lng: float):
    # Outside Japan's broad envelope there is no relevant address; avoid a pointless tree scan.
    if not (20 <= lat <= 47 and 122 <= lng <= 154):
        return None
    with tree_lock:
        got = jageocoder.reverse(lng, lat, level=7)
    if not got:
        return None
    nearest = min(got, key=lambda row: row.get('dist', math.inf))
    distance = nearest.get('dist')
    if distance is None or not math.isfinite(distance) or distance > MAX_REVERSE_DISTANCE_M:
        return None
    return candidate_result(nearest['candidate'], distance_m=round(distance, 1))


@app.get('/health')
def health():
    return {'status': 'ok' if ready else 'not_ready', 'provider': 'jageocoder',
            'dictionary': 'jukyo_all_20250423_v22', 'network_geocoding': False}


@app.get('/search')
def search(q: str = Query(..., min_length=1, max_length=200)):
    query = q.strip()
    if not query:
        raise HTTPException(422, 'Address is required')
    return {'provider': 'jageocoder', 'result': search_address(query)}


@app.get('/reverse')
def reverse(lat: float = Query(..., ge=-90, le=90, allow_inf_nan=False),
            lng: float = Query(..., ge=-180, le=180, allow_inf_nan=False)):
    # Approx. 1m rounding avoids filling the cache with essentially identical requests.
    return {'provider': 'jageocoder', 'result': reverse_address(round(lat, 5), round(lng, 5))}


@app.get('/license', response_class=PlainTextResponse)
def license_text():
    return (DATA_DIR / 'dictionary/README.md').read_text(encoding='utf-8')


@app.get('/dataset')
def dataset():
    return json.loads((DATA_DIR / 'dataset.json').read_text(encoding='utf-8'))
