import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { dashedUnderline } from '../src/plugins/underline.ts';

test('converts underline markers to styled inline HTML', () => {
  let replacement;
  dashedUnderline.text(
    { type: 'text', value: '前面 ++重点++ 和 ++另一处++ 后面' },
    { replaceNode: (_node, value) => (replacement = value) },
  );
  assert.deepEqual(replacement, [
    { type: 'text', value: '前面 ' },
    { type: 'html', value: '<span class="dashed-underline">' },
    { type: 'text', value: '重点' },
    { type: 'html', value: '</span>' },
    { type: 'text', value: ' 和 ' },
    { type: 'html', value: '<span class="dashed-underline">' },
    { type: 'text', value: '另一处' },
    { type: 'html', value: '</span>' },
    { type: 'text', value: ' 后面' },
  ]);
});

test('renders underline markers as styled text', async () => {
  const renderer = await createSatteriMarkdownProcessor({
    syntaxHighlight: false,
    mdastPlugins: [dashedUnderline],
  });
  const { code } = await renderer.render('前面 ++重点++ 后面', {});
  assert.equal(code, '<p>前面 <span class="dashed-underline">重点</span> 后面</p>\n');
});
