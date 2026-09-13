import {PDFArray,PDFDocument} from 'pdf-lib';

/** A separate background reaches the MediaBox, including Chromium's print margins. */
export const FULL_PAGE_PAPER_HTML = `<!doctype html><html><head><style>
  @page{size:A4;margin:0}html,body{margin:0;width:210mm;height:297mm}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fffdfb;
    background-image:radial-gradient(ellipse at 0 0,rgba(243,205,210,.20),transparent 42%),
      radial-gradient(ellipse at 100% 0,rgba(214,210,235,.17),transparent 38%),
      radial-gradient(ellipse at 100% 100%,rgba(248,224,205,.18),transparent 42%);}
</style></head><body></body></html>`;

/** Finalize before signing. Preserve the existing pages, text, links and annotations. */
export async function addFullPagePaper(foreground:Uint8Array,background:Uint8Array):Promise<Uint8Array>{
  const doc=await PDFDocument.load(foreground);
  const [paper]=await doc.embedPdf(background,[0]);
  if(!paper)throw new Error('Paper background is missing');
  for(const page of doc.getPages()){
    page.drawPage(paper,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});
    const streams=page.node.Contents();
    if(!(streams instanceof PDFArray))throw new Error('Unexpected PDF page content');
    // drawPage adds one balanced graphics stream. Move only that stream behind
    // the original content, without rebuilding pages or losing link annotations.
    const last=streams.get(streams.size()-1);streams.remove(streams.size()-1);streams.insert(0,last);
  }
  return doc.save({useObjectStreams:false});
}
