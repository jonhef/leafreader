import DjVuDocument from '../../vendor/djvu/src/DjVuDocument.js';
let doc;
self.onmessage = async ({ data: { id, command, buffer, page } }) => {
  try {
    if (command === 'open') {
      doc = new DjVuDocument(buffer);
      if (!doc.isBundled()) throw new Error('Indirect DjVu пока не поддерживается. Нужен bundled-файл.');
      const count = doc.getPagesQuantity();
      if (!count || count > 50000) throw new Error('Некорректное количество страниц.');
      const mapToc = (items, depth = 0) => depth > 12 ? [] : items.slice(0, 500).map(item => ({
        description: item.description,
        page: doc.getPageNumberByUrl(item.url) || 1,
        children: mapToc(item.children || [], depth + 1),
      }));
      self.postMessage({ id, result: { count, toc: mapToc(doc.getContents() || []) } });
    } else {
      const p = await doc.getPage(page);
      if (p.getWidth() * p.getHeight() > 16_000_000)
        throw new Error('Страница DjVu больше 16 мегапикселей. Поддержка фрагментов ещё не реализована.');
      const image = p.getImageData();
      self.postMessage({ id, result: image }, [image.data.buffer]);
    }
  } catch (e) { self.postMessage({ id, error: e.message || 'Повреждённый DjVu.' }); }
};
