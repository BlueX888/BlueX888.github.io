import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CMS_VERSION = '0.209.0';
export const CMS_SHA256 = 'a2bc0e080e0eb1599ae0ae82026619e64442c363ee36882e965892c1acc61d85';
export const CMS_CACHE = new URL(`../node_modules/.cache/sveltia-cms-${CMS_VERSION}.js`, import.meta.url);
export const CMS_OUTPUT = new URL('../public/admin/sveltia-cms.js', import.meta.url);

// createBaseSavingEntryData mutates the live draft before GitHub accepts the commit.
// Clone each locale with Sveltia's own toRaw helper so a retry still includes its files.
// Source: src/lib/services/contents/draft/save/changes.js in Sveltia CMS v0.209.0.
const BEFORE = 'Object.entries(d).map(async([a,o])=>{let s=r?.[a]??t,c=U2';
const AFTER = 'Object.entries(d).map(async([a,o])=>{o=sr(o);let s=r?.[a]??t,c=U2';
const UNDERLINE_THEME_BEFORE = 'Wie={text:{italic:`italic`,strikethrough:`strikethrough`}';
const UNDERLINE_THEME_AFTER = 'Wie={text:{italic:`italic`,strikethrough:`strikethrough`,underline:`dashed-underline`}';
const UNDERLINE_FORMAT_BEFORE = 'Ak={format:[`strikethrough`],tag:`~~`,type:`text-format`},jk=';
const UNDERLINE_FORMAT_AFTER = 'Ak={format:[`strikethrough`],tag:`~~`,type:`text-format`},DASHED_UNDERLINE_TRANSFORMER={format:[`underline`],tag:`++`,type:`text-format`},jk=';
const UNDERLINE_TRANSFORMERS_BEFORE = '...r?[Sk]:[bae,Cae]],s=zx(a)';
const UNDERLINE_TRANSFORMERS_AFTER = '...r?[Sk]:[bae,Cae,DASHED_UNDERLINE_TRANSFORMER]],s=zx(a)';

// Keep Base64 additions below the request sizes that fail on this deployment.
// Check the combined payload, including files restored from an older draft backup.
export function validateUploadSize(changes) {
  const bytes = changes.reduce((total, { action, data }) => {
    if (!['create', 'update', 'move'].includes(action)) return total;
    const size = data instanceof Blob ? data.size : new Blob([data ?? '']).size;
    return total + 4 * Math.ceil(size / 3);
  }, 0);
  if (bytes > 4 * 1024 * 1024) {
    throw new Error(
      '\u672c\u6b21\u4fdd\u5b58\u7684\u65b0\u6587\u4ef6\u603b\u91cf\u8fc7\u5927\u3002' +
      '\u8bf7\u5148\u4fdd\u7559\u539f\u56fe\uff0c\u70b9\u56fe\u7247\u300c\u66ff\u6362\u300d\u91cd\u65b0\u9009\u62e9\u539f\u56fe\u4ee5\u542f\u7528\u538b\u7f29\uff1b' +
      '\u591a\u5f20\u56fe\u7247\u53ef\u5206\u6279\u4e0a\u4f20\u5230\u5a92\u4f53\u5e93\u540e\u518d\u63d2\u5165\u3002' +
      '\u672c\u6b21\u672a\u53d1\u9001\u4fdd\u5b58\u8bf7\u6c42\uff0c\u8349\u7a3f\u4ecd\u4fdd\u7559\u3002',
    );
  }
}

export function patchCms(source) {
  if (createHash('sha256').update(source).digest('hex') !== CMS_SHA256) {
    throw new Error('Unexpected Sveltia CMS bundle. Refusing to apply the save-retry patch.');
  }
  const commitStart = 'Cq=async(e,t)=>{';
  const targets = [
    BEFORE,
    commitStart,
    UNDERLINE_THEME_BEFORE,
    UNDERLINE_FORMAT_BEFORE,
    UNDERLINE_TRANSFORMERS_BEFORE,
  ];
  if (targets.some((target) => source.split(target).length !== 2)) {
    throw new Error('Sveltia CMS patch targets must occur exactly once.');
  }
  return source
    .replace(BEFORE, AFTER)
    .replace(commitStart, `${commitStart}(${validateUploadSize.toString()})(e);`)
    .replace(UNDERLINE_THEME_BEFORE, UNDERLINE_THEME_AFTER)
    .replace(UNDERLINE_FORMAT_BEFORE, UNDERLINE_FORMAT_AFTER)
    .replace(UNDERLINE_TRANSFORMERS_BEFORE, UNDERLINE_TRANSFORMERS_AFTER);
}

export async function prepareCms() {
  let source;
  try {
    source = await readFile(CMS_CACHE, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(
      `https://unpkg.com/@sveltia/cms@${CMS_VERSION}/dist/sveltia-cms.js`,
      { signal: AbortSignal.timeout(60_000) },
    );
    if (!response.ok) throw new Error(`Sveltia CMS download failed: HTTP ${response.status}`);
    source = await response.text();
  }

  const patched = patchCms(source);
  await mkdir(dirname(fileURLToPath(CMS_CACHE)), { recursive: true });
  await writeFile(CMS_CACHE, source);
  await writeFile(CMS_OUTPUT, patched);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await prepareCms();
  console.log(`Prepared Sveltia CMS ${CMS_VERSION} with the save-retry fix.`);
}
