import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import QRCode from 'qrcode';

test('printed location links round-trip coordinates and reject invalid input', async () => {
  const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { buildLocationLink, readLocationLink } = await server.ssrLoadModule('/src/components/hazard/locationLink.ts');
    const point = { lat: 35.68962860107422, lng: 139.6917724609375 };
    const url = new URL(buildLocationLink(point));
    assert.equal(url.origin, 'https://minitools.yama-structure-test.com');
    assert.equal(url.pathname, '/hazard');
    assert.deepEqual(readLocationLink(url.search), point);
    assert.deepEqual([...url.searchParams.keys()], ['lat', 'lng']);
    assert.deepEqual(readLocationLink('?lat=0&lng=0'), { lat: 0, lng: 0 });
    for (const search of ['', '?lat=35', '?lat=&lng=139', '?lat=91&lng=139', '?lat=35&lng=-181', '?lat=NaN&lng=139', '?lat=Infinity&lng=139', '?lat=0x20&lng=139']) {
      assert.equal(readLocationLink(search), null, search);
    }
    const qr = await QRCode.toDataURL(url.href, { errorCorrectionLevel: 'M', margin: 4, width: 360 });
    assert.match(qr, /^data:image\/png;base64,/);
    const { HazardReportView } = await server.ssrLoadModule('/src/components/hazard/report/HazardReportView.tsx');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const markup = renderToStaticMarkup(createElement(HazardReportView, {
      data: { point, generatedAt: '2026-11-05 18:00', placeName: null, elevation: null, seaRatio: null, landRatio: null, radiusKm: 40, snow: null, wind: null, seismic: null, shore: null, roughness: null },
      locationUrl: url.href, qrDataUrl: qr,
    }));
    assert.ok(markup.includes('この地点を地図で開くQRコード'));
    assert.ok(markup.includes('width:16mm;height:16mm'));
    assert.ok(!markup.includes('<div>この地点を地図で開く</div>'));
    assert.ok(markup.indexOf('この地点を地図で開くQRコード') < markup.indexOf('所在地 / LOCATION'));
    assert.ok(markup.includes(qr));
  } finally { await server.close(); }
});
