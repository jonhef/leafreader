export function checkXML(text) {
  if (/<!ENTITY\b/i.test(text) || /<!DOCTYPE[^>]*\[/i.test(text))
    throw new Error('Внешние сущности и DTD не поддерживаются.');
  if (text.length > 25 * 1024 * 1024) throw new Error('Слишком большой раздел книги.');
}
export function sanitizeMarkup(text, type = 'application/xhtml+xml') {
  checkXML(text);
  const doc = new DOMParser().parseFromString(text, type);
  if (doc.querySelector('parsererror')) throw new Error('Повреждена разметка книги.');
  for (const el of doc.querySelectorAll('script, iframe, frame, object, embed, form, input, button, textarea, base, meta[http-equiv], audio, video'))
    el.remove();
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || ['srcdoc', 'srcset', 'formaction', 'action'].includes(attr.name)
        || (/^(?:src|href|xlink:href)$/i.test(attr.name) && /^\s*(?:https?:|\/\/)/i.test(attr.value) && el.localName !== 'a')
        || (/^(?:href|src|xlink:href)$/i.test(attr.name) && /^\s*(?:javascript|vbscript):/i.test(attr.value)))
        el.removeAttribute(attr.name);
    }
  }
  for (const el of doc.querySelectorAll('style,[style]')) {
    const clean = value => value.replace(/url\(\s*['"]?\s*(?:https?:|\/\/)[^)]*\)/gi, 'url("")')
      .replace(/@import\s+[^;]+;?/gi, '');
    if (el.localName === 'style') el.textContent = clean(el.textContent);
    if (el.hasAttribute('style')) el.setAttribute('style', clean(el.getAttribute('style')));
  }
  return new XMLSerializer().serializeToString(doc);
}
