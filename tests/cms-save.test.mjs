import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { CMS_CACHE, CMS_OUTPUT, patchCms, prepareCms, validateUploadSize } from '../scripts/prepare-cms.mjs';

await prepareCms();
const original = await readFile(CMS_CACHE, 'utf8');
const patched = await readFile(CMS_OUTPUT, 'utf8');
const folder = { internalPath: 'content/attachments', publicPath: '/attachments' };

function loadSave(source) {
  const ast = ts.createSourceFile('cms.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const definitions = new Map();
  // Execute the actual shipped save/asset functions, with only their environment stubbed.
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['_he', 'nhe'].includes(node.name.getText(ast))) {
      definitions.set(node.name.getText(ast), node.initializer.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(definitions.size, 2);
  return runInNewContext(
    `const nhe = ${definitions.get('nhe')}; (${definitions.get('_he')})`,
    {
      A: (store) => store,
      vM: folder,
      FU: {},
      sr: (value) => JSON.parse(JSON.stringify(value)),
      U2: ({ draft, slug }) => `content/${draft.collectionName}/${slug}.md`,
      Wme: () => {},
      EV: () => ({ widget: 'richtext' }),
      oM: (flags) => new RegExp('blob:https://example\\.com/[a-z0-9-]+', flags),
      Qz: async (file) => file.name,
      the: () => ({
        savingAssetProps: { folder },
        assetNamesInSameFolder: [],
        assetFolderPaths: {
          resolvedInternalPath: folder.internalPath,
          resolvedPublicPath: folder.publicPath,
        },
      }),
      qz: (name) => name,
      iz: () => 'image',
      X2: (path, name) => `${path}/${name}`,
      Uz: (path) => path,
    },
  );
}

const saveOriginal = loadSave(original);
const savePatched = loadSave(patched);
const blob = 'blob:https://example.com/clipboard-image';
const slugs = { defaultLocaleSlug: '2026-09-10' };

function createDraft(collectionName = 'diary') {
  return {
    collectionName,
    collection: { _i18n: { canonicalSlug: { key: 'slug' } } },
    currentLocales: { _default: true },
    currentValues: {
      _default: { date: '2026-09-10', draft: true, body: `![](${blob})\n\nDiary text.` },
    },
    files: { [blob]: { file: new File(['image bytes'], 'photo.jpg'), folder } },
  };
}

test('reproduces upstream failure: the second attempt silently omits the image', async () => {
  const draft = createDraft();
  const first = await saveOriginal({ draft, slugs });
  assert.equal(first.changes.length, 1);
  assert.equal(draft.currentValues._default.body.includes(blob), false);
  // The first upload fails; no files have reached GitHub.
  const retry = await saveOriginal({ draft, slugs });
  assert.equal(retry.changes.length, 0);
  assert.match(retry.localizedEntryMap._default.content.body, /\/attachments\/photo\.jpg/);
});

test('failed save and retry both include the image, without changing the live draft', async () => {
  for (const collectionName of ['diary', 'weekly', 'learning', 'reading', 'pages']) {
    const draft = createDraft(collectionName);
    const before = structuredClone(draft.currentValues);
    for (let attempt = 0; attempt < 2; attempt++) {
      const saved = await savePatched({ draft, slugs });
      assert.deepEqual(draft.currentValues, before);
      assert.equal(saved.changes.length, 1);
      assert.equal(saved.changes[0].path, 'content/attachments/photo.jpg');
      assert.equal(saved.changes[0].data, draft.files[blob].file);
      assert.equal(saved.localizedEntryMap._default.content.draft, true);
      assert.match(saved.localizedEntryMap._default.content.body, /\/attachments\/photo\.jpg/);
      assert.equal(saved.localizedEntryMap._default.content.body.includes(blob), false);
    }
  }
});

test('a backup restored after failure retains the file reference for the next save', async () => {
  const draft = createDraft();
  await savePatched({ draft, slugs });
  const restored = { ...draft, currentValues: structuredClone(draft.currentValues) };
  const saved = await savePatched({ draft: restored, slugs });
  assert.equal(saved.changes.length, 1);
  assert.equal(saved.changes[0].data, draft.files[blob].file);
});

test('plain text and existing image paths require no image uploads', async () => {
  const draft = createDraft();
  draft.currentValues._default.body = ' Text with ![](/attachments/existing.jpg) ';
  const saved = await savePatched({ draft, slugs });
  assert.equal(saved.changes.length, 0);
  assert.equal(saved.localizedEntryMap._default.content.body, 'Text with ![](/attachments/existing.jpg)');
  assert.equal(draft.currentValues._default.body.startsWith(' '), true);
});

test('the build rejects unverified bundles and serves only the patched local CMS', async () => {
  assert.throws(() => patchCms(original + '\n'), /Unexpected Sveltia CMS bundle/);
  assert.equal(patched, patchCms(original));
  const html = await readFile(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  assert.match(html, /src="\/admin\/sveltia-cms\.js"/);
  assert.doesNotMatch(html, /src="https:\/\/unpkg\.com\/@sveltia\/cms/);
});

test('combined Base64 payload is checked before sending a save request', () => {
  const file = (size) => new File([new Uint8Array(size)], 'photo.jpg');
  assert.doesNotThrow(() => validateUploadSize([{ action: 'create', data: file(3 * 1024 * 1024) }]));
  assert.throws(() => validateUploadSize([
    { action: 'create', data: file(3 * 1024 * 1024 + 1) },
  ]), /总量过大/);
  assert.throws(() => validateUploadSize([
    { action: 'create', data: file(2 * 1024 * 1024) },
    { action: 'update', data: file(2 * 1024 * 1024) },
  ]), /未发送保存请求/);
  assert.doesNotThrow(() => validateUploadSize([
    { action: 'delete', data: file(20 * 1024 * 1024) },
    { action: 'update', data: '正文 ![](/attachments/existing.webp)' },
  ]));
  assert.throws(() => validateUploadSize([
    { action: 'move', data: '图'.repeat(1024 * 1024 + 1) },
  ]), /总量过大/);
});

test('the actual GitHub commit function refuses oversized uploads before any network call', async () => {
  const ast = ts.createSourceFile('cms.js', patched, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let commitSource;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'Cq') {
      commitSource = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(commitSource);
  const commit = runInNewContext(`(${commitSource})`, { Blob });
  await assert.rejects(commit([{
    action: 'create', data: new Blob([new Uint8Array(8 * 1024 * 1024)]),
  }], {}), /未发送保存请求/);
});
