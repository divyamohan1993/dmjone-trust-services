import {it,expect} from 'vitest';
import {PDFDocument,PDFName,PDFString,PDFDict,rgb} from 'pdf-lib';
import {addFullPagePaper} from '../src/full-page-paper.js';
it('adds full-sheet paper while preserving page size, page count and original links',async()=>{
 const fore=await PDFDocument.create();const first=fore.addPage([595,842]);fore.addPage([595,842]);
 first.drawText('Original foreground');const link=fore.context.obj({Type:'Annot',Subtype:'Link',Rect:[20,20,180,40],A:{S:'URI',URI:PDFString.of('https://dmj.one/tos')}});first.node.addAnnot(fore.context.register(link));
 const back=await PDFDocument.create();back.addPage([595,842]).drawRectangle({x:0,y:0,width:595,height:842,color:rgb(1,.99,.98)});
 const result=await PDFDocument.load(await addFullPagePaper(await fore.save(),await back.save()));
 expect(result.getPageCount()).toBe(2);expect(result.getPage(0).getSize()).toEqual({width:595,height:842});
 const annots=result.getPage(0).node.Annots()!;expect(annots.size()).toBe(1);
 const annot=result.context.lookup(annots.get(0),PDFDict),action=annot.lookup(PDFName.of('A'),PDFDict);
 expect(action.lookup(PDFName.of('URI'),PDFString).decodeText()).toBe('https://dmj.one/tos');
});
