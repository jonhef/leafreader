import './style.css';
import * as store from './core/storage.js';
import { LIMITS, assertSize, clamp } from './core/limits.js';
import { fontInfo } from './core/font.js';
import { openText, plainMetadata } from './engines/text.js';
import { openRaster } from './engines/raster.js';
import { setupInbox } from './native.js';

const app = document.querySelector('#app');
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  leaf:'<path d="M19 4C10 3 3 7 5 14c2 7 13 5 14-10Z"/><path d="M4 21 14 10"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  book:'<path d="M4 4h12a3 3 0 0 1 3 3v14H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"/><path d="M3 17h16M7 4v13"/>',
  grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12M3 6h1M3 12h1M3 18h1"/>',
  back:'<path d="m14 6-6 6 6 6"/>',
  next:'<path d="m10 6 6 6-6 6"/>',
  mark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  check:'<path d="m5 12 4 4 10-10"/>',
  moon:'<path d="M19 15A8 8 0 0 1 9 5a8 8 0 1 0 10 10Z"/>',
};
const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (icons[name] || icons.book) + '</svg>';
const btn = (action, label, name, cls='icon-button') =>
  '<button class="'+cls+'" data-action="'+action+'" aria-label="'+escape(label)+'" title="'+escape(label)+'">'+icon(name)+(cls.includes('icon-button')?'':escape(label))+'</button>';

let books=[], fonts=[], active=null, reader=null, bookModel=null, raster=null, page=1, zoom=1;
let settings={ theme:'dark', size:20, line:1.6, margin:24, font:'', flow:'paginated', align:'start', columns:1, letter:0, word:0, paragraph:0.8, hyphens:'auto', customize:true, spread:1, rasterZoom:'1' };
let filter='', layout=localStorage.getItem('leaf-layout') || 'grid', sort='recent';
let generation=0, searchGeneration=0, busy=false, renderBusy=false, saveTimer, resizeTimer;
let lastLocation=null, fontURL=null, coverURLs=[], panelOpener=null;
const defaults={...settings};

app.innerHTML = '<div id="library"></div><section id="reader" hidden></section>' +
  '<dialog id="panel" aria-labelledby="panel-title"><div id="panel-content"></div></dialog>' +
  '<input id="book-input" type="file" accept=".fb2,.epub,.pdf,.djvu,.djv" multiple hidden>' +
  '<input id="font-input" type="file" accept=".ttf,.otf" multiple hidden>' +
  '<div id="toast" role="status" aria-live="polite"></div>';
const $ = s => document.querySelector(s);
const notify = message => { $('#toast').textContent=message; $('#toast').classList.add('visible'); clearTimeout(notify.timer); notify.timer=setTimeout(()=>$('#toast').classList.remove('visible'),4500); };
const fail = e => { console.error(e); notify(e.message || 'Не удалось выполнить действие.'); };
function offerUndo(message, restore){
  const notice=document.createElement('div');notice.className='undo-notice';notice.setAttribute('role','status');notice.textContent=message;
  const undo=document.createElement('button');undo.className='secondary';undo.textContent='Отменить удаление';undo.onclick=safe(async()=>{undo.disabled=true;await restore();notice.remove();notify('Восстановлено.');});notice.append(undo);
  $('#panel-content').append(notice);
}
const safe = fn => (...args) => Promise.resolve().then(()=>fn(...args)).catch(fail);
const sizeLabel = n => n < 1024*1024 ? Math.ceil(n/1024)+' КБ' : (n/1024/1024).toFixed(1)+' МБ';

function cover(book, large=false) {
  const colors=['pine','clay','blue','ochre','plum'];
  let content = '<span class="cover-format">'+escape(book.format.toUpperCase())+'</span><strong>'+escape(book.title)+'</strong><span>'+escape(book.author || 'Личная библиотека')+'</span><i></i>';
  if(book.cover) {
    const url=URL.createObjectURL(book.cover); coverURLs.push(url);
    content='<img src="'+url+'" alt="" loading="lazy">';
  }
  return '<div class="cover '+colors[parseInt(book.id.slice(0,2),16)%colors.length]+(large?' large':'')+'">'+content+'</div>';
}
function renderLibrary() {
  for(const url of coverURLs) URL.revokeObjectURL(url); coverURLs=[];
  const query=filter.toLocaleLowerCase();
  const filtered=books.filter(b=>(b.title+' '+b.author).toLocaleLowerCase().includes(query))
    .sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='author'?(a.author||'').localeCompare(b.author||''):(b.lastRead||b.added)-(a.lastRead||a.added));
  const recent=[...books].filter(b=>b.lastRead).sort((a,b)=>b.lastRead-a.lastRead)[0];
  $('#library').innerHTML='<aside class="sidebar"><a class="brand" href="#" aria-label="Leaf Reader">'+icon('leaf')+'<span>leaf<span class="brand-dot">.</span></span></a>'+
    '<div class="sidebar-caption">ВАШЕ МЕСТО ДЛЯ ЧТЕНИЯ</div><button class="nav-item selected" data-action="library">'+icon('book')+'Библиотека <span>'+books.length+'</span></button>'+
    '<button class="nav-item" data-action="fonts">'+icon('settings')+'Мои шрифты</button><div class="sidebar-bottom"><span class="offline-dot"></span> Книги остаются у вас<button data-action="about">О приложении</button></div></aside>'+
    '<main class="library-main"><header class="library-header"><div><div class="eyebrow">ЛИЧНАЯ КОЛЛЕКЦИЯ</div><h1>Библиотека</h1><p>Хорошая книга. Немного тишины.</p></div>'+
    btn('import','Добавить книгу','plus','primary')+'</header>'+
    (recent&&!filter?'<section class="continue"><div class="continue-copy"><div class="eyebrow">ПРОДОЛЖИТЬ ЧТЕНИЕ</div><h2>'+escape(recent.title)+'</h2><p>'+escape(recent.author||'Автор не указан')+'</p><div class="progress-track"><span style="width:'+Math.round((recent.progress||0)*100)+'%"></span></div><small>'+Math.round((recent.progress||0)*100)+'% прочитано</small><button class="read-button" data-open="'+recent.id+'">Вернуться к книге '+icon('next')+'</button></div>'+cover(recent,true)+'</section>':'')+
    '<div class="collection-toolbar"><h2>Все книги <span>'+books.length+'</span></h2><div class="library-controls"><label class="search-box">'+icon('search')+'<input id="library-search" type="search" placeholder="Название или автор" aria-label="Поиск в библиотеке" value="'+escape(filter)+'"></label>'+
    '<select id="sort" aria-label="Сортировка"><option value="recent">Недавние</option><option value="title">По названию</option><option value="author">По автору</option></select>'+
    btn('grid','Плитка','grid',layout==='grid'?'icon-button selected':'icon-button')+btn('list','Список','list',layout==='list'?'icon-button selected':'icon-button')+'</div></div>'+
    (filtered.length?'<div class="books '+layout+'">'+filtered.map(b=>'<article class="book-card"><button class="book-open" data-open="'+b.id+'">'+cover(b)+'<div class="book-copy"><h3>'+escape(b.title)+'</h3><p>'+escape(b.author||'Автор не указан')+'</p><small>'+b.format.toUpperCase()+' <span>·</span> '+sizeLabel(b.size)+'</small></div></button><button class="delete-book" data-delete="'+b.id+'" aria-label="Удалить '+escape(b.title)+'">'+icon('trash')+'</button></article>').join('')+'</div>':
    '<section class="empty"><div class="empty-symbol">'+icon('book')+'</div><h2>'+(filter?'Пока ничего не найдено':'Ваша следующая история — здесь')+'</h2><p>'+(filter?'Попробуйте другое название или имя автора.':'Добавьте свою первую книгу.<br>FB2, EPUB, PDF и DjVu — в одной библиотеке.')+'</p>'+(!filter?btn('import','Выбрать файл','plus','primary')+'<button class="text-button" data-action="demo">Открыть пробную книгу</button>':'')+'</section>')+
    '<footer class="library-footer">ВАШИ КНИГИ. ВАШ ШРИФТ. ВАШ РИТМ.<span>Leaf Reader · 0.1</span></footer></main>';
  $('#sort').value=sort;
  for(const mode of ['grid','list']) $('[data-action="'+mode+'"]').setAttribute('aria-pressed',String(layout===mode));
  $('.collection-toolbar').hidden=!books.length;
  $('#library-search').addEventListener('input',e=>{
    filter=e.target.value; const pos=e.target.selectionStart;
    renderLibrary(); $('#library-search').focus(); try{$('#library-search').setSelectionRange(pos,pos);}catch{}
  });
  $('#sort').addEventListener('change',e=>{sort=e.target.value;renderLibrary();});
}
async function refresh() { books=await store.all('books'); fonts=await store.all('fonts'); renderLibrary(); }
function panel(title,content) {
  searchGeneration++;
  $('#panel').classList.toggle('reader-panel',!!active);
  panelOpener=document.activeElement;
  $('#panel-content').innerHTML='<header class="panel-header"><h2 id="panel-title">'+escape(title)+'</h2>'+btn('close-panel','Закрыть','close')+'</header>'+content;
  if(active && ['Оглавление','Закладки'].includes(title)){
    const nav=document.createElement('nav');nav.className='panel-nav';nav.setAttribute('aria-label','Навигация по книге');
    nav.innerHTML=['Оглавление','Закладки'].map((label,i)=>'<button data-action="'+(i?'bookmarks':'toc')+'" aria-current="'+(title===label)+'">'+label+'</button>').join('');$('#panel-content .panel-header').after(nav);
  }
  if(!$('#panel').open) $('#panel').showModal();
}
function closePanel() {
  searchGeneration++; $('#panel').close();
  if(panelOpener?.isConnected) panelOpener.focus();
}
$('#panel').addEventListener('cancel',()=>{searchGeneration++;});
$('#panel').addEventListener('click',e=>{if(e.target===$('#panel'))closePanel();});

async function detect(file) {
  assertSize(file.size,LIMITS.file);
  const head = new TextDecoder().decode(await file.slice(0,1024).arrayBuffer());
  const ext=file.name.split('.').pop().toLowerCase();
  const signature=head.startsWith('%PDF-')?'pdf':head.startsWith('AT&TFORM')?'djvu':head.startsWith('PK')?'epub':
    /FictionBook/.test(head)||ext==='fb2'?'fb2':null;
  if(!signature || !({pdf:['pdf'],djvu:['djvu','djv'],epub:['epub'],fb2:['fb2']}[signature].includes(ext)))
    throw new Error('Формат и содержимое файла не совпадают. Нужен FB2, EPUB, PDF или DjVu.');
  return signature;
}
async function importBook(file, open=true) {
  const format=await detect(file), id=await store.fingerprint(file);
  const existing=await store.get('books',id);
  if(existing) { notify('Эта книга уже в библиотеке.'); if(open)await openBook(id);return; }
  let model,engine, metadata={};
  try {
    if(format==='fb2'||format==='epub') { model=await openText(file,format);metadata=model.metadata||{}; }
    else engine=await openRaster(file,format);
    let bookCover=null;
    if(model?.getCover) {
      const blob=await model.getCover();
      if(blob && blob.size<4*1024*1024) {
        try {
          const image=await createImageBitmap(blob,{resizeWidth:240,resizeQuality:'medium'});
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          canvas.getContext('2d').drawImage(image,0,0);image.close();
          bookCover=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.75));
        }catch{}
      }
    }
    const record={id,title:plainMetadata(metadata.title)||file.name.replace(/\.[^.]+$/,''),author:plainMetadata(metadata.author),
      format,size:file.size,filename:file.name,added:Date.now(),progress:0,bookmarks:[],cover:bookCover};
    await store.saveBook(record,file);
    await navigator.storage?.persist?.().catch(()=>false);
  } finally { model?.destroy?.();await engine?.close(); }
  await refresh();
  if(open) await openBook(id);
}
$('#book-input').addEventListener('change',safe(async e=>{
  if(busy)return;busy=true;notify('Добавляем книги…');
  const files=[...e.target.files];e.target.value='';
  try {
    let added=0; const errors=[];
    for(const file of files) { try{await importBook(file,files.length===1);added++;}catch(error){errors.push({name:file.name,message:error.message});} }
    notify('Добавлено: '+added+'. Не удалось: '+errors.length+'.');
    if(errors.length || files.length>1) panel('Результат импорта','<p>Добавлено: '+added+'. Не удалось: '+errors.length+'.</p>'+errors.map(e=>'<p><strong>'+escape(e.name)+'</strong><br>'+escape(e.message)+' Проверьте файл или выберите другую копию книги.</p>').join('')+btn('import','Выбрать другой файл','plus','primary'));
  }
  finally{busy=false;}
}));
async function closeBook() {
  generation++;searchGeneration++;clearTimeout(saveTimer);
  await flushPosition();
  reader?.close();reader?.remove();reader=null;bookModel?.destroy?.();bookModel=null;
  await raster?.close();raster=null;
  if(fontURL)URL.revokeObjectURL(fontURL);fontURL=null;
  active=null;lastLocation=null;renderBusy=false;
  $('#reader').hidden=true;$('#reader').replaceChildren();$('#library').hidden=false;
  closePanel();await refresh();
}
async function openBook(id) {
  if(active)await closeBook();
  const token=++generation;
  active=await store.get('books',id);
  const data=await store.get('files',id);
  if(!data?.file){active=null;throw new Error('Файл книги не найден. Импортируйте его заново.');}
  settings={...defaults,...(await store.get('settings','reading'))?.value,...active.settings};
  applyTheme();page=1;zoom=settings.rasterZoom==='fit-page'?'fit-page':Number(settings.rasterZoom||1);lastLocation=active.location||null;
  $('#library').hidden=true;$('#reader').hidden=false;$('#reader').classList.remove('quiet');
  $('#reader').innerHTML='<header class="reader-header">'+btn('back','В библиотеку','back')+'<div class="reader-title"><strong>'+escape(active.title)+'</strong><span>'+escape(active.author)+'</span></div><div class="reader-actions">'+
    btn('quiet','Скрыть панели чтения','book')+btn('toc','Оглавление','list')+btn('bookmarks','Закладки','mark')+btn('search','Поиск в книге','search')+btn('reading-settings','Настройки чтения','settings')+'</div></header>'+
    '<div id="reading-stage"><div class="loading">Открываем книгу…</div></div>'+
    '<footer class="reader-footer"><input class="reading-progress" id="reading-progress" type="range" min="0" max="100" step="0.1" value="0" aria-label="Позиция в книге">'+btn('prev','Предыдущая страница','back')+'<button id="location" data-action="goto" aria-label="Перейти к позиции">…</button>'+
    btn('add-bookmark','Добавить закладку','mark')+btn('next','Следующая страница','next')+'</footer>';
  try {
    if(active.format==='epub'||active.format==='fb2') {
      const loadedBook=await openText(data.file,active.format);
      if(token!==generation){loadedBook.destroy?.();return;}
      bookModel=loadedBook;
      reader=document.createElement('foliate-view');
      reader.setAttribute('aria-label','Текст книги');$('#reading-stage').replaceChildren(reader);
      reader.addEventListener('relocate',e=>{
        lastLocation={cfi:e.detail.cfi,fraction:clamp(e.detail.fraction??0,0,1)};
        $('#location').textContent=Math.round(lastLocation.fraction*100)+'% · '+(e.detail.tocItem?.label||'Чтение');
        $('#reading-progress').value=lastLocation.fraction*100;
        queueSave();
      });
      reader.addEventListener('external-link',e=>{e.preventDefault();notify('Внешние ссылки книги отключены.');});
      reader.addEventListener('load',e=>{
        e.detail.doc.addEventListener('keydown',handleKeys);
        e.detail.doc.addEventListener('click',event=>{
          if(event.target.closest('a'))return;
          if(!e.detail.doc.getSelection()?.toString())setQuiet(!$('#reader').classList.contains('quiet'));
        });
      });
      await reader.open(bookModel);
      await applyReadingSettings();
      await reader.init({lastLocation:active.location?.cfi,showTextStart:!active.location});
      $('[data-action="search"]').hidden=reader.isFixedLayout;
    } else {
      const loadedRaster=await openRaster(data.file,active.format);
      if(token!==generation){await loadedRaster.close();return;}
      raster=loadedRaster;
      $('#reading-stage').innerHTML='<div class="raster-scroll"><canvas id="page-canvas" aria-label="Страница документа"></canvas></div>';
      $('[data-action="search"]').hidden=true;
      page=clamp(active.location?.page||1,1,raster.count);
      await renderPage();
    }
    await store.updateBook(id,{lastRead:Date.now()});
  }catch(e){if(token===generation)await closeBook();throw e;}
}
document.addEventListener('change',safe(async e=>{
  if(e.target.id!=='reading-progress')return;
  const fraction=clamp(Number(e.target.value)/100,0,1);
  if(raster){page=1+Math.round(fraction*(raster.count-1));await renderPage();}
  else if(reader)await reader.goToFraction(fraction);
}));
let renderRequested=false;
async function renderPage() {
  if(!raster)return;
  if(renderBusy){renderRequested=true;return;}
  renderRequested=false;
  renderBusy=true;
  const engine=raster,token=generation;
  const canvas=$('#page-canvas');
  try{
    const spread=settings.spread===2&&page<engine.count;
    const container=canvas.parentElement;container.classList.toggle('two-pages',spread);
    const width=Math.max(100,($('#reading-stage').clientWidth-32-(spread?16:0))/(spread?2:1)),height=Math.max(100,$('#reading-stage').clientHeight-32);
    await engine.render(page,canvas,width,zoom,height);
    $('#second-page')?.remove();
    if(spread){const second=document.createElement('canvas');second.id='second-page';second.setAttribute('aria-label','Страница '+(page+1));container.append(second);await engine.render(page+1,second,width,zoom,height);}
    if(token!==generation)return;
    lastLocation={page,fraction:(page-1)/Math.max(1,engine.count-1)};
    $('#location').textContent=page+' / '+engine.count;
    canvas.setAttribute('aria-label','Страница '+page+' из '+engine.count+'. Изображение документа.');
    $('#reading-progress').value=lastLocation.fraction*100;
    queueSave();
  }finally{if(token===generation){renderBusy=false;if(renderRequested)await renderPage();}}
}
function queueSave() { clearTimeout(saveTimer);saveTimer=setTimeout(()=>flushPosition().catch(fail),500); }
async function flushPosition() {
  if(active&&lastLocation)await store.updateBook(active.id,{location:lastLocation,progress:lastLocation.fraction||0,lastRead:Date.now()});
}
function applyTheme() { document.documentElement.dataset.theme=settings.theme; document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); }
async function applyReadingSettings() {
  applyTheme();if(reader?.isFixedLayout){reader.renderer.setAttribute('zoom',settings.rasterZoom==='1'?'fit-width':settings.rasterZoom);return;}if(!reader)return;
  if(fontURL)URL.revokeObjectURL(fontURL);fontURL=null;
  const builtins={sans:'Arial, sans-serif',serif:'Georgia, serif',mono:'monospace'};
  const baseFamily=builtins[settings.font]||'Athelas,Georgia,serif';
  const font=settings.font && !builtins[settings.font] ? await store.get('fonts',settings.font) : null;
  if(font)fontURL=URL.createObjectURL(font.file);
  reader.renderer.setAttribute('flow',settings.flow);
  reader.renderer.setAttribute('margin','12px');
  reader.renderer.setAttribute('gap',String(settings.margin*2/Math.max(300,$('#reading-stage').clientWidth)*100)+'%');
  reader.renderer.setAttribute('max-inline-size','760px');
  reader.renderer.setAttribute('max-column-count',String(settings.flow==='scrolled'?1:(settings.columns||2)));
  const themeStyle=getComputedStyle(document.documentElement);
  const palette=[themeStyle.getPropertyValue('--paper').trim(),themeStyle.getPropertyValue('--ink').trim()];
  const bundledFaces=[["Regular",400,"normal"],["Italic",400,"italic"],["Bold",700,"normal"],["BoldItalic",700,"italic"]].map(([file,weight,style])=>'@font-face{font-family:Athelas;src:url("'+new URL(import.meta.env.BASE_URL+'fonts/athelas/Athelas-'+file+'.ttf',location.href).href+'");font-weight:'+weight+';font-style:'+style+';font-display:swap}').join('');
  if(!settings.customize){reader.renderer.setStyles('html,body{color:'+palette[1]+'!important;background:'+palette[0]+'!important}');return;}
  reader.renderer.setStyles(bundledFaces+(fontURL?'@font-face{font-family:LeafCustom;src:url("'+fontURL+'")}':'')+
    'html,body{color:'+palette[1]+'!important;background:'+palette[0]+'!important}'+
    'body{font-size:'+settings.size+'px!important;line-height:'+settings.line+'!important;font-family:'+(font?'LeafCustom,':'')+baseFamily+'!important}'+
    'p,li,blockquote{font-family:inherit!important;line-height:inherit!important;text-align:'+settings.align+'!important;letter-spacing:'+settings.letter+'em!important;word-spacing:'+settings.word+'em!important;hyphens:'+settings.hyphens+'!important}p{margin-block-start:0!important;margin-block-end:'+settings.paragraph+'em!important}img{max-width:100%!important}a{color:inherit}');
}
async function saveSettings() {
  if(active) { active.settings={...settings};await store.updateBook(active.id,{settings:{...settings}}); }
  else await store.put('settings',{id:'reading',value:{...settings}});
  await applyReadingSettings();
  await refreshSettingsPreview();
}
function spacingControl(key,label,min,max,step){return '<div><label for="'+key+'">'+label+'</label><output id="'+key+'-value" for="'+key+'">'+settings[key]+' em</output><input id="'+key+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+settings[key]+'"></div>';}
function readingSettings() {
  fontsFromReading=true;
  const fixed=!!raster||reader?.isFixedLayout;
  panel('Настроить чтение','<div class="settings-content"><fieldset class="settings-group"><legend>Оформление</legend><label>Тема<select id="theme"><option value="light">Светлое</option><option value="dark">Тёмное</option><option value="sepia">Розовая</option><option value="paper">Бумага</option><option value="warm">Сепия</option><option value="neutral">Нейтральная</option><option value="white-black">Контраст: белый на чёрном</option><option value="black-white">Контраст: чёрный на белом</option><option value="yellow-black">Контраст: жёлтый на чёрном</option><option value="black-yellow">Контраст: чёрный на жёлтом</option></select></label></fieldset>'+
  (fixed?'<p class="muted">Страницы сохраняют исходную вёрстку. Шрифт внутри PDF, DjVu и EPUB с фиксированной вёрсткой не меняется.</p>'+
    ('<label>Масштаб<select id="zoom"><option value="1">По ширине</option><option value="fit-page">Вся страница</option><option value="0.5">50% ширины</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select></label>'+(raster?'<label>Страницы<select id="spread"><option value="1">Одна страница</option><option value="2">Две страницы</option></select></label>':'')):
    '<fieldset class="settings-group"><legend>Текст</legend><label>Форматирование<select id="customize"><option value="true">Мои настройки</option><option value="false">Оформление издателя</option></select></label><label>Шрифт<select id="font"><option value="">Athelas</option>'+fonts.map(f=>'<option value="'+f.id+'">'+escape(f.family+' · '+f.style)+'</option>').join('')+'<option value="sans">Без засечек</option><option value="serif">Georgia</option><option value="mono">Моноширинный</option></select></label>'+
    '<button class="secondary" data-action="fonts">Добавить свой шрифт</button>'+
    '<label for="size">Размер текста <output id="size-value">'+settings.size+' px</output><input id="size" type="range" min="14" max="40" value="'+settings.size+'"></label>'+
    '</fieldset><fieldset class="settings-group"><legend>Расположение текста</legend><div><label for="line">Межстрочный интервал</label><output id="line-value" for="line"></output><input id="line" type="range" min="1" max="2.5" step="0.1" list="line-steps" aria-describedby="line-value"><datalist id="line-steps"><option value="1.0"></option><option value="1.1"></option><option value="1.2"></option><option value="1.3"></option><option value="1.4"></option><option value="1.5"></option><option value="1.6"></option><option value="1.7"></option><option value="1.8"></option><option value="1.9"></option><option value="2.0"></option><option value="2.1"></option><option value="2.2"></option><option value="2.3"></option><option value="2.4"></option><option value="2.5"></option></datalist><div class="range-ticks" aria-hidden="true"><span>1,0</span><span>1,5</span><span>2,0</span><span>2,5</span></div></div>'+
    '<label>Выравнивание<select id="align"><option value="start">По началу строки</option><option value="justify">По ширине</option><option value="center">По центру</option></select></label>'+
    '<label>Колонки<select id="columns"><option value="0">Автоматически</option><option value="1">Одна</option><option value="2">Две</option></select></label><p class="muted">При прокрутке используется одна колонка. На узком экране две колонки могут не поместиться.</p>'+
    '<label>Переносы слов<select id="hyphens"><option value="auto">Автоматически</option><option value="none">Отключены</option></select></label>'+
    spacingControl('letter','Интервал между буквами',0,0.3,0.01)+spacingControl('word','Интервал между словами',0,1,0.05)+spacingControl('paragraph','Интервал между абзацами',0,2,0.1)+
    '<label>Поля<select id="margin"><option value="12">Узкие</option><option value="24">Обычные</option><option value="40">Широкие</option></select></label>'+
    '<label>Режим<select id="flow"><option value="paginated">Листание</option><option value="scrolled">Прокрутка</option></select></label></fieldset>')+
  '<fieldset class="settings-group"><legend>Набор настроек</legend><button class="secondary" data-action="save-preset">Сохранить текущие настройки</button><button class="secondary" data-action="apply-preset">Применить сохранённые настройки</button><button class="text-button" data-action="clear-preset">Удалить сохранённый набор</button><p class="muted">Набор можно применить к другой книге. Настройки каждой книги сохраняются отдельно.</p></fieldset><p id="reading-preview" class="font-preview">Тихий вечер. Хорошая книга. Ещё одна страница.</p><button class="text-button" data-action="reset-settings">Сбросить настройки книги</button></div>');
  const lineSlider=$('#line');
  if(lineSlider){
    lineSlider.value=clamp(settings.line,1,2.5);
    const showLine=()=>{const value=Number(lineSlider.value),label=value.toFixed(1).replace('.',',');$('#line-value').textContent=label;lineSlider.setAttribute('aria-valuetext',label);if($('#reading-preview'))$('#reading-preview').style.lineHeight=value;};
    showLine();lineSlider.addEventListener('input',showLine);
    lineSlider.addEventListener('change',safe(async()=>{settings.line=Number(lineSlider.value);showLine();await saveSettings();}));
  }
  for(const key of ['theme','font','margin','flow','zoom','align','columns','hyphens','letter','word','paragraph','customize','spread']){
    const el=$('#'+key);if(!el)continue;el.value=String(key==='zoom'?(raster?zoom:settings.rasterZoom):settings[key]);
    if(['letter','word','paragraph'].includes(key))el.addEventListener('input',()=>{$('#'+key+'-value').textContent=el.value+' em';const preview=$('#reading-preview');if(preview){if(key==='letter')preview.style.letterSpacing=el.value+'em';if(key==='word')preview.style.wordSpacing=el.value+'em';}});
    el.addEventListener('change',safe(async e=>{
      if(key==='zoom'){zoom=e.target.value==='fit-page'?'fit-page':Number(e.target.value);settings.rasterZoom=e.target.value;await saveSettings();if(raster)await renderPage();}
      else {settings[key]=key==='customize'?e.target.value==='true':['line','margin','columns','letter','word','paragraph','spread'].includes(key)?Number(e.target.value):e.target.value;await saveSettings();if(key==='customize'||key==='flow')readingSettings();if(key==='spread'&&raster)await renderPage();}
    }));
  }
  for(const id of ['font','size','line','align','letter','word','paragraph','hyphens'])if($('#'+id))$('#'+id).disabled=!settings.customize;
  $('#columns')?.toggleAttribute('disabled',settings.flow==='scrolled');
  void refreshSettingsPreview();
  $('#size')?.addEventListener('change',safe(async e=>{settings.size=Number(e.target.value);$('#size-value').textContent=settings.size+' px';await saveSettings();}));
}
let fontsFromReading=false;
const previewFaces=new Map();
async function fontFamily(id){
  const builtins={sans:'Arial, sans-serif',serif:'Georgia, serif',mono:'monospace'};if(builtins[id])return builtins[id];
  if(!id)return 'Athelas, Georgia, serif';
  if(!previewFaces.has(id)){
    const f=await store.get('fonts',id);if(!f)return 'Athelas, Georgia, serif';
    const name='LeafPreview'+id.replace(/[^a-z0-9]/gi,'');
    const face=new FontFace(name,await f.file.arrayBuffer());await face.load();document.fonts.add(face);previewFaces.set(id,face);
  }
  return previewFaces.get(id).family;
}
async function refreshSettingsPreview(){
  const el=$('#reading-preview');if(!el)return;
  el.style.fontFamily=await fontFamily(settings.font);el.style.fontSize=settings.size+'px';el.style.lineHeight=settings.line;el.style.textAlign=settings.align;el.style.letterSpacing=settings.letter+'em';el.style.wordSpacing=settings.word+'em';el.style.hyphens=settings.hyphens;
}
function fontsPanel() {
  panel('Мои шрифты','<p class="muted">TTF и OTF, до 12 МБ. Шрифты хранятся только в приложении и применяются к FB2 и EPUB с изменяемой вёрсткой.</p>'+
    (fontsFromReading?'<button class="secondary" data-action="reading-settings">Вернуться к настройкам</button>':'')+btn('import-font','Добавить шрифт','plus','primary')+
    '<div class="font-list">'+(fonts.length?fonts.map(f=>'<div class="font-row"><div><strong>'+escape(f.family)+'</strong><small>'+escape(f.style==='Regular'?'Обычное':f.style)+' · '+sizeLabel(f.size)+'</small><p class="font-sample" data-font-sample="'+f.id+'">Съешь ещё этих мягких французских булок.</p>'+(active && reader && !reader.isFixedLayout?'<button class="secondary" data-apply-font="'+f.id+'">Применить к этой книге</button>':'')+'</div><button data-delete-font="'+f.id+'" class="icon-button" aria-label="Удалить '+escape(f.family)+'">'+icon('trash')+'</button></div>').join(''):'<p class="muted">Ваши шрифты появятся здесь.</p>')+'</div>'+
    '');
  for(const el of allElements('[data-font-sample]')) fontFamily(el.dataset.fontSample).then(name=>el.style.fontFamily=name).catch(fail);
}
$('#font-input').addEventListener('change',safe(async e=>{
  const files=[...e.target.files];e.target.value='';
  for(const file of files){
    try{
      assertSize(file.size,LIMITS.font,'Шрифт');
      const buffer=await file.arrayBuffer(), info=fontInfo(buffer), id=await store.fingerprint(file);
      if(await store.get('fonts',id)){notify('Шрифт уже добавлен.');continue;}
      const face=new FontFace('LeafCheck',buffer);await face.load();
      await store.put('fonts',{id,...info,file});notify('Шрифт добавлен: '+info.family);
    }catch(error){fail(error);}
  }
  fonts=await store.all('fonts');fontsPanel();
}));
function tocHTML(items,depth=0){
  return (items||[]).map(item=>'<button class="toc-item" style="padding-left:'+(16+depth*16)+'px" '+(item.page?'data-page="'+item.page+'"':'data-href="'+escape(item.href)+'"')+'>'+escape(item.label||'Раздел')+'</button>'+tocHTML(item.subitems,depth+1)).join('');
}
async function bookmarkPanel() {
  active=await store.get('books',active.id);
  panel('Закладки',btn('add-bookmark','Запомнить это место','plus','primary')+
    '<div class="toc-list">'+(active.bookmarks.length?active.bookmarks.map((b,i)=>'<div class="bookmark-row"><button class="toc-item" data-bookmark="'+i+'">'+escape(b.label)+'<small>'+new Date(b.date).toLocaleDateString('ru-RU')+'</small></button><button class="icon-button" data-delete-bookmark="'+i+'" aria-label="Удалить закладку">'+icon('trash')+'</button></div>').join(''):'<p class="muted">Отметьте место, к которому хотите вернуться.</p>')+'</div>');
}
async function addBookmark() {
  if(!lastLocation)return;
  active=await store.get('books',active.id);
  if(active.bookmarks.some(b=>JSON.stringify(b.location)===JSON.stringify(lastLocation))){notify('Закладка уже есть.');return;}
  active.bookmarks.push({location:{...lastLocation},label:$('#location').textContent,date:Date.now()});
  await store.updateBook(active.id,{bookmarks:active.bookmarks});notify('Закладка добавлена.');
  if($('#panel').open)await bookmarkPanel();
}
function searchPanel() {
  panel('Поиск в книге','<form id="search-form" class="book-search"><input id="book-query" type="search" placeholder="Слово или фраза" aria-label="Текст для поиска" required><button class="primary" type="submit">Найти</button></form><p id="search-status" class="muted" role="status">Поиск по всей книге. До 200 совпадений.</p><div id="search-results"></div>');
  $('#search-form').addEventListener('submit',safe(async e=>{
    e.preventDefault();const token=++searchGeneration;const view=reader;
    const query=$('#book-query').value.trim();if(!query)return;
    $('#search-results').replaceChildren();$('#search-status').textContent='Ищем…';
    let count=0;
    for await(const result of view.search({query,matchCase:false})){
      if(token!==searchGeneration||view!==reader)break;
      for(const match of result.subitems||[]){
        const button=document.createElement('button');button.className='toc-item search-result';
        button.dataset.href=match.cfi;
        button.textContent=typeof match.excerpt==='string'?match.excerpt:Object.values(match.excerpt||{}).join('');
        $('#search-results').append(button);count++;if(count>=LIMITS.search)break;
      }
      $('#search-status').textContent='Найдено: '+count;
      if(count>=LIMITS.search)break;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(token===searchGeneration)$('#search-status').textContent=count?'Найдено: '+count:'Совпадений нет.';
  }));
}
async function move(delta){
  if(raster){if(renderBusy)return;page=clamp(page+delta,1,raster.count);await renderPage();}
  else if(reader)await (delta<0?reader.prev():reader.next());
}
function setQuiet(value){
  $('#reader').classList.toggle('quiet',value);
  for(const el of allElements('#reader .reader-header,#reader .reader-footer')) el.inert=value;
  let exit=$('#exit-quiet');
  if(!exit){exit=document.createElement('button');exit.id='exit-quiet';exit.textContent='Показать панели';exit.onclick=()=>setQuiet(false);$('#reader').append(exit);}
  exit.hidden=!value;
  if(value)exit.focus();else $('[data-action="quiet"]')?.focus();
}
function allElements(selector){return document.querySelectorAll(selector)}
function handleKeys(e){
  if((e.ctrlKey||e.metaKey)&&!e.altKey){
    if(e.key.toLowerCase()==='s'&&active){e.preventDefault();readingSettings();return;}
    if(e.key.toLowerCase()==='f'){if(!active){e.preventDefault();$('#library-search')?.focus();return;}if(reader&&!reader.isFixedLayout){e.preventDefault();searchPanel();return;}}
  }
  if(!active||$('#panel').open||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();safe(()=>move(e.key==='ArrowLeft'?-1:1))();}
  if(e.key==='Escape')setQuiet(false);
}
document.addEventListener('keydown',handleKeys);
window.leafHandleBack=()=>{
  if($('#panel').open){closePanel();return true;}
  if(active){safe(closeBook)();return true;}
  return false;
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushPosition().catch(fail);});
window.addEventListener('pagehide',()=>{void flushPosition();});
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(raster)safe(renderPage)();},150);});

document.addEventListener('click',safe(async e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.open){await openBook(button.dataset.open);return;}
  if(button.dataset.delete){
    const book=books.find(b=>b.id===button.dataset.delete);
    panel('Удалить книгу?','<p>«'+escape(book.title)+'» и её закладки будут удалены из приложения. Исходный файл останется на месте.</p><button class="danger" data-confirm-delete="'+book.id+'">Удалить книгу</button>');return;
  }
  if(button.dataset.confirmDelete){await store.deleteBook(button.dataset.confirmDelete);closePanel();await refresh();return;}
  if(button.dataset.applyFont){settings.font=button.dataset.applyFont;await saveSettings();readingSettings();return;}
  if(button.dataset.deleteFont){
    if(!window.confirm('Удалить шрифт? Его можно будет добавить заново.'))return;
    const id=button.dataset.deleteFont;
    const removedFont=await store.get('fonts',id), previousBooks=await store.all('books');
    await store.remove('fonts',id);if(previewFaces.has(id)){document.fonts.delete(previewFaces.get(id));previewFaces.delete(id);}fonts=await store.all('fonts');
    for(const b of books)if(b.settings?.font===id)await store.updateBook(b.id,{settings:{...b.settings,font:''}});
    if(settings.font===id){settings.font='';await saveSettings();}
    fontsPanel();offerUndo('Шрифт удалён.',async()=>{
      await store.put('fonts',removedFont);
      for(const book of previousBooks)if(book.settings?.font===id && await store.get('books',book.id))await store.updateBook(book.id,{settings:book.settings});
      fonts=await store.all('fonts');if(active){active=await store.get('books',active.id);settings={...settings,...active.settings};await applyReadingSettings();}fontsPanel();
    });return;
  }
  if(button.dataset.href!==undefined){await reader.goTo(button.dataset.href);closePanel();return;}
  if(button.dataset.page){page=clamp(button.dataset.page,1,raster.count);await renderPage();closePanel();return;}
  if(button.dataset.bookmark!==undefined){
    const loc=active.bookmarks[Number(button.dataset.bookmark)].location;
    if(raster){page=loc.page;await renderPage();}else await reader.goTo(loc.cfi);
    closePanel();return;
  }
  if(button.dataset.deleteBookmark!==undefined){
    if(!window.confirm('Удалить закладку?'))return;
    const removedIndex=Number(button.dataset.deleteBookmark), removedBookmark=active.bookmarks[removedIndex], bookmarkBookId=active.id;
    active.bookmarks.splice(removedIndex,1);
    await store.updateBook(active.id,{bookmarks:active.bookmarks});await bookmarkPanel();
    offerUndo('Закладка удалена.',async()=>{const book=await store.get('books',bookmarkBookId);if(!book)return;book.bookmarks.splice(Math.min(removedIndex,book.bookmarks.length),0,removedBookmark);await store.updateBook(book.id,{bookmarks:book.bookmarks});if(active?.id===book.id)await bookmarkPanel();});return;
  }
  switch(button.dataset.action){
    case 'quiet':setQuiet(true);break;
    case 'import':$('#book-input').click();break;
    case 'import-font':$('#font-input').click();break;
    case 'demo':await importBook(new File([demoBook()],'Тихие страницы.fb2',{type:'application/xml'}));break;
    case 'grid':case 'list':layout=button.dataset.action;localStorage.setItem('leaf-layout',layout);renderLibrary();break;
    case 'library':filter='';renderLibrary();break;
    case 'back':await closeBook();break;
    case 'prev':await move(-1);break;
    case 'next':await move(1);break;
    case 'close-panel':closePanel();break;
    case 'fonts':fontsFromReading=!!active;fontsPanel();break;
    case 'reading-settings':readingSettings();break;
    case 'save-preset':await store.put('settings',{id:'reading-preset',value:{...settings}});notify('Набор настроек сохранён.');break;
    case 'apply-preset':{const preset=await store.get('settings','reading-preset');if(!preset){notify('Сначала сохраните набор настроек.');break;}settings={...defaults,...preset.value};if(settings.font && !['sans','serif','mono'].includes(settings.font) && !await store.get('fonts',settings.font))settings.font='';await saveSettings();readingSettings();notify('Набор применён к этой книге.');break;}
    case 'clear-preset':await store.remove('settings','reading-preset');notify('Сохранённый набор удалён.');break;
    case 'reset-settings':settings={...defaults};await saveSettings();readingSettings();break;
    case 'toc':panel('Оглавление','<div class="toc-list">'+(tocHTML(bookModel?.toc||raster?.toc)||'<p class="muted">В этой книге нет оглавления.</p>')+'</div>');break;
    case 'bookmarks':await bookmarkPanel();break;
    case 'add-bookmark':await addBookmark();break;
    case 'search':searchPanel();break;
    case 'goto':
      panel('Перейти к позиции','<form id="goto-form"><label>'+(raster?'Страница от 1 до '+raster.count:'Прогресс от 0 до 100%')+'<input id="goto-value" type="number" min="'+(raster?1:0)+'" max="'+(raster?raster.count:100)+'" value="'+(raster?page:Math.round((lastLocation?.fraction||0)*100))+'" required></label><button class="primary" type="submit">Перейти</button></form>');
      $('#goto-form').addEventListener('submit',safe(async e=>{e.preventDefault();if(raster){page=clamp($('#goto-value').value,1,raster.count);await renderPage();}else await reader.goToFraction(clamp($('#goto-value').value/100,0,1));closePanel();}));break;
    case 'about':
      panel('Leaf Reader','<p>Личная библиотека, которая всегда рядом. Версия 0.1.0.</p><p>Книги и шрифты хранятся локально. Нет аккаунтов, рекламы и отправки содержимого книг.</p><p class="muted">Сохраняйте исходники книг: удаление приложения или данных браузера удалит локальную библиотеку.</p><p>Собственный код — MIT. EPUB/FB2 — Foliate (MIT), PDF — PDF.js (Apache-2.0), DjVu — DjVu.js (GPL-2.0-or-later). Полная сборка распространяется на условиях GPL-3.0; исходники и уведомления должны сопровождать её.</p><a href="./licenses/NOTICE.txt" target="_blank" rel="noopener">Лицензии компонентов</a>');break;
  }
}));

function demoBook(){
  const paragraphs=['Утро начинается с тихого света. На столе лежит раскрытая книга, и впереди есть несколько минут, которые можно оставить только себе.',
    'Читать можно в дороге, дома у окна или в небольшом кафе. Главное — найти свой ритм. Текст не торопит: к любимой строке всегда можно вернуться.',
    'Эта пробная книга создана для Leaf Reader. Попробуйте поменять шрифт, добавить закладку и открыть оглавление. Ваше место сохранится автоматически.'];
  return '<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><genre>prose</genre><author><first-name>Leaf</first-name><last-name>Reader</last-name></author><book-title>Тихие страницы</book-title><lang>ru</lang></title-info></description><body>'+
    ['Немного тишины','Свой ритм','Место для нового'].map((title,i)=>'<section id="chapter'+i+'"><title><p>'+title+'</p></title>'+Array.from({length:14},(_,j)=>'<p>'+paragraphs[(i+j)%3]+'</p>').join('')+'</section>').join('')+'</body></FictionBook>';
}
async function start(){
  await store.cleanOrphanChunks();
  defaults.theme=(await store.get('settings','reading'))?.value?.theme||'dark';
  settings={...defaults,...(await store.get('settings','reading'))?.value};
  applyTheme();await refresh();setupInbox(importBook,fail);
}
start().catch(fail);
