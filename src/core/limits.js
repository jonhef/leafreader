export const MiB = 1024 * 1024;
export const LIMITS = Object.freeze({
  file: 128 * MiB, fb2: 24 * MiB, font: 12 * MiB,
  entries: 5000, entry: 24 * MiB, expanded: 256 * MiB,
  pixels: 16_000_000, search: 200,
});
export function assertSize(size, limit, label = 'Файл') {
  if (!Number.isFinite(size) || size <= 0) throw new Error(label + ' пуст или повреждён.');
  if (size > limit) throw new Error(label + ': лимит ' + Math.round(limit / MiB) + ' МБ.');
}
export function validateArchive(entries) {
  if (entries.length > LIMITS.entries) throw new Error('Слишком много файлов в EPUB.');
  const names = new Set();
  let total = 0;
  for (const e of entries) {
    const name = e.filename;
    if (!name || name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name)
      || name.split('/').includes('..') || /[\x00-\x1f]/.test(name) || names.has(name))
      throw new Error('Небезопасный или повторяющийся путь в EPUB.');
    names.add(name);
    if (e.encrypted) throw new Error('Зашифрованный EPUB не поддерживается.');
    if (!Number.isSafeInteger(e.uncompressedSize) || e.uncompressedSize < 0
      || e.uncompressedSize > LIMITS.entry) throw new Error('Слишком большой ресурс EPUB.');
    total += e.uncompressedSize;
    if (total > LIMITS.expanded) throw new Error('EPUB превышает лимит распаковки.');
  }
}
export function fitPixels(width, height, scale = 1) {
  if (!(width > 0 && height > 0 && Number.isFinite(width * height)))
    throw new Error('Некорректный размер страницы.');
  return Math.min(scale, 16384 / width, 16384 / height,
    Math.sqrt((LIMITS.pixels - 32768) / (width * height)));
}
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}
