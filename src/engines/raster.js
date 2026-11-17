import { fitPixels } from '../core/limits.js';
export async function openRaster(file, format) {
  if (format === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    // Range reads keep the original PDF out of a single large JS buffer.
    class BlobTransport extends pdfjs.PDFDataRangeTransport {
      constructor() { super(file.size, new Uint8Array(), false); }
      requestDataRange(begin, end) {
        file.slice(begin, end).arrayBuffer().then(buffer => this.onDataRange(begin, new Uint8Array(buffer)));
      }
    }
    const task = pdfjs.getDocument({
      range: new BlobTransport(), rangeChunkSize: 65536,
      disableAutoFetch: true, disableStream: true, isEvalSupported: false,
      cMapUrl: new URL('pdf/cmaps/', document.baseURI).href, cMapPacked: true,
      standardFontDataUrl: new URL('pdf/standard_fonts/', document.baseURI).href,
      wasmUrl: new URL('pdf/wasm/', document.baseURI).href,
      stopAtErrors: true,
    });
    task.onPassword = () => { void task.destroy(); };
    let doc;
    try { doc = await task.promise; }
    catch (e) { await task.destroy(); throw new Error(e.name === 'PasswordException' || /destroyed/i.test(e.message)
      ? 'PDF защищён паролем. Используйте незашифрованную копию.' : 'Не удалось прочитать PDF: ' + e.message); }
    let renderTask;
    const outline = await doc.getOutline().catch(() => null);
    const mapToc = async items => Promise.all((items || []).map(async item => {
      let dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
      let index = dest?.[0];
      const page = typeof index === 'number' ? index + 1 : index ? (await doc.getPageIndex(index)) + 1 : 1;
      return { label: item.title, page, subitems: await mapToc(item.items) };
    }));
    return {
      count: doc.numPages, toc: await mapToc(outline),
      async render(page, canvas, width, zoom) {
        renderTask?.cancel();
        const p = await doc.getPage(page), base = p.getViewport({ scale: 1 });
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const scale = fitPixels(base.width, base.height, width * zoom * ratio / base.width);
        const viewport = p.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        canvas.style.width = viewport.width / ratio + 'px';
        canvas.style.height = viewport.height / ratio + 'px';
        renderTask = p.render({ canvasContext: canvas.getContext('2d'), viewport });
        try { await renderTask.promise; } finally { p.cleanup(); }
      },
      close() { renderTask?.cancel(); return task.destroy(); },
    };
  }
  const worker = new Worker(new URL('./djvu.worker.js', import.meta.url), { type: 'module' });
  let seq = 0;
  const pending = new Map();
  const rejectAll = message => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); } pending.clear(); };
  worker.onerror = () => rejectAll('Ошибка декодера DjVu.');
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id); if (!p) return;
    pending.delete(data.id); clearTimeout(p.timer);
    data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
  };
  const call = (command, props = {}, transfer = []) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { worker.terminate(); rejectAll('Декодирование DjVu превысило 30 секунд.'); }, 30000);
    pending.set(id, { resolve, reject, timer }); worker.postMessage({ id, command, ...props }, transfer);
  });
  let info;
  try {
    const buffer = await file.arrayBuffer();
    info = await call('open', { buffer }, [buffer]);
  } catch (e) { worker.terminate(); throw e; }
  const mapToc = items => items.map(x => ({
    label: x.description, page: x.page,
    subitems: mapToc(x.children || []),
  }));
  return {
    count: info.count, toc: mapToc(info.toc),
    async render(page, canvas, width, zoom) {
      const data = await call('page', { page });
      canvas.width = data.width; canvas.height = data.height;
      canvas.getContext('2d').putImageData(new ImageData(data.data, data.width, data.height), 0, 0);
      canvas.style.width = width * zoom + 'px'; canvas.style.height = 'auto';
    },
    close() { worker.terminate(); rejectAll('Книга закрыта.'); },
  };
}
