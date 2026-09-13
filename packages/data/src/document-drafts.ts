import type {DocumentDraft, DocumentDraftRepository} from '@dmjone/shared';
import type {Firestore} from '@google-cloud/firestore';

export function createInMemoryDocumentDraftRepository(): DocumentDraftRepository {
  const records = new Map<string,DocumentDraft>();
  return {
    async create(draft) {if(records.has(draft.id))throw new Error('Draft already exists');records.set(draft.id,structuredClone(draft));},
    async get(id) {return records.has(id)?structuredClone(records.get(id)!):null;},
    async compareAndSet(id,revision,next) {
      if(records.get(id)?.revision!==revision || next.id!==id || next.revision!==revision+1)return false;
      records.set(id,structuredClone(next));return true;
    },
    async list(limit) {return [...records.values()].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,limit).map(r=>structuredClone(r));},
    async listDue(now,limit) {return [...records.values()].filter(r=>(r.nextAttemptAt??Infinity)<=now)
      .sort((a,b)=>a.nextAttemptAt!-b.nextAttemptAt!).slice(0,limit).map(r=>structuredClone(r));},
  };
}
export function createFirestoreDocumentDraftRepository(db: Firestore): DocumentDraftRepository {
  const col=db.collection('document_drafts');
  return {
    async create(draft) {await col.doc(draft.id).create(draft);},
    async get(id) {const snap=await col.doc(id).get();return snap.exists?snap.data() as DocumentDraft:null;},
    async compareAndSet(id,revision,next) {
      if(next.id!==id || next.revision!==revision+1)return false;
      return db.runTransaction(async tx=>{
        const ref=col.doc(id),snap=await tx.get(ref);
        if(snap.data()?.revision!==revision)return false;
        // Full replacement removes stale schedule fields when paused/finished.
        tx.set(ref,next);return true;
      });
    },
    async list(limit) {const snap=await col.orderBy('updatedAt','desc').limit(limit).get();return snap.docs.map(d=>d.data() as DocumentDraft);},
    async listDue(now,limit) {const snap=await col.where('nextAttemptAt','<=',now).orderBy('nextAttemptAt').limit(limit).get();return snap.docs.map(d=>d.data() as DocumentDraft);},
  };
}
