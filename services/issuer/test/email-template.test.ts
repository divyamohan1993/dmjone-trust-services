import {describe,it,expect} from 'vitest';
import {messageHtml,messageText,recordsCc} from '../src/email/template.js';
import {createOciEmailSender} from '../src/email/oci.js';
const m={documentId:'DMJ-LTR-TEST',kind:'letter' as const,to:'person@example.test',recipientName:'A <B>',downloadUrl:'https://verify.example.test/v/test',downloadPassword:'<inert>&" password'};
describe('private document email and records copy',()=>{
 it('escapes private fields in HTML while preserving the exact password in text',()=>{
  expect(messageText(m)).toContain(m.downloadPassword);
  const html=messageHtml(m);expect(html).toContain('&lt;inert&gt;&amp;&quot; password');expect(html).toContain('A &lt;B&gt;');expect(html).not.toContain('<inert>');
  expect(()=>messageHtml({...m,downloadUrl:'javascript:alert(1)'})).toThrow();
 });
 it('always copies records, avoiding a duplicate when records is already the recipient',()=>{
  expect(recordsCc(m.to)).toEqual(['records@dmj.one']);expect(recordsCc('Records@dmj.one')).toEqual([]);
 });
 it('treats partial recipient acceptance as uncertain, without sending a second message',async()=>{
  let calls=0;
  const sender=createOciEmailSender({username:'inert',password:'inert'},()=>({close(){},async sendMail(body:any){calls++;expect(body.cc).toEqual(['records@dmj.one']);return {accepted:[m.to],rejected:['records@dmj.one'],messageId:'inert'};}}) as any);
  expect(await sender.send(sender.prepare(m),'inert')).toEqual({status:'uncertain'});expect(calls).toBe(1);
 });
});
