// Node.js 24+: node --test --test-concurrency=1 tests/*.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { isNgicOnly, NGIC_PUBLIC_URL } from '../src/components/boring/ngicAccess.ts';
import { featureToResult } from '../src/components/boring/pointsTiles.ts';

test('NGIC-only points remain identifiable with old cached individual-data links', () => {
  for (const view_url of [undefined, '/api/ngi/proxy/boring/log/123', 'https://publicweb.ngic.or.jp/NGICViewer/index.php?xml=test']) {
    const result = featureToResult({ source: 'ngi', kj: 0, xml_url: '/api/ngi/proxy/boring/xml/123', view_url }, 136, 35);
    assert.equal(isNgicOnly(result), true);
  }
});

test('KuniJiban, port and Tokyo points keep their existing behavior', () => {
  for (const props of [{ source: 'ngi', kj: 1 }, { source: 'ngi', kj: 1, log_url: 'https://www.sdb.pari.go.jp/test.pdf' }, { source: 'tokyo', kj: 0 }]) {
    assert.equal(isNgicOnly(featureToResult(props, 136, 35)), false);
  }
  assert.equal(isNgicOnly({ id: 'legacy', title: 'legacy' }), false);
});

test('legacy API NGIC viewer links and the new public entry link are site-only', () => {
  for (const url of ['https://publicweb.ngic.or.jp/NGICViewer/index.php?xml=test', NGIC_PUBLIC_URL]) {
    assert.equal(isNgicOnly({ id: 'test', title: 'test', metadata: { 'NGI:link_boring_view': url } }), true);
  }
  assert.equal(isNgicOnly({ id: 'test', title: 'test', metadata: { 'NGI:kj_listed': '0' } }), true);
});

test('NGIC-only detail renders just the official link, even with cached data and resources', async () => {
  const server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { default: Viewer } = await server.ssrLoadModule('/src/components/boring/BoringLogViewer.tsx');
    const result = featureToResult({ source: 'ngi', kj: 0, xml_url: '/api/ngi/proxy/boring/xml/123', log_url: '/api/ngi/proxy/boring/log/123' }, 136, 35);
    result.resources = [{ id: 'xml', name: 'XML', url: '/old.xml', format: 'XML' }];
    const html = renderToStaticMarkup(React.createElement(Viewer, {
      selectedResult: result, loading: false, onClose() {},
      data: { id: 'old', title: 'cached', location: result.location, depth: 10, layers: [] },
    }));
    assert.ok(html.includes(`href="${NGIC_PUBLIC_URL}"`));
    assert.ok(html.includes('本アプリでは取得しません'));
    for (const forbidden of ['/api/ngi/proxy/', '/old.xml', 'XMLファイルをダウンロード', 'PDF柱状図を表示', 'データの詳細情報がありません']) {
      assert.ok(!html.includes(forbidden), forbidden);
    }
    assert.equal((html.match(/<a\b/g) || []).length, 1);
  } finally {
    await server.close();
  }
});
