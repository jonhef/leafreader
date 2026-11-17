import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
test('reading typography, preset and persistence',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Открыть пробную книгу'}).click();await expect(page.locator('#location')).not.toHaveText('…');
 await page.getByRole('button',{name:'Настройки чтения'}).click();
 const line=page.getByRole('slider',{name:'Межстрочный интервал',exact:true});
 await expect(line).toHaveAttribute('min','1');await expect(line).toHaveAttribute('max','2.5');await expect(line).toHaveAttribute('step','0.1');
 for(const value of ['1','1.1','2.5']){await line.fill(value);await line.dispatchEvent('change');await expect(page.locator('#line-value')).toHaveText(Number(value).toFixed(1).replace('.',','));}
 await page.locator('#align').selectOption('justify');await page.locator('#columns').selectOption('2');
 await page.locator('#letter').fill('0.12');await page.locator('#letter').dispatchEvent('change');
 await page.getByRole('button',{name:'Сохранить текущие настройки',exact:true}).click();
 await expect(page.locator('#toast')).toContainText('сохранён');
 await page.getByRole('button',{name:'Сбросить настройки книги'}).click();await expect(page.locator('#line')).toHaveValue('1.6');
 await page.getByRole('button',{name:'Применить сохранённые настройки'}).click();await expect(page.locator('#line')).toHaveValue('2.5');
 await expect(page.locator('#letter')).toHaveValue('0.12');
 await page.locator('#customize').selectOption('false');await expect(page.locator('#line')).toBeDisabled();
 await page.locator('#customize').selectOption('true');await expect(page.locator('#line')).toBeEnabled();
 await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>{const doc=document.querySelector('foliate-view').renderer.getContents()[0].doc;return getComputedStyle(doc.querySelector('p')).textAlign;})).toBe('justify');
 await page.getByRole('button',{name:'В библиотеку'}).click();await page.reload();await page.getByRole('button',{name:/Вернуться к книге/}).click();await expect(page.locator('#location')).not.toHaveText('…');
 await page.getByRole('button',{name:'Настройки чтения'}).click();await expect(page.locator('#line')).toHaveValue('2.5');await expect(page.locator('#columns')).toHaveValue('2');
});
for(const file of ['sample.pdf','sample.djvu'])test(file+' page fit and spread',async({page})=>{
 await page.setViewportSize({width:1000,height:650});await page.goto('/');await page.locator('#book-input').setInputFiles(resolve('tests/fixtures/generated',file));await expect(page.locator('#location')).not.toHaveText('…');
 await page.getByRole('button',{name:'Настройки чтения'}).click();await expect(page.locator('#line')).toHaveCount(0);
 await page.locator('#zoom').selectOption('fit-page');await page.locator('#spread').selectOption('2');await page.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(page.locator('#second-page')).toBeVisible();
 await expect.poll(async()=>{const canvas=await page.locator('#page-canvas').boundingBox(),stage=await page.locator('#reading-stage').boundingBox();return canvas.height<=stage.height;}).toBeTruthy();
});
