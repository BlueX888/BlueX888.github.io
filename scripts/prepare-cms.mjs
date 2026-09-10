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

export function patchCms(source) {
  if (createHash('sha256').update(source).digest('hex') !== CMS_SHA256) {
    throw new Error('Unexpected Sveltia CMS bundle. Refusing to apply the save-retry patch.');
  }
  if (source.split(BEFORE).length !== 2) {
    throw new Error('Sveltia CMS save-retry patch target must occur exactly once.');
  }
  return source.replace(BEFORE, AFTER);
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
