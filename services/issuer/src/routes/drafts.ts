import {Hono} from 'hono';
import {AppError,ERROR_CODE} from '@dmjone/shared';
import type {DocumentKind} from '@dmjone/shared';
import type {IssuerDeps} from '../deps.js';
import type {IssuerHonoEnv} from '../http/context.js';
import {requireAdmin} from '../http/middleware.js';
import {requireEmailRequest} from '../email/delivery.js';
import {draftRepo,draftSummary,getDraftInput,pauseDraft,saveDraft,validateDraftId} from '../drafts/service.js';
export function registerDraftRoutes(app:Hono<IssuerHonoEnv>,deps:IssuerDeps):void{
  const api=new Hono<IssuerHonoEnv>();api.use('*',requireAdmin(deps));
  api.get('/',async c=>c.json({items:await Promise.all((await draftRepo(deps).list(50)).map(async d=>{
    const summary=draftSummary(deps,d);
    const record=d.documentId?await deps.credentialRepo.getById(d.documentId):null;
    const content=record?.content;
    const label=content?('recipientName' in content?content.recipientName:'subject' in content?content.subject:'originalFilename' in content?content.originalFilename:summary.label):summary.label;
    return {...summary,...(record&&!record.erased&&{label:label||record.id,
      recipientEmail:record.recipientEmailEnc?deps.secretSealer.openString(record.recipientEmailEnc):undefined}),
      ...(record?.verifyToken&&!record.erased&&{verifyUrl:deps.env.VERIFY_PUBLIC_URL+'/v/'+record.verifyToken})};
  }))}));
  api.get('/:id',async c=>{
    const id=c.req.param('id');validateDraftId(id);const d=await draftRepo(deps).get(id);
    if(!d)throw new AppError(ERROR_CODE.NOT_FOUND,'Draft not found',404);
    if(d.state==='issued')throw new AppError(ERROR_CODE.BAD_REQUEST,'This document is already issued; use its verification link',409);
    return c.json({...draftSummary(deps,d),input:await getDraftInput(deps,d)});
  });
  api.post('/',async c=>{
    requireEmailRequest(c,deps);let body:Record<string,unknown>;try{body=await c.req.json();}catch{throw new AppError(ERROR_CODE.BAD_REQUEST,'Invalid JSON',400);}
    if(!body || !['certificate','letter','upload'].includes(String(body.kind)) || !['save','schedule'].includes(String(body.action)))throw new AppError(ERROR_CODE.BAD_REQUEST,'Choose a document type and draft action',400);
    if(body.id!==undefined&&typeof body.id!=='string')throw new AppError(ERROR_CODE.BAD_REQUEST,'Invalid draft ID',400);
    if(body.revision!==undefined&&(!Number.isInteger(body.revision)||Number(body.revision)<0))throw new AppError(ERROR_CODE.BAD_REQUEST,'Invalid draft revision',400);
    return c.json({draft:await saveDraft(deps,{kind:body.kind as DocumentKind,input:body.input,schedule:body.action==='schedule',
      ...(typeof body.id==='string'&&{id:body.id}),...(typeof body.revision==='number'&&{revision:body.revision})},c.get('requestId'))},201);
  });
  api.post('/:id/pause',async c=>{
    requireEmailRequest(c,deps);let body:{revision?:unknown};try{body=await c.req.json();}catch{throw new AppError(ERROR_CODE.BAD_REQUEST,'Invalid JSON',400);}
    if(!body || !Number.isInteger(body.revision))throw new AppError(ERROR_CODE.BAD_REQUEST,'A draft revision is required',400);
    return c.json(await pauseDraft(deps,c.req.param('id'),Number(body.revision),c.get('requestId')));
  });
  app.route('/api/drafts',api);
}
