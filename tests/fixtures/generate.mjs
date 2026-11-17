import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'vite';
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader, TextReader } from '@zip.js/zip.js';
const dir='tests/fixtures/generated';
await mkdir(dir,{recursive:true});
await build({configFile:false,logLevel:'warn',build:{
  outDir:'work/fixture-tools',emptyOutDir:true,
  lib:{entry:'tests/fixtures/djvu-encoder.js',formats:['es'],fileName:()=> 'encoder.mjs'},
}});
globalThis.self = globalThis;
const {generate}=await import(pathToFileURL(resolve('work/fixture-tools/encoder.mjs')));
const djvu=generate();
await writeFile(dir+'/sample.djvu',new Uint8Array(djvu.multi));
await writeFile(dir+'/single.djvu',new Uint8Array(djvu.single));

async function epub(name,{fixed=false,malicious=false,large=false}={}){
  const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});
  const add=(name,text)=>writer.add(name,new TextReader(text));
  await add('mimetype','application/epub+zip');
  if(large) await writer.add('padding.bin',new Uint8ArrayReader(new Uint8Array(2*1024*1024+17)),{level:0});
  await add('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  await add('OEBPS/content.opf','<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">leaf-fixture-'+name+'</dc:identifier><dc:title>'+name+'</dc:title><dc:creator>Leaf Studio</dc:creator><dc:language>ru</dc:language><meta property="dcterms:modified">2026-11-16T00:00:00Z</meta>'+(fixed?'<meta property="rendition:layout">pre-paginated</meta>':'')+'</metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>');
  await add('OEBPS/nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Содержание</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">Первая глава</a></li><li><a href="two.xhtml">Вторая глава</a></li></ol></nav></body></html>');
  for(const [file,title]of [['one','Первая глава'],['two','Вторая глава']]){
    const attack=malicious?'<script>parent.__bookExecuted=true</script><img src="https://invalid.example/track" onerror="parent.__bookExecuted=true"/><iframe src="https://invalid.example/frame"></iframe>':'';
    await add('OEBPS/'+file+'.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+title+'</title>'+(fixed?'<meta name="viewport" content="width=600,height=800"/>':'')+'</head><body><h1>'+title+'</h1>'+attack+Array.from({length:fixed?2:25},(_,i)=>'<p id="p'+i+'">Тихий берег. Время читать и возвращаться к любимой книге. Уникальноеслово '+i+'.</p>').join('')+'</body></html>');
  }
  await writeFile(dir+'/'+name+'.epub',await writer.close());
}
await epub('Линии берега');await epub('Атлас',{fixed:true});await epub('Unsafe',{malicious:true});
await epub('Large',{large:true});
const legacy='<?xml version="1.0" encoding="windows-1251"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>Зимняя история</book-title><lang>ru</lang></title-info></description><body><section><title><p>Первая глава</p></title><p>Ёлка, снег и тихая зима.</p></section></body></FictionBook>';
await writeFile(dir+'/legacy.fb2',Buffer.from([...legacy].map(c=>{
  const n=c.charCodeAt(0);
  return n<128?n:n===1025?168:n===1105?184:n>=1040&&n<=1103?n-848:63;
})));
const objects=[
'<< /Type /Catalog /Pages 2 0 R >>',
'<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
'STREAM:BT /F1 28 Tf 35 530 Td (Leaf Reader - Page One) Tj ET\n0.2 0.4 0.3 rg 35 100 330 350 re f',
'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
'STREAM:BT /F1 28 Tf 35 530 Td (Leaf Reader - Page Two) Tj ET\n0.6 0.3 0.2 rg 35 100 330 350 re f',
'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf='%PDF-1.4\n',offsets=[0];
objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));if(object.startsWith('STREAM:')){const data=object.slice(7);object='<< /Length '+Buffer.byteLength(data)+' >>\nstream\n'+data+'\nendstream';}pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
const xref=Buffer.byteLength(pdf);
pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('');
pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
await writeFile(dir+'/sample.pdf',pdf);
console.log('Generated synthetic EPUB, PDF and single/multipage DjVu fixtures.');
