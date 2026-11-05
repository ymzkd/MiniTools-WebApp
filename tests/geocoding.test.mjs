import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { createGeocodingRouter } from '../geocodingProxy.js';
import { createServer } from 'vite';

async function serve(t, options) {
  const app = express();
  app.use('/api/geocoding', createGeocodingRouter(options));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/api/geocoding`;
}

test('default configuration preserves Nominatim and never proxies to the new service', async (t) => {
  let calls = 0;
  const base = await serve(t, { provider: 'nominatim', fetchImpl: () => { calls++; throw new Error(); } });
  assert.equal((await (await fetch(`${base}/config`)).json()).provider, 'nominatim');
  assert.equal((await fetch(`${base}/search?q=test`)).status, 409);
  assert.equal(calls, 0);
});

test('local provider validates inputs, limits requests and has no external fallback', async (t) => {
  const urls = [];
  const base = await serve(t, {
    provider: 'jageocoder', apiUrl: 'http://private-geocoder:8000', requestsPerMinute: 2,
    fetchImpl: async (url) => { urls.push(url); return new Response('{"provider":"jageocoder","result":null}'); },
  });
  const config = await (await fetch(`${base}/config`)).json();
  assert.match(config.attribution, /株式会社情報試作室/);
  assert.match(config.notice, /近傍/);
  assert.equal((await fetch(`${base}/search?q=`)).status, 422);
  assert.equal((await fetch(`${base}/reverse?lat=nan&lng=139`)).status, 422);
  assert.equal((await fetch(`${base}/search?q=test`)).status, 200);
  assert.equal((await fetch(`${base}/reverse?lat=35&lng=139`)).status, 200);
  assert.equal((await fetch(`${base}/search?q=test`)).status, 429);
  assert.equal(urls.length, 2);
  assert.ok(urls.every(url => url.startsWith('http://private-geocoder:8000/')));
});

test('local outage returns an error instead of calling Nominatim', async (t) => {
  let calls = 0;
  const base = await serve(t, { provider: 'jageocoder', apiUrl: 'http://private:8000', fetchImpl: async () => { calls++; throw new Error('offline'); } });
  assert.equal((await fetch(`${base}/search?q=test`)).status, 502);
  assert.equal(calls, 1);
  assert.throws(() => createGeocodingRouter({ provider: 'jageocoder' }), /required/);
});

test('frontend local selection uses only same-origin geocoding requests', async (t) => {
  const urls = [];
  let unavailable = false;
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    if (url === '/api/geocoding/config') return new Response(JSON.stringify({ provider: 'jageocoder', attribution: 'local', notice: '' }));
    if (unavailable) return new Response('{}', { status: 502 });
    return new Response(JSON.stringify({ result: { lat: 35.68, lng: 139.69, address: '東京都新宿区', level: 7, approximate: true } }));
  });
  const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { geocode, reverseGeocode } = await server.ssrLoadModule('/src/components/hazard/api.ts');
    assert.deepEqual(await geocode('西新宿2-8-1'), { lat: 35.68, lng: 139.69 });
    assert.equal(await reverseGeocode(35.68, 139.69), '東京都新宿区');
    unavailable = true;
    assert.equal(await reverseGeocode(35.68, 139.69), null);
    await assert.rejects(geocode('西新宿2-8-1'), /ローカル住所検索API/);
    assert.equal(urls.filter(url => url === '/api/geocoding/config').length, 1);
    assert.ok(urls.every(url => url.startsWith('/api/geocoding/')));
  } finally { await server.close(); }
});

test('frontend default retains Nominatim address search and reverse formatting', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    if (url === '/api/geocoding/config') return new Response(JSON.stringify({ provider: 'nominatim', attribution: 'OSM', notice: '' }));
    if (url.includes('/search?')) return new Response('[{"lat":"35.68","lon":"139.69"}]');
    return new Response(JSON.stringify({ display_name: '西新宿二丁目, 新宿区, 東京都, 日本', address: { country: '日本' } }));
  });
  const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { geocode, reverseGeocode } = await server.ssrLoadModule('/src/components/hazard/api.ts');
    assert.deepEqual(await geocode('西新宿'), { lat: 35.68, lng: 139.69 });
    assert.equal(await reverseGeocode(35.68, 139.69), '東京都 新宿区 西新宿二丁目');
    assert.ok(urls.slice(1).every(url => url.startsWith('https://nominatim.openstreetmap.org/')));
  } finally { await server.close(); }
});
