const DB_NAME = 'leaf-reader';
let connection;
const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
});
export async function db() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      for (const name of ['books', 'files', 'fonts', 'settings', 'chunks'])
        if (!req.result.objectStoreNames.contains(name))
          req.result.createObjectStore(name, { keyPath: 'id' });
    };
    req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Закройте другую вкладку Leaf Reader и повторите.'));
  });
  return connection;
}
export async function transaction(stores, action) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(stores, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = event => reject(event.target.error ?? tx.error ?? new Error('Не удалось сохранить. Проверьте свободное место.'));
    try { action(name => tx.objectStore(name)); } catch (e) { tx.abort(); reject(e); }
  });
}
export async function all(store) {
  if (store === 'fonts') {
    const database = await db();
    return new Promise((resolve, reject) => {
      const result = [];
      const req = database.transaction('fonts').objectStore('fonts').openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(result); return; }
        const f = cursor.value;
        result.push({ id: f.id, family: f.family, style: f.style,
          size: f.fontBytes?.byteLength ?? f.file?.size ?? 0 });
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }
  const values = await request((await db()).transaction(store).objectStore(store).getAll());
  return values.map(value => hydrate(value));
}
export async function get(store, id) {
  const value = await request((await db()).transaction(store).objectStore(store).get(id));
  if (store === 'files' && value?.chunkCount) {
    const size = value.size ?? (await get('books', id))?.size;
    value.file = new StoredFile(id, value.filename, size);
  }
  return hydrate(value);
}
class StoredFile {
  constructor(id, name, size, root = null, offset = 0) {
    this.id = id; this.name = name; this.size = size; this.offset = offset;
    this.root = root ?? this;
    if (!root) this.cache = new Map();
  }
  slice(start = 0, end = this.size) {
    const normalize = n => Math.max(0, Math.min(this.size, n < 0 ? this.size + n : n));
    start = normalize(start); end = normalize(end);
    return new StoredFile(this.id, this.name, Math.max(0, end - start), this.root, this.offset + start);
  }
  async arrayBuffer() {
    const result = new Uint8Array(this.size);
    const block = 1024 * 1024;
    let written = 0;
    while (written < this.size) {
      const absolute = this.offset + written, index = Math.floor(absolute / block);
      let data = this.root.cache.get(index);
      if (!data) {
        data = (await get('chunks', this.id + ':' + index))?.data;
        if (!data) throw new Error('Не найден фрагмент книги. Импортируйте её заново.');
        this.root.cache.set(index, data);
        while (this.root.cache.size > 2) this.root.cache.delete(this.root.cache.keys().next().value);
      }
      const inside = absolute % block;
      const count = Math.min(data.byteLength - inside, this.size - written);
      if (count <= 0) throw new Error('Повреждён фрагмент книги.');
      result.set(new Uint8Array(data, inside, count), written); written += count;
    }
    return result.buffer;
  }
  async text() { return new TextDecoder().decode(await this.arrayBuffer()); }
  stream() {
    let offset = 0;
    const file = this;
    return new ReadableStream({
      async pull(controller) {
        if (offset >= file.size) { controller.close(); return; }
        try {
          const end = Math.min(offset + 65536, file.size);
          controller.enqueue(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
          offset = end;
        } catch (e) { controller.error(e); }
      },
    });
  }
}
function hydrate(value) {
  if (!value) return value;
  if (value.coverBytes) value.cover = new Blob([value.coverBytes], { type: 'image/jpeg' });
  if (value.fontBytes) value.file = new Blob([value.fontBytes]);
  return value;
}
async function portable(data) {
  const value = { ...data };
  if (value.cover instanceof Blob) { value.coverBytes = await value.cover.arrayBuffer(); delete value.cover; }
  return value;
}
export async function put(store, data) {
  const value = await portable(data);
  if (store === 'fonts' && value.file instanceof Blob) {
    value.fontBytes = await value.file.arrayBuffer(); delete value.file;
  }
  return transaction([store], s => s(store).put(value));
}
export const remove = (store, id) => transaction([store], s => s(store).delete(id));
export async function saveBook(book, file) {
  const record = await portable(book);
  // Avoid Blob persistence: some WebKit ports abort and lock transactions containing Blobs.
  // Commit metadata only after all bounded chunks are durable.
  {
    let chunkCount = 0;
    try {
      for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
        await put('chunks', { id: book.id + ':' + chunkCount++,
          data: await file.slice(offset, offset + 1024 * 1024).arrayBuffer() });
      }
      await transaction(['books', 'files'], s => {
        s('books').put(record);
        s('files').put({ id: book.id, filename: file.name, size: file.size, chunkCount });
      });
    } catch (e) { await deleteBook(book.id); throw e; }
  }
}
export const deleteBook = id => transaction(['books', 'files', 'chunks'], s => {
  s('books').delete(id); s('files').delete(id);
  s('chunks').delete(IDBKeyRange.bound(id + ':', id + ':\uffff'));
});
export async function updateBook(id, patch) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('books', 'readwrite');
    const store = tx.objectStore('books');
    const req = store.get(id);
    req.onsuccess = () => { if (req.result) store.put({ ...req.result, ...patch }); };
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
export async function cleanOrphanChunks() {
  const database = await db();
  const files = await request(database.transaction('files').objectStore('files').getAllKeys());
  const keep = new Set(files);
  return new Promise((resolve, reject) => {
    const tx = database.transaction('chunks', 'readwrite');
    const req = tx.objectStore('chunks').openKeyCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (!keep.has(String(cursor.key).split(':')[0])) tx.objectStore('chunks').delete(cursor.key);
      cursor.continue();
    };
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
// Content identity hashes fixed-size chunks; never copies the complete book into a digest buffer.
export async function fingerprint(file) {
  const hashes = [];
  for (let start = 0; start < file.size; start += 1024 * 1024) {
    hashes.push(new Uint8Array(await crypto.subtle.digest('SHA-256',
      await file.slice(start, start + 1024 * 1024).arrayBuffer())));
  }
  const combined = new Uint8Array(hashes.length * 32);
  hashes.forEach((hash, i) => combined.set(hash, i * 32));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', combined)),
    b => b.toString(16).padStart(2, '0')).join('');
}
