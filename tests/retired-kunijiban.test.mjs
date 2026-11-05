// Node.js 24+: node --test --test-concurrency=1 tests/*.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'vite';

test('XML retrieval keeps local endpoints and rejects external URLs before fetching', async (t) => {
  const server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    return new Response(JSON.stringify({ detail: 'local endpoint reached' }), {
      status: 404, headers: { 'content-type': 'application/json' },
    });
  });
  t.mock.method(console, 'error', () => {});
  try {
    const { fetchAndParseBoringData } = await server.ssrLoadModule('/src/components/boring/api.ts');
    for (const url of ['/api/tokyo/files/example_bed.xml', '/api/ngi/proxy/boring/xml/123']) {
      await assert.rejects(fetchAndParseBoringData(url, 'test', { lat: 35, lng: 136 }), /local endpoint reached/);
      assert.equal(urls.at(-1), url);
    }
    const count = urls.length;
    for (const url of [
      'https://www.kunijiban.pwri.go.jp/viewer/refer/?data=boring&type=xml&id=123',
      'https://publicweb.ngic.or.jp/viewer/refer/?id=123',
      '//www.kunijiban.pwri.go.jp/example.xml',
      '/api/kunijiban?url=test',
    ]) {
      await assert.rejects(fetchAndParseBoringData(url, 'test', { lat: 35, lng: 136 }), /取得経路は対応していません/);
    }
    assert.equal(urls.length, count);
  } finally {
    await server.close();
  }
});

test('retired production URL returns 410 without making an upstream request', { timeout: 15000 }, async (t) => {
  // Exercise the real Express server on an ephemeral local port; deny all upstream fetches.
  const child = spawn(process.execPath, ['--input-type=module', '--eval', `
    import express from 'express';
    const listen = express.application.listen;
    express.application.listen = function (...args) {
      const server = listen.apply(this, args);
      server.on('listening', () => console.log('TEST_PORT=' + server.address().port));
      return server;
    };
    globalThis.fetch = () => { console.error('UNEXPECTED_UPSTREAM_FETCH'); throw new Error('External access forbidden'); };
    await import('./server.js');
  `], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data; });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}; ${stderr}`)));
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/TEST_PORT=(\d+)/);
      if (match) resolve(Number(match[1]));
    });
  });
  const res = await fetch(`http://127.0.0.1:${port}/api/kunijiban?url=${encodeURIComponent('https://www.kunijiban.pwri.go.jp/example.xml')}`);
  assert.equal(res.status, 410);
  assert.match((await res.json()).error, /retired/);
  assert.ok(!stderr.includes('UNEXPECTED_UPSTREAM_FETCH'));
});
