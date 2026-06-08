/**
 * The single inline, nonce'd, dependency-free admin script.
 *
 * It drives the WebAuthn ceremonies via the raw `navigator.credentials` API
 * (no @simplewebauthn/browser, no CDN) and talks to the `/api/auth` +
 * `/api/credentials` JSON endpoints. Returned as a plain string so the layout
 * can inline it under the request's CSP nonce. Kept framework-free and small;
 * it manipulates the DOM the server rendered and never holds a secret.
 *
 * It ALSO drives the live "type-inside-the-render" body editor (frozen contract
 * §4): a shared B/I/U toolbar + per-paragraph alignment, a live intro/recipient
 * echo, and an exact-PDF Preview that embeds a same-origin `blob:` iframe. The
 * editor's TRUST BOUNDARY — the serialiser that turns each `contenteditable`
 * block into safe in-band markup — is NOT re-authored here: the exact, unit-
 * tested {@link serializeBlock}/{@link serializeBody} sources are embedded
 * verbatim via `.toString()` (run server-side, so no `eval`/`unsafe-eval`; the
 * browser executes the same bytes the tests assert). The contenteditable HTML
 * never leaves the browser; only the serialised string array does.
 */

import { serializeBlock, serializeBody } from './serialize-body.js';

export function adminScript(): string {
  // NB: authored as a template string. Avoid backticks inside; use string
  // concatenation. Everything is wrapped in an IIFE to avoid globals.
  //
  // SINGLE SOURCE OF TRUTH: the body serialiser is embedded by stringifying the
  // real, typed, unit-tested functions (transpiled identically by the test
  // runner and the build), so the shipped trust boundary === the tested one.
  const serializerSource = serializeBlock.toString() + '\n' + serializeBody.toString();
  return `(function(){
"use strict";
${serializerSource}
var statusEl = document.getElementById('status');
function setStatus(msg, isError){
  if(!statusEl) return;
  statusEl.textContent = msg || '';
  statusEl.setAttribute('role', isError ? 'alert' : 'status');
  statusEl.setAttribute('aria-live', isError ? 'assertive' : 'polite');
}
// base64url <-> ArrayBuffer
function b64uToBuf(b64u){
  var b64 = b64u.replace(/-/g,'+').replace(/_/g,'/');
  var pad = b64.length % 4; if(pad) b64 += '===='.slice(pad);
  var bin = atob(b64); var buf = new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function bufToB64u(buf){
  var bytes = new Uint8Array(buf); var bin='';
  for(var i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
}
function api(path, body, extraHeaders){
  var headers = {'content-type':'application/json'};
  if(extraHeaders){ for(var k in extraHeaders){ if(extraHeaders[k]) headers[k] = extraHeaders[k]; } }
  return fetch(path, {
    method:'POST', credentials:'same-origin',
    headers: headers,
    body: JSON.stringify(body||{})
  }).then(function(r){
    return r.json().catch(function(){return {};}).then(function(j){
      if(!r.ok){ var e = new Error((j && j.error) || ('HTTP '+r.status)); e.body=j; throw e; }
      return j;
    });
  });
}
// Decode server reg/auth options JSON into navigator.credentials input.
function toCreateOptions(o){
  o.challenge = b64uToBuf(o.challenge);
  o.user.id = b64uToBuf(o.user.id);
  if(o.excludeCredentials) o.excludeCredentials = o.excludeCredentials.map(function(c){
    return {type:c.type||'public-key', id:b64uToBuf(c.id), transports:c.transports};
  });
  return o;
}
function toGetOptions(o){
  o.challenge = b64uToBuf(o.challenge);
  if(o.allowCredentials) o.allowCredentials = o.allowCredentials.map(function(c){
    return {type:c.type||'public-key', id:b64uToBuf(c.id), transports:c.transports};
  });
  return o;
}
function regResponseJSON(cred){
  var r = cred.response;
  var out = {
    id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
    clientExtensionResults: (cred.getClientExtensionResults && cred.getClientExtensionResults()) || {},
    response: {
      clientDataJSON: bufToB64u(r.clientDataJSON),
      attestationObject: bufToB64u(r.attestationObject)
    }
  };
  if(r.getTransports){ try{ out.response.transports = r.getTransports(); }catch(e){} }
  if(cred.authenticatorAttachment) out.authenticatorAttachment = cred.authenticatorAttachment;
  return out;
}
function authResponseJSON(cred){
  var r = cred.response;
  var out = {
    id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
    clientExtensionResults: (cred.getClientExtensionResults && cred.getClientExtensionResults()) || {},
    response: {
      clientDataJSON: bufToB64u(r.clientDataJSON),
      authenticatorData: bufToB64u(r.authenticatorData),
      signature: bufToB64u(r.signature),
      userHandle: r.userHandle ? bufToB64u(r.userHandle) : undefined
    }
  };
  if(cred.authenticatorAttachment) out.authenticatorAttachment = cred.authenticatorAttachment;
  return out;
}
function supported(){
  if(!window.PublicKeyCredential){ setStatus('This browser does not support passkeys.', true); return false; }
  return true;
}
function register(label){
  if(!supported()) return;
  // Setup token only exists on the first-time bootstrap form; absent when adding
  // a passkey to a provisioned account (the session authorises that instead).
  var tokenEl = document.getElementById('setup-token');
  var setupToken = tokenEl ? tokenEl.value : '';
  var hdr = setupToken ? {'x-setup-token': setupToken} : undefined;
  setStatus('Starting passkey registration…');
  return api('/api/auth/register/options', {}, hdr)
    .then(function(opts){ return navigator.credentials.create({publicKey: toCreateOptions(opts)}); })
    .then(function(cred){ return api('/api/auth/register/verify', {response: regResponseJSON(cred), label: label}, hdr); })
    .then(function(){ setStatus('Passkey registered.'); location.reload(); })
    .catch(function(e){ setStatus('Registration failed: '+e.message, true); });
}
function login(){
  if(!supported()) return;
  setStatus('Requesting passkey…');
  return api('/api/auth/login/options', {})
    .then(function(opts){ return navigator.credentials.get({publicKey: toGetOptions(opts)}); })
    .then(function(cred){ return api('/api/auth/login/verify', {response: authResponseJSON(cred)}); })
    .then(function(){ setStatus('Signed in.'); location.reload(); })
    .catch(function(e){ setStatus('Sign-in failed: '+e.message, true); });
}
function recover(){
  var code = (document.getElementById('rc-code')||{}).value || '';
  var token = (document.getElementById('rc-totp')||{}).value || '';
  setStatus('Verifying recovery…');
  return api('/api/auth/recovery/login', {recoveryCode: code, token: token})
    .then(function(){ setStatus('Recovery accepted — registering a fresh passkey…'); return register('recovered'); })
    .catch(function(e){ setStatus('Recovery failed: '+e.message, true); });
}
function out(obj){
  var el = document.getElementById('security-out'); if(el) el.textContent = JSON.stringify(obj, null, 2);
}
// Build a <td> safely: text via textContent (never innerHTML), so attacker-
// influenced fields (e.g. recipientName) can never inject markup. CSP would
// block injected inline script regardless; this removes the sink entirely.
function cell(text, opts){
  var td = document.createElement('td');
  if(opts && opts.code){ var code = document.createElement('code'); code.textContent = text; td.appendChild(code); }
  else if(opts && opts.badge){
    var span = document.createElement('span');
    span.className = 'badge ' + (text === 'revoked' ? 'revoked' : 'valid');
    span.textContent = text; td.appendChild(span);
  } else { td.textContent = text; }
  return td;
}
function renderRows(items){
  var tb = document.getElementById('cred-rows'); if(!tb) return;
  while(tb.firstChild) tb.removeChild(tb.firstChild);
  if(!items.length){
    var tr0 = document.createElement('tr'); var td0 = document.createElement('td');
    td0.colSpan = 5; td0.className = 'muted'; td0.textContent = 'No credentials yet.';
    tr0.appendChild(td0); tb.appendChild(tr0); return;
  }
  items.forEach(function(it){
    var tr = document.createElement('tr');
    tr.appendChild(cell(it.credentialId, {code:true}));
    tr.appendChild(cell(it.recipientName));
    tr.appendChild(cell(it.type));
    tr.appendChild(cell(it.status, {badge:true}));
    var actions = document.createElement('td');
    if(it.status !== 'revoked'){
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'secondary'; btn.textContent = 'Revoke';
      btn.setAttribute('aria-label', 'Revoke credential ' + it.credentialId);
      btn.setAttribute('data-revoke', it.credentialId);
      actions.appendChild(btn);
    }
    tr.appendChild(actions);
    tb.appendChild(tr);
  });
}
function refreshList(){
  return fetch('/api/credentials', {credentials:'same-origin'})
    .then(function(r){ return r.json(); })
    .then(function(j){ renderRows(j.items||[]); })
    .catch(function(e){ setStatus('Could not load list: '+e.message, true); });
}
// Build the issue/preview payload from the form fields + the live body editor.
// The body comes ONLY from the serialiser (the #f-body textarea is gone): the
// contenteditable HTML never leaves the browser, only the serialised in-band
// markup strings do. 'wantPassword' adds the candidate password for issuance
// and omits it for preview (the preview schema is issue minus password, §5.1).
function buildPayload(form, wantPassword){
  var data = new FormData(form);
  var payload = {
    type: data.get('type'), recipientName: data.get('recipientName'),
    kicker: data.get('kicker'), title: data.get('title'), intro: data.get('intro'),
    bodyParagraphs: collectBody(), issueDate: data.get('issueDate')
  };
  if(wantPassword) payload.password = data.get('password');
  var closing = String(data.get('closingLine')||'').trim();
  if(closing) payload.closingLine = closing;
  return payload;
}
function issue(form){
  setStatus('Issuing…');
  return api('/api/credentials', buildPayload(form, true))
    .then(function(j){ setStatus('Issued '+j.credentialId+'.'); resetEditor(); form.reset(); syncEcho(); return refreshList(); })
    .catch(function(e){ setStatus('Issue failed: '+e.message, true); });
}
// ---- Mode 2 (letterhead) payload + issue. Reuses the SHARED rich body editor
// (collectBody scoped to the letter root) and the SHARED blobPreview helper.
// recipientLines = the textarea split on newlines, trimmed, empties dropped.
// 'wantPassword' adds the candidate password for issuance, omits it for preview
// (the preview schema is issue minus password — mirrors the cert preview).
function letterRoot(){ return document.getElementById('letter-body-editor'); }
function splitLines(value){
  var lines = String(value||'').split('\\n'); var out = [];
  for(var i=0;i<lines.length;i++){ var s = lines[i].trim(); if(s) out.push(s); }
  return out;
}
function buildLetterPayload(form, wantPassword){
  var data = new FormData(form);
  var payload = {
    issueDate: data.get('issueDate'),
    recipientLines: splitLines(data.get('recipientLines')),
    bodyParagraphs: collectBody(letterRoot())
  };
  var reference = String(data.get('reference')||'').trim(); if(reference) payload.reference = reference;
  var subject = String(data.get('subject')||'').trim(); if(subject) payload.subject = subject;
  var salutation = String(data.get('salutation')||'').trim(); if(salutation) payload.salutation = salutation;
  var valediction = String(data.get('valediction')||'').trim(); if(valediction) payload.valediction = valediction;
  if(wantPassword) payload.password = data.get('password');
  return payload;
}
function issueLetter(form){
  setStatus('Issuing letter…');
  return api('/api/letters', buildLetterPayload(form, true))
    .then(function(j){
      setStatus('Issued letter '+j.documentId+'.');
      resetEditor(letterRoot()); form.reset(); return refreshList();
    })
    .catch(function(e){ setStatus('Issue letter failed: '+e.message, true); });
}
function revoke(id){
  if(!id) return;
  setStatus('Revoking '+id+'…');
  return api('/api/credentials/'+encodeURIComponent(id)+'/revoke', {reason:'revoked from admin UI'})
    .then(function(){ setStatus('Revoked '+id+'.'); return refreshList(); })
    .catch(function(e){ setStatus('Revoke failed: '+e.message, true); });
}
// ===========================================================================
// LIVE BODY EDITOR (frozen contract §4). Everything below is CSP-clean: no
// inline handlers, class-based styling only, all marks normalised by the
// serialiser embedded above. The contenteditable HTML never leaves the browser.
// ===========================================================================
// Min stays a constant; the per-editor MAX is read from data-max-paras on the
// editor root (certificate 6 §4.2, letterhead up to the schema's 40) via maxParasFor.
var MIN_PARAS = 1;
var ALIGNS = ['left','center','right','justify'];
var ALIGN_LABEL = {left:'Align left', center:'Align center', right:'Align right', justify:'Justify'};
var activePara = null; // the most-recently-focused .para-edit (mousedown on a
                       // toolbar button must NOT change this — see preventDefault).

// Two rich editors share this code (certificate #body-editor + letterhead
// #letter-body-editor). Every helper that USED to assume the single cert editor
// now takes the editor root explicitly and DEFAULTS to the cert one, so the
// verbatim cert call sites (and the source tests asserting them) are unchanged.
// Runtime handlers resolve the right editor from the clicked element's
// .composer ancestor — never a document-wide querySelector that would always
// hit the cert instance.
function editorRoot(root){ return root || document.getElementById('body-editor'); }
function maxParasFor(root){
  var r = editorRoot(root); var n = r ? parseInt(r.getAttribute('data-max-paras')||'6', 10) : 6;
  return (n && n > 0) ? n : 6;
}
function labelPrefixFor(root){
  var r = editorRoot(root); return (r && r.getAttribute('data-label-prefix')) || 'Certificate body';
}
// The .composer that owns a given DOM node, and the toolbar / editor root inside
// it. The editor root is the element carrying data-max-paras (unambiguous across
// both instances — never an id-suffix guess).
function composerOf(node){ return node && node.closest ? node.closest('.composer') : null; }
function toolbarIn(composer){ return composer ? composer.querySelector('.mark-toolbar') : null; }
function editorIn(composer){ return composer ? composer.querySelector('[data-max-paras]') : null; }

// Serialise every paragraph block to bodyParagraphs[] via the trust boundary.
// One .para-block = one element; align comes from the pressed alignment button.
// 'root' selects which editor to collect (defaults to the cert #body-editor so
// the existing zero-arg call site stays byte-identical).
function collectBody(root){
  var r = editorRoot(root); if(!r) return [];
  var nodes = r.querySelectorAll('.para-block');
  var input = [];
  for(var i=0;i<nodes.length;i++){
    var edit = nodes[i].querySelector('.para-edit');
    if(!edit) continue;
    var pressed = nodes[i].querySelector('.align-btn[aria-pressed="true"]');
    var align = pressed ? pressed.getAttribute('data-align') : 'justify';
    input.push({root: edit, align: align});
  }
  return serializeBody(input);
}

// --- alignment: toggle ONLY the pa-* class (never inline style) + aria-pressed.
function alignClassFor(a){ return 'pa-' + a; }
function setAlign(block, align){
  var edit = block.querySelector('.para-edit'); if(!edit) return;
  for(var i=0;i<ALIGNS.length;i++) edit.classList.remove(alignClassFor(ALIGNS[i]));
  edit.classList.add(alignClassFor(align));
  var btns = block.querySelectorAll('.align-btn');
  for(var j=0;j<btns.length;j++){
    btns[j].setAttribute('aria-pressed', btns[j].getAttribute('data-align')===align ? 'true':'false');
  }
}

// --- B/I/U marks. Apply to the active paragraph's current selection. Force
// styleWithCSS=false so execCommand emits <b>/<i>/<u> TAGS (not style spans the
// serialiser would unwrap, losing the mark). The serialiser then normalises
// b/i/u <-> strong/em/u. Selection is preserved because the toolbar buttons
// preventDefault on mousedown (they never steal focus from the editable).
function applyMark(cmd){
  if(activePara){ try{ activePara.focus(); }catch(e){} }
  try{ document.execCommand('styleWithCSS', false, 'false'); }catch(e){}
  try{ document.execCommand(cmd, false, null); }catch(e){}
  syncMarkPressed();
}
// The toolbar of whichever editor currently holds the caret (the active
// paragraph's .composer). Falls back to the cert toolbar when nothing is focused.
function activeToolbar(){
  var c = composerOf(activePara); var tb = toolbarIn(c);
  return tb || document.querySelector('.composer .mark-toolbar') || document.querySelector('.mark-toolbar');
}
// Reflect the current selection's marks on the active editor's toolbar
// (aria-pressed), live. An explicit toolbar can be passed (roving handler).
function syncMarkPressed(tb){
  tb = tb || activeToolbar(); if(!tb) return;
  var btns = tb.querySelectorAll('.mark-btn');
  for(var i=0;i<btns.length;i++){
    var cmd = btns[i].getAttribute('data-cmd'); var on = false;
    try{ on = document.queryCommandState(cmd); }catch(e){ on = false; }
    btns[i].setAttribute('aria-pressed', on ? 'true':'false');
  }
}

// --- paste as PLAIN TEXT (cleanliness; the serialiser is the real boundary).
function onPaste(ev){
  var edit = ev.target && ev.target.closest ? ev.target.closest('.para-edit') : null;
  if(!edit) return;
  ev.preventDefault();
  var text = '';
  if(ev.clipboardData) text = ev.clipboardData.getData('text/plain');
  else if(window.clipboardData) text = window.clipboardData.getData('Text');
  try{ document.execCommand('insertText', false, text); }
  catch(e){ edit.textContent = (edit.textContent||'') + text; }
}

// --- add / remove paragraph blocks (respect the 1..max bound; max is read from
// the editor root's data-max-paras — cert 6, letter 40). New blocks mirror the
// server-rendered paragraphBlock() structure exactly. 'labelPrefix' names the
// paragraph for the owning surface ("Certificate body" / "Letter body").
function buildBlock(index, labelPrefix){
  labelPrefix = labelPrefix || 'Certificate body';
  var block = document.createElement('div'); block.className = 'para-block';
  var edit = document.createElement('div');
  edit.className = 'para-edit pa-justify'; edit.setAttribute('contenteditable','true');
  edit.setAttribute('role','textbox'); edit.setAttribute('aria-multiline','true');
  edit.setAttribute('aria-label', labelPrefix+' paragraph '+index);
  edit.setAttribute('data-placeholder','Body paragraph…');
  block.appendChild(edit);
  var tools = document.createElement('div'); tools.className='para-tools';
  tools.setAttribute('role','group'); tools.setAttribute('aria-label','Paragraph '+index+' alignment');
  var lbl = document.createElement('span'); lbl.className='lbl'; lbl.setAttribute('aria-hidden','true');
  lbl.textContent='Align'; tools.appendChild(lbl);
  var letters = {left:'L', center:'C', right:'R', justify:'J'};
  for(var i=0;i<ALIGNS.length;i++){
    var a = ALIGNS[i];
    var b = document.createElement('button'); b.type='button'; b.className='align-btn';
    b.setAttribute('data-align', a); b.setAttribute('aria-label', ALIGN_LABEL[a]);
    b.setAttribute('aria-pressed', a==='justify' ? 'true':'false'); b.textContent=letters[a];
    tools.appendChild(b);
  }
  var rm = document.createElement('button'); rm.type='button'; rm.className='para-rm';
  rm.setAttribute('data-action','remove-para'); rm.setAttribute('aria-label','Remove paragraph '+index);
  rm.textContent='\\u00d7'; tools.appendChild(rm); // multiplication sign, never innerHTML
  block.appendChild(tools);
  return block;
}
function relabelBlocks(root){
  var r = editorRoot(root); if(!r) return;
  var prefix = labelPrefixFor(r);
  var blocks = r.querySelectorAll('.para-block');
  for(var i=0;i<blocks.length;i++){
    var n = i+1;
    var edit = blocks[i].querySelector('.para-edit');
    if(edit) edit.setAttribute('aria-label', prefix+' paragraph '+n);
    var tools = blocks[i].querySelector('.para-tools');
    if(tools) tools.setAttribute('aria-label','Paragraph '+n+' alignment');
    var rm = blocks[i].querySelector('.para-rm');
    if(rm) rm.setAttribute('aria-label','Remove paragraph '+n);
  }
}
function addPara(root){
  var r = editorRoot(root); if(!r) return;
  var max = maxParasFor(r);
  var count = r.querySelectorAll('.para-block').length;
  if(count >= max){ setStatus('This body allows at most '+max+' paragraphs.', true); return; }
  var block = buildBlock(count+1, labelPrefixFor(r)); r.appendChild(block);
  relabelBlocks(r);
  var edit = block.querySelector('.para-edit'); if(edit){ activePara = edit; edit.focus(); }
}
function removePara(btn){
  var block = btn.closest ? btn.closest('.para-block') : null; if(!block) return;
  var r = block.parentNode; if(!r) return; // the editor root that owns this block
  var count = r.querySelectorAll('.para-block').length;
  if(count <= MIN_PARAS){ setStatus('A body needs at least one paragraph.', true); return; }
  if(activePara && block.contains(activePara)) activePara = null;
  r.removeChild(block); relabelBlocks(r);
}
function resetEditor(root){
  var r = editorRoot(root); if(!r) return;
  var prefix = labelPrefixFor(r);
  while(r.firstChild) r.removeChild(r.firstChild);
  var block = buildBlock(1, prefix); r.appendChild(block);
  if(activePara && composerOf(activePara) === composerOf(r)) activePara = null;
}

// --- live echo of intro + recipient above the editable column.
function syncEcho(){
  var intro = document.getElementById('f-intro');
  var recip = document.getElementById('f-recipient');
  var ei = document.getElementById('echo-intro');
  var er = document.getElementById('echo-recipient');
  if(ei && intro) ei.textContent = intro.value || 'This is to certify that';
  if(er && recip) er.textContent = recip.value || 'Recipient name';
}

// --- SHARED exact-PDF preview helper. POST a JSON payload to a side-effect-free
// preview endpoint, take the returned PDF blob, and show it in a same-origin
// blob: iframe (frame-src 'self' blob:) inside the given host. Each host owns its
// own object URL (stashed on a JS property — NOT a style attribute, CSP-clean)
// and revokes the previous one on replace. Used by BOTH the certificate and
// letterhead Preview buttons. Raw fetch + .blob() (NOT api(), which JSON-parses).
function clearHost(host){
  if(!host) return;
  while(host.firstChild) host.removeChild(host.firstChild);
  if(host._previewUrl){ try{ URL.revokeObjectURL(host._previewUrl); }catch(e){} host._previewUrl = null; }
}
function blobPreview(endpoint, payload, host, title){
  if(!host) return;
  setStatus('Rendering exact preview…');
  return fetch(endpoint, {
    method:'POST', credentials:'same-origin',
    headers:{'content-type':'application/json'}, body: JSON.stringify(payload)
  }).then(function(r){
    if(!r.ok){
      return r.json().catch(function(){return {};}).then(function(j){
        throw new Error((j && j.error) || ('HTTP '+r.status));
      });
    }
    return r.blob();
  }).then(function(blob){
    clearHost(host);
    host._previewUrl = URL.createObjectURL(blob);
    var frame = document.createElement('iframe');
    frame.className = 'preview-frame'; frame.setAttribute('title', title);
    frame.src = host._previewUrl; host.appendChild(frame);
    setStatus('Preview ready — this is the exact PDF that would be issued.');
  }).catch(function(e){ setStatus('Preview failed: '+e.message, true); });
}
// Certificate preview: serialise the cert editor -> POST /api/credentials/preview.
function preview(){
  var form = document.getElementById('issue-form'); if(!form) return;
  var host = document.getElementById('body-editor-preview-host');
  return blobPreview('/api/credentials/preview', buildPayload(form, false), host, 'Exact certificate preview');
}
// Letterhead preview: serialise the letter editor -> POST /api/letters/preview.
function previewLetter(){
  var form = document.getElementById('letter-form'); if(!form) return;
  var host = document.getElementById('letter-body-editor-preview-host');
  return blobPreview('/api/letters/preview', buildLetterPayload(form, false), host, 'Exact letter preview');
}

// --- roving tabindex for the B/I/U toolbar (WCAG 2.2 AA: arrow-key navigation).
function toolbarRove(ev){
  var key = ev.key;
  if(key!=='ArrowLeft' && key!=='ArrowRight' && key!=='Home' && key!=='End') return;
  // Scope to the toolbar that actually holds focus (either editor's), so arrow
  // roving stays within the toolbar the admin is using.
  var focused = document.activeElement;
  var tb = focused && focused.closest ? focused.closest('.mark-toolbar') : null; if(!tb) return;
  var btns = tb.querySelectorAll('.mark-btn'); if(!btns.length) return;
  var idx = -1;
  for(var i=0;i<btns.length;i++){ if(btns[i]===document.activeElement){ idx=i; break; } }
  if(idx<0) return;
  ev.preventDefault();
  var next = idx;
  if(key==='ArrowLeft') next = (idx - 1 + btns.length) % btns.length;
  else if(key==='ArrowRight') next = (idx + 1) % btns.length;
  else if(key==='Home') next = 0;
  else if(key==='End') next = btns.length - 1;
  for(var j=0;j<btns.length;j++) btns[j].setAttribute('tabindex', j===next ? '0':'-1');
  btns[next].focus();
}

// --- wire the editor (only when the dashboard editor is present) -------------
if(editorRoot()){
  // Track the active paragraph as focus moves into an editable block.
  document.addEventListener('focusin', function(ev){
    var t = ev.target; if(t && t.classList && t.classList.contains('para-edit')) activePara = t;
  });
  // Keep B/I/U pressed-state synced to the live selection (on the active
  // editor's toolbar). Wrapped so the Event is not mistaken for a toolbar arg.
  document.addEventListener('selectionchange', function(){ syncMarkPressed(); });
  // Paste as plain text inside any editable paragraph.
  document.addEventListener('paste', onPaste, true);
  // Ctrl/Cmd+B / I / U while editing a paragraph.
  document.addEventListener('keydown', function(ev){
    var t = ev.target;
    var inEdit = t && t.classList && t.classList.contains('para-edit');
    if((ev.ctrlKey || ev.metaKey) && inEdit){
      var k = (ev.key||'').toLowerCase();
      if(k==='b'){ ev.preventDefault(); applyMark('bold'); return; }
      if(k==='i'){ ev.preventDefault(); applyMark('italic'); return; }
      if(k==='u'){ ev.preventDefault(); applyMark('underline'); return; }
    }
    toolbarRove(ev);
  });
  // The B/I/U buttons act on a mouse press by ONLY preventing default on
  // mousedown — that stops the button stealing focus, so the contenteditable
  // selection survives into the click where the mark is actually applied. The
  // action itself lives once, in the click handler below (which fires uniformly
  // for mouse, keyboard, touch and screen readers — no double-toggle, no
  // input-type heuristic). Alignment buttons need no selection preserved, so
  // they are NOT in mousedown at all.
  document.addEventListener('mousedown', function(ev){
    var t = ev.target instanceof Element ? ev.target : null; if(!t) return;
    if(t.closest('.mark-btn')) ev.preventDefault();
  });
  // Live echo follows the intro/recipient inputs.
  var introEl = document.getElementById('f-intro');
  var recipEl = document.getElementById('f-recipient');
  if(introEl) introEl.addEventListener('input', syncEcho);
  if(recipEl) recipEl.addEventListener('input', syncEcho);
  syncEcho();
}

// Wire up clicks (event delegation; no inline handlers → CSP-clean).
document.addEventListener('click', function(ev){
  var t = ev.target; if(!(t instanceof Element)) return;
  var revokeId = t.getAttribute('data-revoke'); if(revokeId){ ev.preventDefault(); revoke(revokeId); return; }
  // Body-editor formatting/alignment: handled here so they work for EVERY input
  // (mouse, keyboard, touch, AT). For the mark buttons the preceding mousedown
  // preventDefault has already kept the editable selection alive; here we apply
  // once. data-cmd / data-align are matched BEFORE the data-action lookup.
  var markBtn = t.closest ? t.closest('.mark-btn') : null;
  if(markBtn){ ev.preventDefault(); applyMark(markBtn.getAttribute('data-cmd')); return; }
  var alignBtn = t.closest ? t.closest('.align-btn') : null;
  if(alignBtn){
    ev.preventDefault();
    var alignBlock = alignBtn.closest('.para-block');
    if(alignBlock){ setAlign(alignBlock, alignBtn.getAttribute('data-align')); }
    return;
  }
  var actionEl = t.closest ? t.closest('[data-action]') : null;
  var action = actionEl ? actionEl.getAttribute('data-action') : null; if(!action) return;
  ev.preventDefault();
  if(action==='login') login();
  else if(action==='register') register((document.getElementById('pk-label')||{}).value||'primary');
  else if(action==='add-passkey') register('additional');
  else if(action==='recover') recover();
  else if(action==='refresh-list') refreshList();
  // add-para / preview are shared by both composers — resolve which editor/form
  // owns the clicked button from its .composer / <form> ancestor.
  else if(action==='add-para') addPara(editorIn(composerOf(actionEl)));
  else if(action==='remove-para') removePara(actionEl);
  else if(action==='preview'){
    if(actionEl.closest && actionEl.closest('#letter-form')) previewLetter(); else preview();
  }
  else if(action==='upload-preview') previewUpload();
  else if(action==='logout') api('/api/auth/logout',{}).then(function(){location.reload();});
  else if(action==='totp-enroll') api('/api/auth/totp/enroll',{}).then(out).catch(function(e){setStatus(e.message,true);});
  else if(action==='recovery-gen') api('/api/auth/recovery/generate',{}).then(out).catch(function(e){setStatus(e.message,true);});
});
var issueForm = document.getElementById('issue-form');
if(issueForm) issueForm.addEventListener('submit', function(ev){ ev.preventDefault(); issue(issueForm); });
var letterForm = document.getElementById('letter-form');
if(letterForm) letterForm.addEventListener('submit', function(ev){ ev.preventDefault(); issueLetter(letterForm); });

// ===========================================================================
// MODE SWITCHER (role=tablist): Certificate · Letterhead · Upload. APG tabs
// pattern — roving tabindex, aria-selected, arrow/Home/End nav with automatic
// activation. Selecting a tab shows its panel and HIDES the others via the
// [hidden] boolean attribute (el.hidden — a property, NOT a style attribute;
// CSP-clean). The panels are siblings; the always-present list + security cards
// live OUTSIDE the tablist.
// ===========================================================================
function modeTabs(){
  var list = document.querySelector('.mode-tabs[role="tablist"]');
  return list ? list.querySelectorAll('[role="tab"]') : [];
}
function selectMode(tab, focusTab){
  var tabs = modeTabs(); if(!tabs.length || !tab) return;
  for(var i=0;i<tabs.length;i++){
    var selected = tabs[i] === tab;
    tabs[i].setAttribute('aria-selected', selected ? 'true':'false');
    tabs[i].setAttribute('tabindex', selected ? '0':'-1');
    var panel = document.getElementById(tabs[i].getAttribute('aria-controls'));
    if(panel) panel.hidden = !selected; // boolean attribute — CSP-clean
  }
  if(focusTab){ try{ tab.focus(); }catch(e){} }
}
function modeTabsKeydown(ev){
  var tab = ev.target && ev.target.closest ? ev.target.closest('[role="tab"]') : null; if(!tab) return;
  var tabs = modeTabs(); if(!tabs.length) return;
  var idx = -1; for(var i=0;i<tabs.length;i++){ if(tabs[i]===tab){ idx=i; break; } }
  if(idx<0) return;
  var key = ev.key, next = -1;
  if(key==='ArrowRight' || key==='ArrowDown') next = (idx + 1) % tabs.length;
  else if(key==='ArrowLeft' || key==='ArrowUp') next = (idx - 1 + tabs.length) % tabs.length;
  else if(key==='Home') next = 0;
  else if(key==='End') next = tabs.length - 1;
  else return;
  ev.preventDefault();
  selectMode(tabs[next], true);
}
(function wireModeTabs(){
  var tabs = modeTabs(); if(!tabs.length) return;
  for(var i=0;i<tabs.length;i++){
    tabs[i].addEventListener('click', function(ev){
      var tab = ev.currentTarget; selectMode(tab, false);
    });
    tabs[i].addEventListener('keydown', modeTabsKeydown);
  }
})();

// ===========================================================================
// MODE 3 — UPLOAD & ATTEST (§E upload panel). Pick a PDF -> /api/uploads/inspect
// (page count + each page box) -> optionally drag/resize the dmj.one signature
// stamp on a chosen page -> Preview the REAL stamped render (/api/uploads/preview,
// shared blobPreview) -> Sign & download (/api/uploads: signed bytes + the
// X-Document-Id header). CSP-clean: the placement box is positioned/sized via the
// CSSOM (element.style.left/top/width/height — permitted; only HTML style=""
// ATTRIBUTES are blocked); all wiring is addEventListener/delegation, no inline
// handlers. The box geometry -> SignaturePlacement {page,xPct,yPct,wPct} are
// fractions of the page box, origin TOP-LEFT (the backend flips to PDF
// bottom-left). The page aspect comes from inspect's pages[i].widthPt:heightPt;
// the box aspect follows the signature image's own natural ratio (same image the
// stamp embeds), so the box predicts where the mark lands.
// ===========================================================================
var uploadPdfBase64 = null;   // base64 of the picked PDF (no data: prefix)
var uploadFilename = '';      // original file name (rides signUploadSchema)
var uploadPages = [];         // [{widthPt,heightPt}] from /inspect
var STAGE_MAX_PX = 420;       // longest stage edge; the page is scaled to fit
function uEl(id){ return document.getElementById(id); }
function clampNum(n, lo, hi){ return n < lo ? lo : (n > hi ? hi : n); }
// The signature image's natural aspect (height/width); the stamp uses the SAME
// image, so the box height = box width * this ratio predicts the stamped height.
function sigAspect(){
  var img = uEl('upload-sigimg');
  if(img && img.naturalWidth > 0) return img.naturalHeight / img.naturalWidth;
  return 94 / 109; // the brand signature's known ratio until the image loads
}
// The selected 1-based page (defaults to 1 when single-page / no selector).
function uploadPage(){
  var sel = uEl('upload-page');
  var n = sel ? parseInt(sel.value || '1', 10) : 1;
  return (n && n > 0) ? n : 1;
}
// Size the stage to the selected page's aspect, scaled so its longest edge is
// STAGE_MAX_PX. Returns the {w,h} chosen (px). CSSOM only — no style attribute.
function sizeStage(){
  var stage = uEl('upload-stage'); if(!stage) return null;
  var page = uploadPages[uploadPage() - 1];
  var wPt = page ? page.widthPt : 210, hPt = page ? page.heightPt : 297;
  if(!(wPt > 0) || !(hPt > 0)){ wPt = 210; hPt = 297; }
  var w, h;
  if(wPt >= hPt){ w = STAGE_MAX_PX; h = STAGE_MAX_PX * (hPt / wPt); }
  else { h = STAGE_MAX_PX; w = STAGE_MAX_PX * (wPt / hPt); }
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  return {w: w, h: h};
}
// Place the box at a default position/size (≈26% width, centred) the first time,
// then keep it inside the stage. All geometry via the CSSOM.
function placeBoxDefault(){
  var stage = uEl('upload-stage'), box = uEl('upload-sigbox');
  if(!stage || !box) return;
  var sw = stage.clientWidth, sh = stage.clientHeight;
  var bw = clampNum(sw * 0.26, 24, sw);
  var bh = bw * sigAspect();
  if(bh > sh){ bh = sh; bw = bh / sigAspect(); }
  var left = clampNum((sw - bw) / 2, 0, sw - bw);
  var top = clampNum((sh - bh) / 2, 0, sh - bh);
  box.style.width = bw + 'px';
  box.style.height = bh + 'px';
  box.style.left = left + 'px';
  box.style.top = top + 'px';
}
// Re-clamp the box so it always sits fully inside the (possibly re-aspected)
// stage and respects the signature aspect + the wPct>=0.02 schema floor.
function reclampBox(){
  var stage = uEl('upload-stage'), box = uEl('upload-sigbox');
  if(!stage || !box) return;
  var sw = stage.clientWidth, sh = stage.clientHeight;
  if(!(sw > 0) || !(sh > 0)) return;
  var bw = box.offsetWidth || sw * 0.26;
  bw = clampNum(bw, sw * 0.02, sw);
  var bh = bw * sigAspect();
  if(bh > sh){ bh = sh; bw = bh / sigAspect(); }
  var left = clampNum(box.offsetLeft, 0, Math.max(0, sw - bw));
  var top = clampNum(box.offsetTop, 0, Math.max(0, sh - bh));
  box.style.width = bw + 'px';
  box.style.height = bh + 'px';
  box.style.left = left + 'px';
  box.style.top = top + 'px';
}
// Box geometry -> SignaturePlacement fractions (TOP-LEFT origin), schema-clamped.
function uploadPlacement(){
  var stage = uEl('upload-stage'), box = uEl('upload-sigbox');
  if(!stage || !box) return null;
  var sw = stage.clientWidth, sh = stage.clientHeight;
  if(!(sw > 0) || !(sh > 0)) return null;
  var wPct = clampNum(box.offsetWidth / sw, 0.02, 1);
  var xPct = clampNum(box.offsetLeft / sw, 0, 1);
  var yPct = clampNum(box.offsetTop / sh, 0, 1);
  return {page: uploadPage(), xPct: xPct, yPct: yPct, wPct: wPct};
}
function placingSignature(){ var c = uEl('upload-place'); return !!(c && c.checked); }
// Show/hide the placement UI from the checkbox + whether a PDF is inspected.
function syncUploadPlacement(){
  var wrap = uEl('upload-placement'); if(!wrap) return;
  var on = placingSignature() && uploadPages.length > 0;
  wrap.hidden = !on;
  if(on){ sizeStage(); reclampBox(); }
}
// Populate the page <select> from the inspected page count; show it only when
// there is more than one page to choose between.
function fillUploadPages(){
  var sel = uEl('upload-page'), row = uEl('upload-page-row');
  if(!sel) return;
  while(sel.firstChild) sel.removeChild(sel.firstChild);
  for(var i=0;i<uploadPages.length;i++){
    var opt = document.createElement('option');
    opt.value = String(i + 1); opt.textContent = 'Page ' + (i + 1);
    sel.appendChild(opt);
  }
  if(row) row.hidden = uploadPages.length <= 1;
}
// Read the picked PDF as STANDARD base64 (data-URL tail; NOT the base64url
// bufToB64u, which the server's Buffer.from('base64') need not accept), then
// POST /api/uploads/inspect for the page count + each page's box.
function onUploadFile(input){
  var file = input && input.files && input.files[0];
  uploadPdfBase64 = null; uploadFilename = ''; uploadPages = [];
  fillUploadPages(); syncUploadPlacement();
  if(!file){ setStatus('No file selected.'); var m0 = uEl('upload-meta'); if(m0) m0.textContent = 'No file selected.'; return; }
  uploadFilename = file.name || 'document.pdf';
  setStatus('Inspecting PDF…');
  var reader = new FileReader();
  reader.onerror = function(){ setStatus('Could not read the file.', true); };
  reader.onload = function(){
    var res = String(reader.result || '');
    var comma = res.indexOf(',');
    uploadPdfBase64 = comma >= 0 ? res.slice(comma + 1) : res;
    api('/api/uploads/inspect', {pdfBase64: uploadPdfBase64})
      .then(function(j){
        uploadPages = (j && j.pages) || [];
        var n = (j && j.pageCount) || uploadPages.length;
        var meta = uEl('upload-meta');
        if(meta) meta.textContent = uploadFilename + ' — ' + n + (n === 1 ? ' page' : ' pages');
        setStatus('Inspected ' + uploadFilename + ' (' + n + (n === 1 ? ' page).' : ' pages).'));
        fillUploadPages();
        syncUploadPlacement();
        placeBoxDefault();
      })
      .catch(function(e){
        uploadPdfBase64 = null; uploadPages = [];
        var meta2 = uEl('upload-meta'); if(meta2) meta2.textContent = 'Could not inspect this PDF.';
        syncUploadPlacement();
        setStatus('Inspect failed: ' + e.message, true);
      });
  };
  reader.readAsDataURL(file);
}
// Preview the REAL stamped result (placeholder id) via the shared blob viewer.
function previewUpload(){
  if(!uploadPdfBase64){ setStatus('Choose a PDF first.', true); return; }
  var host = uEl('upload-preview-host');
  var place = placingSignature() ? uploadPlacement() : null;
  var payload = {pdfBase64: uploadPdfBase64, placeHandwrittenSignature: placingSignature()};
  if(place) payload.signaturePlacement = place;
  return blobPreview('/api/uploads/preview', payload, host, 'Exact stamped PDF preview');
}
// Sign & download. /api/uploads does NOT return JSON: it returns the SIGNED PDF
// bytes + the document id in the X-Document-Id response header. So this is a raw
// fetch (api() would JSON-parse and throw); on success read the header, save the
// blob as <id>.pdf, surface the id, and refresh the issued list.
function signUpload(){
  if(!uploadPdfBase64){ setStatus('Choose a PDF first.', true); return; }
  var pwEl = uEl('upload-pw'); var password = pwEl ? pwEl.value : '';
  if(!password || password.length < 8){ setStatus('Enter a download password (at least 8 characters).', true); return; }
  var place = placingSignature() ? uploadPlacement() : null;
  var payload = {
    pdfBase64: uploadPdfBase64, originalFilename: uploadFilename,
    placeHandwrittenSignature: placingSignature(), password: password
  };
  if(place) payload.signaturePlacement = place;
  setStatus('Signing & sealing the document…');
  return fetch('/api/uploads', {
    method:'POST', credentials:'same-origin',
    headers:{'content-type':'application/json'}, body: JSON.stringify(payload)
  }).then(function(r){
    if(!r.ok){
      return r.json().catch(function(){return {};}).then(function(j){
        throw new Error((j && j.error) || ('HTTP ' + r.status));
      });
    }
    var id = r.headers.get('X-Document-Id') || 'document';
    return r.blob().then(function(blob){
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = id + '.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('Signed & downloaded ' + id + '.');
      return refreshList();
    });
  }).catch(function(e){ setStatus('Sign failed: ' + e.message, true); });
}
// --- pointer drag / resize of the signature box (CSSOM only) -----------------
// A small state object tracks an in-flight pointer gesture: 'move' repositions
// the box, 'resize' grows/shrinks its width (height follows the sig aspect).
var uDrag = null;
function uploadPointerDown(ev){
  var box = uEl('upload-sigbox'), stage = uEl('upload-stage');
  if(!box || !stage) return;
  var onResize = ev.target && ev.target.closest && ev.target.closest('#upload-resize');
  var onBox = ev.target && ev.target.closest && ev.target.closest('#upload-sigbox');
  if(!onBox && !onResize) return;
  ev.preventDefault();
  var rect = stage.getBoundingClientRect();
  uDrag = {
    mode: onResize ? 'resize' : 'move',
    pointerId: ev.pointerId,
    stageW: stage.clientWidth, stageH: stage.clientHeight,
    rectLeft: rect.left, rectTop: rect.top,
    grabX: ev.clientX - rect.left - box.offsetLeft,
    grabY: ev.clientY - rect.top - box.offsetTop
  };
  try{ box.setPointerCapture(ev.pointerId); }catch(e){}
  try{ box.focus(); }catch(e){}
}
function uploadPointerMove(ev){
  if(!uDrag) return;
  var box = uEl('upload-sigbox'); if(!box) return;
  ev.preventDefault();
  var sw = uDrag.stageW, sh = uDrag.stageH;
  var px = ev.clientX - uDrag.rectLeft, py = ev.clientY - uDrag.rectTop;
  if(uDrag.mode === 'move'){
    var bw = box.offsetWidth, bh = box.offsetHeight;
    box.style.left = clampNum(px - uDrag.grabX, 0, Math.max(0, sw - bw)) + 'px';
    box.style.top = clampNum(py - uDrag.grabY, 0, Math.max(0, sh - bh)) + 'px';
  } else {
    var left = box.offsetLeft, top = box.offsetTop;
    var maxW = sw - left;
    var newW = clampNum(px - left, sw * 0.02, maxW);
    var newH = newW * sigAspect();
    if(newH > sh - top){ newH = sh - top; newW = newH / sigAspect(); }
    box.style.width = newW + 'px';
    box.style.height = newH + 'px';
  }
}
function uploadPointerUp(ev){
  if(!uDrag) return;
  var box = uEl('upload-sigbox');
  try{ if(box) box.releasePointerCapture(uDrag.pointerId); }catch(e){}
  uDrag = null;
}
// Keyboard: arrows move (Shift+arrows resize width). Steps are a few px; the box
// is re-clamped inside the stage after each step.
function uploadBoxKeydown(ev){
  var box = uEl('upload-sigbox'), stage = uEl('upload-stage');
  if(!box || !stage) return;
  var key = ev.key;
  if(key!=='ArrowLeft' && key!=='ArrowRight' && key!=='ArrowUp' && key!=='ArrowDown') return;
  ev.preventDefault();
  var sw = stage.clientWidth, sh = stage.clientHeight;
  var step = ev.shiftKey ? 6 : 4;
  if(ev.shiftKey){
    var bw = box.offsetWidth;
    if(key==='ArrowRight' || key==='ArrowUp') bw += step;
    else bw -= step;
    bw = clampNum(bw, sw * 0.02, sw);
    var bh = bw * sigAspect();
    if(bh > sh){ bh = sh; bw = bh / sigAspect(); }
    box.style.width = bw + 'px';
    box.style.height = bh + 'px';
  } else {
    var w = box.offsetWidth, h = box.offsetHeight;
    var left = box.offsetLeft, top = box.offsetTop;
    if(key==='ArrowLeft') left -= step;
    else if(key==='ArrowRight') left += step;
    else if(key==='ArrowUp') top -= step;
    else if(key==='ArrowDown') top += step;
    box.style.left = clampNum(left, 0, Math.max(0, sw - w)) + 'px';
    box.style.top = clampNum(top, 0, Math.max(0, sh - h)) + 'px';
  }
  reclampBox();
}
(function wireUpload(){
  var form = uEl('upload-form'); if(!form) return;
  var file = uEl('upload-file');
  if(file) file.addEventListener('change', function(ev){ onUploadFile(ev.target); });
  var place = uEl('upload-place');
  if(place) place.addEventListener('change', function(){ syncUploadPlacement(); placeBoxDefault(); });
  var pageSel = uEl('upload-page');
  if(pageSel) pageSel.addEventListener('change', function(){ sizeStage(); placeBoxDefault(); });
  var box = uEl('upload-sigbox');
  if(box){
    box.addEventListener('pointerdown', uploadPointerDown);
    box.addEventListener('pointermove', uploadPointerMove);
    box.addEventListener('pointerup', uploadPointerUp);
    box.addEventListener('pointercancel', uploadPointerUp);
    box.addEventListener('keydown', uploadBoxKeydown);
  }
  // Re-size the keyed image once it loads (natural aspect now known) + on submit.
  var img = uEl('upload-sigimg');
  if(img) img.addEventListener('load', function(){ if(placingSignature()){ reclampBox(); } });
  form.addEventListener('submit', function(ev){ ev.preventDefault(); signUpload(); });
})();

// Initial list load on the dashboard.
if(document.getElementById('cred-rows')) refreshList();
})();`;
}
