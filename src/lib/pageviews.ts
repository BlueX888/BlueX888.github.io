export async function loadPageviews(update: boolean) {
  await Promise.all(
    [...document.querySelectorAll<HTMLElement>('[data-pageview]')].map(async (element) => {
      const counter = element.querySelector<HTMLElement>('[data-pageview-count]');
      const { server, path } = element.dataset;
      if (!counter || !server || !path) return;

      try {
        const url = new URL(`${server.replace(/\/+$/, '')}/api/article`);
        url.searchParams.set('lang', 'zh-CN');
        if (!update) {
          url.searchParams.set('path', path);
          url.searchParams.set('type', 'time');
        }
        const response = await fetch(url, {
          method: update ? 'POST' : 'GET',
          ...(update && {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, type: 'time', action: 'inc' }),
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('Counter request failed');
        const result = await response.json();
        const count = result?.data?.[0]?.time;
        if (result?.errno || !Number.isSafeInteger(count) || count < 0) {
          throw new Error('Invalid counter response');
        }
        counter.textContent = count.toLocaleString('zh-CN');
      } catch {
        // Do not retry increments: a timed-out request may already have been saved.
        counter.textContent = '--';
        element.title = '浏览量暂时无法获取';
      }
    }),
  );
}
