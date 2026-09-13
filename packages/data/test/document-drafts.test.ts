import {it,expect} from 'vitest';
import {createInMemoryDocumentDraftRepository} from '../src/document-drafts.js';
it('allows only one competing claim and removes paused items from the due scan',async()=>{
 const repo=createInMemoryDocumentDraftRepository();const d={id:'inert-draft',kind:'letter' as const,state:'scheduled' as const,encryptedInput:'encrypted',revision:1,createdAt:1,updatedAt:1,scheduledFor:10,nextAttemptAt:10};
 await repo.create(d);expect(await repo.listDue(9,10)).toHaveLength(0);
 expect(await Promise.all([repo.compareAndSet(d.id,1,{...d,state:'issuing',revision:2}),repo.compareAndSet(d.id,1,{...d,state:'draft',revision:2})])).toEqual([true,false]);
 const current=(await repo.get(d.id))!;const {nextAttemptAt:_,...rest}=current;
 expect(await repo.compareAndSet(d.id,2,{...rest,state:'draft',revision:3})).toBe(true);expect(await repo.listDue(100,10)).toHaveLength(0);
});
