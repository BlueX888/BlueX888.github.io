import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPageviews } from '../src/lib/pageviews.ts';

function setup(t, paths, respond = () => ({ errno: 0, data: [{ time: 1234 }] })) {
  const elements = paths.map((path) => {
    const counter = { textContent: '...' };
    return {
      dataset: { server: 'https://comments.example/', path },
      counter,
      querySelector: () => counter,
    };
  });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, ...options });
    return { ok: true, json: async () => respond(url, options) };
  });
  const previous = globalThis.document;
  globalThis.document = { querySelectorAll: () => elements };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  return { elements, requests };
}

test('an article increments its own count and the site total exactly once', async (t) => {
  const { elements, requests } = setup(t, ['/reading/一本书/', '__site_total__']);
  await loadPageviews(true);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ body }) => JSON.parse(body)), [
    { path: '/reading/一本书/', type: 'time', action: 'inc' },
    { path: '__site_total__', type: 'time', action: 'inc' },
  ]);
  for (const request of requests) {
    assert.equal(request.method, 'POST');
    assert.equal(request.url.href, 'https://comments.example/api/article?lang=zh-CN');
  }
  assert.deepEqual(elements.map(({ counter }) => counter.textContent), ['1,234', '1,234']);
});

test('non-article pages increment only the shared site total', async (t) => {
  const { requests } = setup(t, ['__site_total__']);
  await loadPageviews(true);
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].body).path, '__site_total__');
});

test('local previews read existing counts without incrementing', async (t) => {
  const paths = ['/reading/%E4%B9%A6/', '__site_total__'];
  const { requests, elements } = setup(t, paths, () => ({ errno: 0, data: [{ time: 0 }] }));
  await loadPageviews(false);
  assert.equal(requests.length, 2);
  requests.forEach((request, index) => {
    assert.equal(request.method, 'GET');
    assert.equal(request.body, undefined);
    assert.equal(request.url.searchParams.get('path'), paths[index]);
    assert.equal(request.url.searchParams.get('type'), 'time');
  });
  assert.deepEqual(elements.map(({ counter }) => counter.textContent), ['0', '0']);
});

test('no configured counters means no requests', async (t) => {
  const { requests } = setup(t, []);
  await loadPageviews(true);
  assert.equal(requests.length, 0);
});

test('invalid or failed responses show an unavailable state without retrying', async (t) => {
  for (const response of [
    { errno: 1, errmsg: 'Unavailable' },
    { data: [{ time: -1 }] },
    { data: [{ time: '123' }] },
    { data: [{ time: 1.5 }] },
    {},
    null,
  ]) {
    await t.test(JSON.stringify(response), async (t) => {
      const { elements, requests } = setup(t, ['__site_total__'], () => response);
      await loadPageviews(true);
      assert.equal(requests.length, 1);
      assert.equal(elements[0].counter.textContent, '--');
      assert.equal(elements[0].title, '浏览量暂时无法获取');
    });
  }
});

test('network failures are handled without an automatic duplicate increment', async (t) => {
  const { elements } = setup(t, ['__site_total__']);
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await loadPageviews(true);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(elements[0].counter.textContent, '--');
});

test('HTTP failures never display an apparent success count', async (t) => {
  const { elements } = setup(t, ['__site_total__']);
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    json: async () => ({ data: [{ time: 999 }] }),
  }));
  await loadPageviews(true);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(elements[0].counter.textContent, '--');
});
