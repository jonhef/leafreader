import { assertSize, LIMITS } from './limits.js';
export function fontInfo(buffer) {
  assertSize(buffer.byteLength, LIMITS.font, 'Шрифт');
  const v = new DataView(buffer);
  if (v.byteLength < 12) throw new Error('Повреждённый шрифт.');
  const sig = v.getUint32(0);
  if (sig !== 0x00010000 && sig !== 0x4f54544f) throw new Error('Поддерживаются только TTF и OTF.');
  const tables = v.getUint16(4);
  if (tables > 128 || 12 + tables * 16 > v.byteLength) throw new Error('Повреждена таблица шрифта.');
  let nameOffset, nameLength;
  for (let i = 0; i < tables; i++) {
    const p = 12 + i * 16, offset = v.getUint32(p + 8), length = v.getUint32(p + 12);
    if (offset + length > v.byteLength) throw new Error('Повреждена таблица шрифта.');
    if (v.getUint32(p) === 0x6e616d65) { nameOffset = offset; nameLength = length; }
  }
  if (nameOffset == null || nameLength < 6) throw new Error('У шрифта нет названия семейства.');
  const count = v.getUint16(nameOffset + 2), strings = nameOffset + v.getUint16(nameOffset + 4);
  if (6 + count * 12 > nameLength) throw new Error('Повреждено название шрифта.');
  const names = new Map();
  for (let i = 0; i < count; i++) {
    const p = nameOffset + 6 + i * 12;
    const platform = v.getUint16(p), id = v.getUint16(p + 6), len = v.getUint16(p + 8);
    const start = strings + v.getUint16(p + 10);
    if (start + len > nameOffset + nameLength) throw new Error('Повреждено название шрифта.');
    if (![1, 2, 16, 17].includes(id) || ![0, 3].includes(platform)) continue;
    const value = new TextDecoder('utf-16be').decode(buffer.slice(start, start + len)).replace(/\0/g, '').trim();
    if (value && !names.has(id)) names.set(id, value.slice(0, 100));
  }
  return { family: names.get(16) || names.get(1) || 'Свой шрифт', style: names.get(17) || names.get(2) || 'Regular' };
}
