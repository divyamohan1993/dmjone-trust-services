/**
 * The single inline, nonce'd, dependency-free admin script.
 *
 * It drives the WebAuthn ceremonies via the raw `navigator.credentials` API
 * (no @simplewebauthn/browser, no CDN) and talks to the `/api/auth` +
 * `/api/credentials` JSON endpoints. Returned as a plain string so the layout
 * can inline it under the request's CSP nonce. Kept framework-free and small;
 * it manipulates the DOM the server rendered and never holds a secret.
 */

export function adminScript(): string {
  // NB: authored as a template string. Avoid backticks inside; use string
  // concatenation. Everything is wrapped in an IIFE to avoid globals.
  return `(function(){
"use strict";
var statusEl = document.getElementById('status');
function setStatus(msg, isError){
  if(!statusEl) return;
  statusEl.textContent = msg || '';
  statusEl.setAttribute('role', isError ? 'alert' : 'status');
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
function issue(form){
  var data = new FormData(form);
  var bodyParagraphs = String(data.get('bodyParagraphs')||'').split('\\n')
    .map(function(s){return s.trim();}).filter(Boolean);
  var payload = {
    type: data.get('type'), recipientName: data.get('recipientName'),
    kicker: data.get('kicker'), title: data.get('title'), intro: data.get('intro'),
    bodyParagraphs: bodyParagraphs, issueDate: data.get('issueDate'),
    password: data.get('password')
  };
  var closing = String(data.get('closingLine')||'').trim();
  if(closing) payload.closingLine = closing;
  setStatus('Issuing…');
  return api('/api/credentials', payload)
    .then(function(j){ setStatus('Issued '+j.credentialId+'.'); form.reset(); return refreshList(); })
    .catch(function(e){ setStatus('Issue failed: '+e.message, true); });
}
function revoke(id){
  if(!id) return;
  setStatus('Revoking '+id+'…');
  return api('/api/credentials/'+encodeURIComponent(id)+'/revoke', {reason:'revoked from admin UI'})
    .then(function(){ setStatus('Revoked '+id+'.'); return refreshList(); })
    .catch(function(e){ setStatus('Revoke failed: '+e.message, true); });
}
// Wire up clicks (event delegation; no inline handlers → CSP-clean).
document.addEventListener('click', function(ev){
  var t = ev.target; if(!(t instanceof Element)) return;
  var revokeId = t.getAttribute('data-revoke'); if(revokeId){ ev.preventDefault(); revoke(revokeId); return; }
  var action = t.getAttribute('data-action'); if(!action) return;
  ev.preventDefault();
  if(action==='login') login();
  else if(action==='register') register((document.getElementById('pk-label')||{}).value||'primary');
  else if(action==='add-passkey') register('additional');
  else if(action==='recover') recover();
  else if(action==='refresh-list') refreshList();
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
