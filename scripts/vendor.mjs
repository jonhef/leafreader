import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
await mkdir('public/pdf', { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp('node_modules/pdfjs-dist/' + dir, 'public/pdf/' + dir, { recursive: true });
}
await mkdir('public/licenses', { recursive: true });
const licenses = {
  'LEAF-MIT.txt': 'LICENSE', 'GPL-3.0.txt': 'COPYING',
  'FOLIATE-MIT.txt': 'vendor/foliate/LICENSE',
  'DJVU-NOTICE.txt': 'vendor/djvu/LICENSE.md',
  'DJVU-GPL-2.0.txt': 'vendor/djvu/GNU_GPL_v2',
  'CAPACITOR-MIT.txt': 'node_modules/@capacitor/core/LICENSE',
  'ZIP-BSD.txt': 'node_modules/@zip.js/zip.js/LICENSE',
  'PNGJS-MIT.txt': 'node_modules/pngjs/LICENSE',
  'PDFJS-APACHE.txt': 'node_modules/pdfjs-dist/LICENSE',
};
for (const [name, path] of Object.entries(licenses)) await cp(path, 'public/licenses/' + name);
await writeFile('public/licenses/NOTICE.txt', await readFile('THIRD_PARTY_NOTICES.md', 'utf8'));
