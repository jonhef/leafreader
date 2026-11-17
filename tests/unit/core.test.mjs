import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArchive, LIMITS, fitPixels } from '../../src/core/limits.js';
import { fontInfo } from '../../src/core/font.js';
import { checkXML } from '../../src/core/security.js';
import { fingerprint } from '../../src/core/storage.js';

test('archive rejects traversal, duplicates, encrypted entries and oversized expansion',()=>{
  const entry={filename:'chapter.xhtml',uncompressedSize:100};
  validateArchive([entry]);
  for(const filename of ['../private','/abs','C:/drive','safe/../../file','a\\b']){
    assert.throws(()=>validateArchive([{...entry,filename}]));
  }
  assert.throws(()=>validateArchive([entry,entry]));
  assert.throws(()=>validateArchive([{...entry,encrypted:true}]));
  assert.throws(()=>validateArchive([{...entry,uncompressedSize:LIMITS.entry+1}]));
  assert.throws(()=>validateArchive(Array.from({length:20},(_,i)=>({...entry,filename:String(i),uncompressedSize:LIMITS.entry}))));
});
test('XML entity declarations are rejected',()=>{
  assert.throws(()=>checkXML('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x/>'));
  checkXML('<!DOCTYPE html><html/>');
});
test('font validator rejects malformed and truncated fonts',()=>{
  assert.throws(()=>fontInfo(new ArrayBuffer(4)));
  const v=new DataView(new ArrayBuffer(28));v.setUint32(0,0x10000);v.setUint16(4,1);
  v.setUint32(12,0x6e616d65);v.setUint32(20,100);v.setUint32(24,10);
  assert.throws(()=>fontInfo(v.buffer));
});
test('render scale caps pixel allocation',()=>{
  assert.ok(fitPixels(10000,10000,2)**2 * 10000**2 <= LIMITS.pixels);
  assert.throws(()=>fitPixels(0,10));
});
test('content identity is independent of filename and differs on a changed byte',async()=>{
  const a=new Blob(['one']),b=new Blob(['one']),c=new Blob(['two']);
  assert.equal(await fingerprint(a),await fingerprint(b));
  assert.notEqual(await fingerprint(a),await fingerprint(c));
});
