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
var MAX_PARAS = 6, MIN_PARAS = 1;
var ALIGNS = ['left','center','right','justify'];
var ALIGN_LABEL = {left:'Align left', center:'Align center', right:'Align right', justify:'Justify'};
var activePara = null; // the most-recently-focused .para-edit (mousedown on a
                       // toolbar button must NOT change this — see preventDefault).

function editorRoot(){ return document.getElementById('body-editor'); }
function paraEdits(){ var r = editorRoot(); return r ? r.querySelectorAll('.para-edit') : []; }
function markToolbar(){ return document.querySelector('.mark-toolbar'); }

// Serialise every paragraph block to bodyParagraphs[] via the trust boundary.
// One .para-block = one element; align comes from the pressed alignment button.
function collectBody(){
  var r = editorRoot(); if(!r) return [];
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
// Reflect the current selection's marks on the toolbar (aria-pressed), live.
function syncMarkPressed(){
  var tb = markToolbar(); if(!tb) return;
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

// --- add / remove paragraph blocks (respect the 1..6 bound). New blocks mirror
// the server-rendered paragraphBlock() structure exactly.
function buildBlock(index){
  var block = document.createElement('div'); block.className = 'para-block';
  var edit = document.createElement('div');
  edit.className = 'para-edit pa-justify'; edit.setAttribute('contenteditable','true');
  edit.setAttribute('role','textbox'); edit.setAttribute('aria-multiline','true');
  edit.setAttribute('aria-label','Certificate body paragraph '+index);
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
function relabelBlocks(){
  var r = editorRoot(); if(!r) return;
  var blocks = r.querySelectorAll('.para-block');
  for(var i=0;i<blocks.length;i++){
    var n = i+1;
    var edit = blocks[i].querySelector('.para-edit');
    if(edit) edit.setAttribute('aria-label','Certificate body paragraph '+n);
    var tools = blocks[i].querySelector('.para-tools');
    if(tools) tools.setAttribute('aria-label','Paragraph '+n+' alignment');
    var rm = blocks[i].querySelector('.para-rm');
    if(rm) rm.setAttribute('aria-label','Remove paragraph '+n);
  }
}
function addPara(){
  var r = editorRoot(); if(!r) return;
  var count = r.querySelectorAll('.para-block').length;
  if(count >= MAX_PARAS){ setStatus('A certificate body allows at most '+MAX_PARAS+' paragraphs.', true); return; }
  var block = buildBlock(count+1); r.appendChild(block);
  relabelBlocks();
  var edit = block.querySelector('.para-edit'); if(edit){ activePara = edit; edit.focus(); }
}
function removePara(btn){
  var r = editorRoot(); if(!r) return;
  var block = btn.closest ? btn.closest('.para-block') : null; if(!block) return;
  var count = r.querySelectorAll('.para-block').length;
  if(count <= MIN_PARAS){ setStatus('A certificate body needs at least one paragraph.', true); return; }
  if(activePara && block.contains(activePara)) activePara = null;
  r.removeChild(block); relabelBlocks();
}
function resetEditor(){
  var r = editorRoot(); if(!r) return;
  while(r.firstChild) r.removeChild(r.firstChild);
  var block = buildBlock(1); r.appendChild(block); activePara = null;
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

// --- exact-PDF preview: serialise -> POST /api/credentials/preview -> blob ->
// same-origin blob: iframe (frame-src 'self' blob:). Revoke the URL on replace.
var previewUrl = null;
function clearPreview(){
  var host = document.getElementById('preview-host'); if(host){ while(host.firstChild) host.removeChild(host.firstChild); }
  if(previewUrl){ try{ URL.revokeObjectURL(previewUrl); }catch(e){} previewUrl = null; }
}
function preview(){
  var form = document.getElementById('issue-form'); if(!form) return;
  setStatus('Rendering exact preview…');
  var payload = buildPayload(form, false);
  return fetch('/api/credentials/preview', {
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
    clearPreview();
    previewUrl = URL.createObjectURL(blob);
    var host = document.getElementById('preview-host'); if(!host) return;
    var frame = document.createElement('iframe');
    frame.className = 'preview-frame'; frame.setAttribute('title','Exact certificate preview');
    frame.src = previewUrl; host.appendChild(frame);
    setStatus('Preview ready — this is the exact PDF that would be issued.');
  }).catch(function(e){ setStatus('Preview failed: '+e.message, true); });
}

// --- roving tabindex for the B/I/U toolbar (WCAG 2.2 AA: arrow-key navigation).
function toolbarRove(ev){
  var tb = markToolbar(); if(!tb) return;
  var key = ev.key;
  if(key!=='ArrowLeft' && key!=='ArrowRight' && key!=='Home' && key!=='End') return;
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
  // Keep B/I/U pressed-state synced to the live selection.
  document.addEventListener('selectionchange', syncMarkPressed);
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
  else if(action==='add-para') addPara();
  else if(action==='remove-para') removePara(actionEl);
  else if(action==='preview') preview();
  else if(action==='logout') api('/api/auth/logout',{}).then(function(){location.reload();});
  else if(action==='totp-enroll') api('/api/auth/totp/enroll',{}).then(out).catch(function(e){setStatus(e.message,true);});
  else if(action==='recovery-gen') api('/api/auth/recovery/generate',{}).then(out).catch(function(e){setStatus(e.message,true);});
});
var issueForm = document.getElementById('issue-form');
if(issueForm) issueForm.addEventListener('submit', function(ev){ ev.preventDefault(); issue(issueForm); });
// Initial list load on the dashboard.
if(document.getElementById('cred-rows')) refreshList();
})();`;
}
