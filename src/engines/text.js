import { ZipReader, BlobReader } from '@zip.js/zip.js';
import { EPUB } from '../../vendor/foliate/epub.js';
import { makeFB2 } from '../../vendor/foliate/fb2.js';
import { LIMITS, assertSize, validateArchive } from '../core/limits.js';
import { checkXML, sanitizeMarkup } from '../core/security.js';
import '../../vendor/foliate/view.js';

async function readEntry(entry, type = '') {
  let size = 0;
  const chunks = [];
  const writable = new WritableStream({
    write(chunk) {
      size += chunk.byteLength;
      if (size > LIMITS.entry || size > entry.uncompressedSize)
        throw new Error('Ресурс EPUB превышает заявленный размер.');
      chunks.push(chunk);
    },
  });
  await entry.getData(writable, { checkSignature: true });
  return new Blob(chunks, { type });
}

export async function openText(file, format) {
  if (format === 'fb2') {
    assertSize(file.size, LIMITS.fb2, 'FB2');
    const bytes = await file.arrayBuffer();
    const head = new TextDecoder().decode(bytes.slice(0, 300));
    const encoding = head.match(/encoding\s*=\s*["']([^"']+)/i)?.[1] || 'utf-8';
    if (!/^(utf-8|utf-16|utf-16le|utf-16be|windows-1251)$/i.test(encoding))
      throw new Error('Неподдерживаемая кодировка FB2: ' + encoding);
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    checkXML(text);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'FictionBook'
      || !doc.querySelector('body')) throw new Error('Повреждённый FB2.');
    // Normalize encoding before passing the file to the upstream parser.
    const normalized = text.replace(/encoding\s*=\s*["'][^"']+["']/i, 'encoding="utf-8"');
    return makeFB2(new Blob([normalized]));
  }
  const zip = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    const entries = await zip.getEntries();
    validateArchive(entries);
    const map = new Map(entries.map(e => [e.filename, e]));
    if (!map.has('META-INF/container.xml')) throw new Error('В архиве нет структуры EPUB.');
    if (map.has('META-INF/encryption.xml')) {
      const encryption = await (await readEntry(map.get('META-INF/encryption.xml'))).text();
      // Font obfuscation is supported by Foliate; actual DRM is not.
      if (/EncryptedData/.test(encryption) && !/idpf.org\/2008\/embedding|adobe.com\/pdf\/enc#RC/.test(encryption))
        throw new Error('EPUB с DRM не поддерживается.');
    }
    const loader = {
      getSize: name => map.get(name)?.uncompressedSize ?? 0,
      loadText: async name => {
        const e = map.get(name); if (!e) return null;
        const text = await (await readEntry(e)).text();
        checkXML(text);
        return /\.(?:xhtml|html|htm|svg)$/i.test(name) ? sanitizeMarkup(text) : text;
      },
      loadBlob: async (name, type) => {
        const e = map.get(name); if (!e) return null;
        return readEntry(e, type);
      },
    };
    const book = await new EPUB(loader).init();
    if (!book.sections?.length) throw new Error('EPUB не содержит страниц.');
    book.transformTarget.addEventListener('data', event => {
      const { type } = event.detail;
      if (/html|xml|svg/.test(type)) event.detail.data = Promise.resolve(event.detail.data)
        .then(data => sanitizeMarkup(data, type === 'text/html' ? type : 'application/xhtml+xml'));
    });
    const destroy = book.destroy?.bind(book);
    book.destroy = () => { destroy?.(); void zip.close(); };
    return book;
  } catch (e) { await zip.close(); throw e; }
}
export function plainMetadata(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plainMetadata).filter(Boolean).join(', ');
  return plainMetadata(value.name || Object.values(value)[0]);
}
