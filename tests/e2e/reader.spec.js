import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const fixture = name => resolve('tests/fixtures/generated', name);
async function importFixture(page, name) {
  await page.locator('#book-input').setInputFiles(fixture(name));
  await expect(page.locator('#reader')).toBeVisible({timeout:20000});
  await expect(page.locator('#location')).not.toHaveText('…',{timeout:20000});
}

test('FB2 demo: read, navigate, font settings, bookmark and resume',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button',{name:'Открыть пробную книгу'}).click();
  await expect(page.locator('foliate-view')).toBeVisible();
  await expect(page.locator('#location')).not.toHaveText('…');
  await page.getByRole('button',{name:'Следующая страница',exact:true}).click();
  await page.getByRole('button',{name:'Добавить закладку',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('Закладка добавлена');
  await page.getByRole('button',{name:'Настройки чтения'}).click();
  await page.locator('#theme').selectOption('sepia');
  await expect(page.locator('html')).toHaveAttribute('data-theme','sepia');
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.getByRole('button',{name:'В библиотеку'}).click();
  await expect(page.getByRole('heading',{name:'Библиотека',exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:/Вернуться к книге/}).click();
  await expect(page.locator('foliate-view')).toBeVisible();
  await page.getByRole('button',{name:'Закладки',exact:true}).click();
  await expect(page.locator('[data-bookmark]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('mobile layout stays inside viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.getByRole('heading',{name:'Библиотека',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'outputs/leaf-library-mobile.png',fullPage:true});
});

for (const [name, count] of [['sample.pdf',2],['sample.djvu',2],['single.djvu',1]]) {
  test(name+' renders actual pixels, turns pages and resumes', async({page})=>{
    await page.goto('/'); await importFixture(page,name);
    await expect(page.locator('#location')).toHaveText('1 / '+count);
    expect(await page.locator('canvas').evaluate(c=>{
      const bytes=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      return bytes.some((v,i)=>i%4===0&&v<200);
    })).toBeTruthy();
    if(count>1){
      await page.getByRole('button',{name:'Следующая страница',exact:true}).click();
      await expect(page.locator('#location')).toHaveText('2 / 2');
    }
    await page.getByRole('button',{name:'В библиотеку'}).click();
    await expect(page.getByRole('heading',{name:'Библиотека',exact:true})).toBeVisible();
    await page.reload();await page.getByRole('button',{name:/Вернуться к книге/}).click();
    await expect(page.locator('#location')).toHaveText(count+' / '+count);
  });
}
test('EPUB search, contents, duplicate detection and deletion',async({page})=>{
  await page.goto('/');await importFixture(page,'Линии берега.epub');
  await page.getByRole('button',{name:'Оглавление',exact:true}).click();
  await page.getByRole('button',{name:'Вторая глава',exact:true}).click();
  await expect(page.locator('#location')).toContainText('Вторая глава');
  await page.getByRole('button',{name:'Поиск в книге',exact:true}).click();
  await page.locator('#book-query').fill('Уникальноеслово');
  await page.getByRole('button',{name:'Найти',exact:true}).click();
  await expect(page.locator('.search-result').first()).toBeVisible();
  await page.locator('.search-result').first().click();
  await page.getByRole('button',{name:'В библиотеку'}).click();
  await importFixture(page,'Линии берега.epub');
  await page.getByRole('button',{name:'В библиотеку'}).click();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await page.locator('[data-delete]').click();
  await page.getByRole('button',{name:'Удалить книгу',exact:true}).click();
  await expect(page.locator('.book-card')).toHaveCount(0);
});
test('fixed layout EPUB keeps pages and disables text controls',async({page})=>{
  await page.goto('/');await importFixture(page,'Атлас.epub');
  await page.getByRole('button',{name:'Настройки чтения'}).click();
  await expect(page.getByText(/Страницы сохраняют исходную вёрстку/)).toBeVisible();
  await expect(page.locator('#font')).toHaveCount(0);
});
test('TTF and OTF import, apply, persist and delete safely',async({page})=>{
  await page.goto('/');
  await page.locator('#font-input').setInputFiles([
    resolve('tests/fixtures/fonts/SourceSerif4-Regular.ttf'),
    resolve('tests/fixtures/fonts/SourceSerif4-Regular.otf'),
  ]);
  await expect(page.locator('.font-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.getByRole('button',{name:'Открыть пробную книгу'}).click();
  await expect(page.locator('#location')).not.toHaveText('…');
  await page.getByRole('button',{name:'Настройки чтения'}).click();
  const value=await page.locator('#font option').nth(1).getAttribute('value');
  await page.locator('#font').selectOption(value);
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>{
    const view=document.querySelector('foliate-view');
    const doc=view.renderer.getContents()[0]?.doc;
    return doc?.fonts.check('20px LeafCustom');
  })).toBeTruthy();
  await page.getByRole('button',{name:'В библиотеку'}).click();
  await page.reload();await page.getByRole('button',{name:/Вернуться к книге/}).click();
  await expect(page.locator('#location')).not.toHaveText('…');
  await page.getByRole('button',{name:'Настройки чтения'}).click();
  await expect(page.locator('#font')).toHaveValue(value);
  await page.getByRole('button',{name:'Добавить свой шрифт',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-delete-font]').first().click();
  await expect(page.locator('.font-row')).toHaveCount(1);
  await page.getByRole('button',{name:'Отменить удаление'}).click();
  await expect(page.locator('.font-row')).toHaveCount(2);
});
test('malicious EPUB cannot run scripts or request external resources',async({page})=>{
  const external=[];page.on('request',r=>{if(r.url().startsWith('https://invalid.example'))external.push(r.url());});
  await page.goto('/');await importFixture(page,'Unsafe.epub');
  expect(await page.evaluate(()=>window.__bookExecuted)).toBeUndefined();
  expect(external).toEqual([]);
});
test('invalid files fail without leaving a library record',async({page})=>{
  await page.goto('/');
  await page.locator('#book-input').setInputFiles({name:'bad.fb2',mimeType:'application/xml',buffer:Buffer.from('<FictionBook>bad')});
  await expect(page.getByRole('dialog')).toContainText('Повреждённый FB2');
  await expect(page.getByRole('dialog')).toContainText('bad.fb2');
  await expect(page.locator('.book-card')).toHaveCount(0);
});

test('Windows-1251 FB2 keeps Cyrillic including Yo',async({page})=>{
  await page.goto('/');await importFixture(page,'legacy.fb2');
  await expect(page.locator('.reader-title strong')).toHaveText('Зимняя история');
  const text=await page.evaluate(()=>document.querySelector('foliate-view').renderer.getContents()[0].doc.body.textContent);
  expect(text).toContain('Ёлка, снег и тихая зима.');
});

test('EPUB is read across persisted chunk boundaries after restart',async({page})=>{
  await page.goto('/');await importFixture(page,'Large.epub');
  await page.getByRole('button',{name:'В библиотеку'}).click();
  await expect(page.getByRole('heading',{name:'Библиотека',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:/Вернуться к книге/}).click();
  await expect(page.locator('#location')).not.toHaveText('…');
  await page.getByRole('button',{name:'Оглавление',exact:true}).click();
  await page.getByRole('button',{name:'Вторая глава',exact:true}).click();
  await expect(page.locator('#location')).toContainText('Вторая глава');
});
