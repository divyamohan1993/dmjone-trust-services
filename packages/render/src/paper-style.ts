/** Shared letterhead decoration. Fixed print layers repeat without changing document flow. */
export const PAPER_STYLE = `
  .paper-wash{position:fixed;inset:0;pointer-events:none;z-index:0;
    background:radial-gradient(ellipse at 0 0,rgba(243,205,210,.20),transparent 42%),
      radial-gradient(ellipse at 100% 0,rgba(214,210,235,.17),transparent 38%),
      radial-gradient(ellipse at 100% 100%,rgba(248,224,205,.18),transparent 42%);}
  .paper-edge{position:fixed;inset:0;border:.7pt solid #B0892F;
    outline:.35pt solid #CBA85E;outline-offset:-1.6mm;pointer-events:none;z-index:0;}
  .page{position:relative;z-index:1;width:100%;padding:7mm 8mm;box-decoration-break:clone;-webkit-box-decoration-break:clone;}
`;
export const PAPER_DECORATION = '<div class="paper-wash" aria-hidden="true"></div><div class="paper-edge" aria-hidden="true"></div>';
