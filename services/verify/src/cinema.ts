/**
 * The verify portal's client-side "cinema engine", shipped as ONE cacheable,
 * same-origin classic script (no modules, no dependencies, no CDN — the strict
 * `script-src 'self' 'nonce-…'` CSP stays untouched because the file is served
 * from OUR origin by `GET /assets/cinema-<hash>.js`).
 *
 * Everything interactive on the public verify surface lives here:
 *
 *   1. THE STAGE — a fixed, aria-hidden canvas behind the content: a quantum
 *      field of BINARY GLYPHS (a "0"/"1" atlas both backends sample) moved by
 *      real force physics (drift field, vortex swirl, spring convergence,
 *      drag, shock impulses), rendered by WebGPU (WGSL compute, ~5k glyphs)
 *      when available, by WebGL2 (CPU-integrated ~3k sprites) otherwise, and
 *      by NOTHING when even that is unavailable (the CSS aurora fallback
 *      takes over). One uniform "mode" contract (ambient/rite/triumph/aura/
 *      embers/fog) drives both backends; during the rite the document's
 *      bytes visibly spiral INTO the verdict to be read.
 *   2. THE CHOREOGRAPHY — the live re-verification rite: the real fetch to
 *      /api/verify/:id (or /api/verify/file) paced with a minimum beat, the
 *      check-constellation ignition, and the verdict strike (seal + shockwave
 *      on VALID; embers on revoked/tampered). The DOM is the source of truth:
 *      this script only re-paints states the server computed — it never
 *      invents a verdict, and the gold seal is revealed ONLY on a live VALID
 *      confirmation (`.verdict.valid.sealed`), exactly the existing contract.
 *   3. THE TEXTURE — pointer spotlight, magnetic buttons, 3D identity tilt,
 *      verdict letter-split, scroll-driven chapter fallbacks (IntersectionObserver
 *      where CSS scroll-timelines are unsupported), and the password-gated
 *      download + file-gate wiring (same endpoints as before).
 *
 * Honesty + accessibility are load-bearing here:
 *   - prefers-reduced-motion (or Save-Data) disables the engine AND all paced
 *     choreography: results paint instantly, nothing moves, the page is final.
 *   - The canvas is decorative (aria-hidden, pointer-events:none); every state
 *     it dramatises is simultaneously carried by SSR'd text + classes.
 *   - On any GPU/init/fetch failure the page falls back to the server-rendered
 *     truth — the show degrades, the verdict never does.
 *
 * The source is a hand-minified-style but READABLE IIFE; it compresses well and
 * needs no build step (this string IS the artifact, hashed for the immutable
 * asset URL).
 */

import { createHash } from 'node:crypto';

/** The client engine source. Served verbatim as application/javascript. */
export const CINEMA_JS: string = String.raw`/* dmj.one verify — cinema engine. No deps. WebGPU → WebGL2 → CSS. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement, body = doc.body;
  var page = body.getAttribute("data-page") || "credential";
  var reduceMotion = false, saveData = false;
  try {
    reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var conn = navigator.connection || navigator.webkitConnection;
    saveData = !!(conn && conn.saveData);
  } catch (e) {}
  var still = reduceMotion || saveData;           // "still" = no engine, no paced beats
  body.classList.add("js");
  if (still) body.classList.add("still");

  /* ─────────────────────────── tiny utilities ─────────────────────────── */
  function $(id) { return doc.getElementById(id); }
  function on(el, t, f, o) { if (el) el.addEventListener(t, f, o || false); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function now() { return performance.now(); }
  function raf(f) { return requestAnimationFrame(f); }

  /* ════════════════════════════ THE STAGE ════════════════════════════════
     One particle field, two backends, one contract:
       stage.setMode(name [,hard])  ambient|rite|triumph|aura|embers|fog
       stage.setFocus(x,y)          element-relative focus (CSS px)
       stage.pulse(x,y,amp)         shockwave ring from a point (CSS px)
       stage.setPointer(x,y,active) live pointer (CSS px)
       stage.setChapter(f)          0..1 scroll-depth flavour blend
     Coordinates convert to a world where y∈[-1.1,1.1], x scaled by aspect.  */
  /* hue channel: 0 byte-ink (the neutral quantum field) · 1 alarm-red ink ·
     2 pale fog ink · 3 scan blue (the impartial examination — bytes being
     READ) · 4 gold ink (earned, triumph only). On the light stage particles
     are INK ON PAPER: higher k = denser, darker ink. */
  /* index 9 = TEXT SAFE-ZONE strength: how strongly the field parts around
     the focus (the verdict text) so type stays effortlessly readable. The
     triumph beat relaxes it — the gold floods the seal at the strike. */
  var MODES = {
    /*            drift swirl conv  grav  flowX flowY speed fade  hue  safe */
    ambient:   [0.140, 0.10, 0.000, 0.00, 0.010, 0.014, 0.60, 1.00, 0.0, 0.78],
    /* the rite is a VORTEX: the document's bytes visibly spiral in to be read */
    rite:      [0.050, 0.70, 0.500, 0.00, 0.000, 0.000, 1.15, 1.00, 3.0, 0.80],
    triumph:   [0.050, 0.85, 0.900, 0.00, 0.000, 0.000, 1.35, 1.00, 4.0, 0.15],
    aura:      [0.090, 0.40, 0.160, 0.00, 0.000, 0.008, 0.70, 1.00, 4.0, 0.40],
    embers:    [0.060, 0.04, 0.000, 0.42, 0.000, 0.000, 0.55, 0.85, 1.0, 0.72],
    fog:       [0.060, 0.03, 0.000, 0.00, 0.012, 0.004, 0.35, 0.60, 2.0, 0.78]
  };
  /* ink ramps lo/mi/hi per hue index (far/faint → near/dense). The LIVE ramp
     crossfades between these in RGB on mode change — never through a scalar
     hue (a scalar lerp would sweep through unrelated hues mid-transition). */
  var RAMP_TABLE = [
    [[0.55, 0.62, 0.72], [0.32, 0.43, 0.60], [0.13, 0.31, 0.55]],
    [[0.78, 0.45, 0.45], [0.69, 0.23, 0.25], [0.55, 0.10, 0.13]],
    [[0.68, 0.72, 0.78], [0.55, 0.60, 0.68], [0.45, 0.50, 0.60]],
    [[0.45, 0.60, 0.78], [0.24, 0.43, 0.68], [0.11, 0.31, 0.55]],
    [[0.80, 0.66, 0.36], [0.66, 0.50, 0.13], [0.48, 0.35, 0.07]]
  ];
  /* the BYTES themselves: a tiny glyph atlas ("0" | "1") both GPU backends
     sample, so the field literally is binary being examined. */
  function makeGlyphAtlas() {
    var c = doc.createElement("canvas");
    c.width = 128; c.height = 64;
    var g = c.getContext("2d");
    if (!g) return null;
    g.clearRect(0, 0, 128, 64);
    g.fillStyle = "#fff";
    g.font = "600 46px Georgia, 'Times New Roman', serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("0", 32, 35);
    g.fillText("1", 96, 35);
    return c;
  }
  function makeStage(canvas) {
    if (!canvas || still) return null;
    var aspect = 1, W = 0, H = 0, dpr = 1;
    var cur = MODES.ambient.slice(), tgt = MODES.ambient.slice();
    var curRamp = [], tgtRamp = [];
    (function () {
      for (var r = 0; r < 3; r++) { curRamp.push(RAMP_TABLE[0][r].slice()); tgtRamp.push(RAMP_TABLE[0][r].slice()); }
    })();
    var focus = { x: 0, y: 0.12 }, pointer = { x: 0, y: 0, on: 0 };
    var shock = { x: 0, y: 0, t: -9, amp: 0 };
    var chapter = 0, running = false, t0 = now() / 1000, last = t0;
    var frameAvg = 16, budget = 1;   // budget scales live particle count down under load

    function px2world(x, y) {
      return { x: ((x / W) * 2 - 1) * aspect, y: -((y / H) * 2 - 1) };
    }
    function setMode(name, hard) {
      var m = MODES[name] || MODES.ambient;
      tgt = m.slice();
      var ramp = RAMP_TABLE[m[8] | 0] || RAMP_TABLE[0];
      for (var r = 0; r < 3; r++) tgtRamp[r] = ramp[r].slice();
      if (hard) {
        cur = m.slice();
        for (var q = 0; q < 3; q++) curRamp[q] = ramp[q].slice();
      }
    }
    function setFocus(x, y) { var p = px2world(x, y); focus.x = p.x; focus.y = p.y; }
    function setPointer(x, y, on) { var p = px2world(x, y); pointer.x = p.x; pointer.y = p.y; pointer.on = on ? 1 : 0; }
    function pulse(x, y, amp) { var p = px2world(x, y); shock.x = p.x; shock.y = p.y; shock.t = now() / 1000 - t0; shock.amp = amp || 1; }
    function setChapter(f) { chapter = clamp(f, 0, 1); }

    function frameTick(dt) {
      frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05;
      if (frameAvg > 26 && budget > 0.25) { budget *= 0.7; frameAvg = 16; }
      var k = 1 - Math.pow(0.0001, dt);          // exponential approach, fps-independent
      for (var i = 0; i < 10; i++) { if (i !== 8) cur[i] = lerp(cur[i], tgt[i], k); }
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) curRamp[r][c] = lerp(curRamp[r][c], tgtRamp[r][c], k);
    }

    /* ---------- WebGPU backend (compute + instanced glyph quads, WGSL) ---- */
    function tryWebGPU() {
      if (!navigator.gpu) return Promise.resolve(null);
      var N = 5200;
      if ((navigator.deviceMemory || 8) < 4 || (navigator.hardwareConcurrency || 8) < 4) N = 2600;
      var atlas = makeGlyphAtlas();
      if (!atlas) return Promise.resolve(null);
      return navigator.gpu.requestAdapter({ powerPreference: "low-power" }).then(function (ad) {
        if (!ad) return null;
        return ad.requestDevice().then(function (device) {
          var ctx = canvas.getContext("webgpu");
          if (!ctx) return null;
          var format = navigator.gpu.getPreferredCanvasFormat();
          ctx.configure({ device: device, format: format, alphaMode: "premultiplied" });
          var tex = device.createTexture({ size: [128, 64], format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
          device.queue.copyExternalImageToTexture({ source: atlas }, { texture: tex }, [128, 64]);
          var smp = device.createSampler({ magFilter: "linear", minFilter: "linear" });
          var pbuf = device.createBuffer({ size: N * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
          var seed = new Float32Array(N * 8);
          for (var i = 0; i < N; i++) {
            var o = i * 8;
            seed[o] = (Math.random() * 2 - 1) * 2.2;          // a.x position
            seed[o + 1] = (Math.random() * 2 - 1) * 1.25;     // a.y position
            seed[o + 2] = Math.random();                       // a.z depth 0..1
            seed[o + 3] = Math.random() * 6.283;               // a.w seed phase
            seed[o + 4] = 0; seed[o + 5] = 0;                  // b.xy velocity
            seed[o + 6] = 0.55 + Math.random() * 0.9;          // b.z size (preserved by cs)
            seed[o + 7] = 0;                                   // b.w energy (cs-written)
          }
          device.queue.writeBuffer(pbuf, 0, seed);
          var ubuf = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
          var wgsl = ""
            + "struct P { a: vec4f, b: vec4f };\n"
            + "struct U { ta: vec4f, pf: vec4f, sh: vec4f, m1: vec4f, m2: vec4f, lo: vec4f, mi: vec4f, hi: vec4f };\n"
            /* the SAME buffer is bound read_write for compute and read-only for
               the vertex stage (vertex shaders may not use read_write storage). */
            + "@group(0) @binding(0) var<storage, read_write> ps: array<P>;\n"
            + "@group(0) @binding(2) var<storage, read> psr: array<P>;\n"
            + "@group(0) @binding(1) var<uniform> u: U;\n"
            + "fn h21(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }\n"
            + "@compute @workgroup_size(64)\n"
            + "fn cs(@builtin(global_invocation_id) gid: vec3u) {\n"
            + "  let i = gid.x; if (i >= arrayLength(&ps)) { return; }\n"
            + "  var p = ps[i];\n"
            + "  let t = u.ta.x; let dt = u.ta.y; let aspect = u.ta.z;\n"
            + "  let drift = u.m1.x; let swirl = u.m1.y; let conv = u.m1.z; let grav = u.m1.w;\n"
            + "  let flow = vec2f(u.m2.x, u.m2.y); let speed = u.m2.z;\n"
            + "  let s = p.a.w;\n"
            + "  var acc = vec2f(\n"
            + "    sin(p.a.y * 2.1 + t * 0.62 + s) + 0.6 * sin(p.a.y * 5.3 - t * 0.21 + s * 2.0),\n"
            + "    cos(p.a.x * 1.7 - t * 0.47 + s * 1.7) + 0.6 * cos(p.a.x * 4.1 + t * 0.17 + s)\n"
            + "  ) * drift + flow;\n"
            + "  let f = vec2f(u.pf.x, u.pf.y);\n"
            + "  let d = p.a.xy - f; let r = max(length(d), 0.04);\n"
            + "  let fall = smoothstep(1.5, 0.0, r);\n"
            + "  acc += vec2f(-d.y, d.x) / r * swirl * fall;\n"
            + "  acc += -d * conv * smoothstep(2.2, 0.0, r);\n"
            + "  acc.y -= grav;\n"
            + "  let pp = vec2f(u.pf.z, u.pf.w);\n"
            + "  let pd = p.a.xy - pp; let pr = length(pd);\n"
            + "  if (u.ta.w > 0.5 && pr < 0.45 && pr > 0.001) { acc += (pd / pr) * 0.9 * exp(-pr * pr * 14.0); }\n"
            + "  let sd = p.a.xy - vec2f(u.sh.x, u.sh.y); let sr = length(sd);\n"
            + "  let age = u.sh.z;\n"
            + "  if (age >= 0.0 && age < 1.1 && sr > 0.001) {\n"
            + "    let ring = age * 2.4;\n"
            + "    acc += (sd / sr) * u.sh.w * 3.2 * exp(-pow((sr - ring) * 7.0, 2.0)) * (1.0 - age * 0.85);\n"
            + "  }\n"
            + "  var v = (p.b.xy + acc * dt) * pow(0.12, dt);\n"
            + "  var pos = p.a.xy + v * dt * speed;\n"
            + "  let bx = aspect * 1.15 + 0.1;\n"
            + "  if (pos.x > bx) { pos.x = -bx; } if (pos.x < -bx) { pos.x = bx; }\n"
            + "  if (pos.y > 1.22) { pos.y = -1.22; } if (pos.y < -1.22) { pos.y = 1.22; pos.x = (h21(vec2f(s, t)) * 2.0 - 1.0) * bx; }\n"
            + "  p.a = vec4f(pos, p.a.z, p.a.w);\n"
            + "  p.b = vec4f(v, p.b.z, clamp(length(v) * 2.2, 0.0, 1.0));\n"
            + "  ps[i] = p;\n"
            + "}\n"
            + "struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f, @location(2) gl: f32 };\n"
            + "@group(0) @binding(3) var glyphTex: texture_2d<f32>;\n"
            + "@group(0) @binding(4) var glyphSmp: sampler;\n"
            + "@vertex\n"
            + "fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {\n"
            + "  var corner = array<vec2f, 6>(vec2f(-1.0,-1.0), vec2f(1.0,-1.0), vec2f(-1.0,1.0), vec2f(-1.0,1.0), vec2f(1.0,-1.0), vec2f(1.0,1.0));\n"
            + "  let p = psr[ii];\n"
            + "  let aspect = u.ta.z;\n"
            + "  let z = p.a.z; let energy = p.b.w;\n"
            + "  let sz = (0.0034 + z * 0.0095) * p.b.z;\n"
            + "  let c = corner[vi];\n"
            + "  let world = p.a.xy + c * sz * vec2f(1.0, aspect);\n"
            + "  let fade = u.m2.w;\n"
            + "  let fd = distance(p.a.xy, vec2f(u.pf.x, u.pf.y));\n"
            + "  let safe = 1.0 - u.lo.w * (1.0 - smoothstep(0.12, 0.95, fd));\n"
            + "  let k = clamp(z * 0.62 + energy * 0.55, 0.0, 1.0) * safe;\n"
            + "  var col = mix(u.lo.xyz, u.mi.xyz, smoothstep(0.0, 0.62, k));\n"
            + "  col = mix(col, u.hi.xyz, smoothstep(0.62, 1.0, k));\n"
            + "  let alpha = (0.09 + 0.6 * k * k) * fade;\n"
            + "  var o: VOut;\n"
            + "  o.pos = vec4f(world.x / aspect, world.y, 0.0, 1.0);\n"
            + "  o.uv = c;\n"
            + "  o.col = vec4f(col, alpha);\n"
            + "  o.gl = select(0.0, 1.0, fract(p.a.w * 1.7) > 0.5);\n"
            + "  return o;\n"
            + "}\n"
            + "@fragment\n"
            + "fn fs(inp: VOut) -> @location(0) vec4f {\n"
            + "  let uvx = (inp.gl + (inp.uv.x * 0.5 + 0.5)) * 0.5;\n"
            + "  let uvy = 0.5 - inp.uv.y * 0.5;\n"
            + "  let a = textureSample(glyphTex, glyphSmp, vec2f(uvx, uvy)).a * inp.col.a;\n"
            + "  return vec4f(inp.col.rgb * a, a);\n"
            + "}\n";
          var mod = device.createShaderModule({ code: wgsl });
          // Async creation REJECTS on invalid WGSL/pipeline state (the sync
          // variants just mint invalid objects that warn-spam every submit), so
          // any validation failure here falls through to the WebGL2 backend.
          return Promise.all([
            device.createComputePipelineAsync({ layout: "auto", compute: { module: mod, entryPoint: "cs" } }),
            device.createRenderPipelineAsync({
              layout: "auto",
              vertex: { module: mod, entryPoint: "vs" },
              fragment: {
                module: mod, entryPoint: "fs",
                targets: [{ format: format, blend: {
                  color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
                  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
                } }]
              },
              primitive: { topology: "triangle-list" }
            })
          ]).then(function (pipes) { return makeApi(pipes[0], pipes[1]); }, function () { return null; });

          function makeApi(cpipe, rpipe) {
          var cbind = device.createBindGroup({ layout: cpipe.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: pbuf } }, { binding: 1, resource: { buffer: ubuf } }] });
          var rbind = device.createBindGroup({ layout: rpipe.getBindGroupLayout(0), entries: [
            { binding: 2, resource: { buffer: pbuf } }, { binding: 1, resource: { buffer: ubuf } },
            { binding: 3, resource: tex.createView() }, { binding: 4, resource: smp }] });
          var uarr = new Float32Array(32);
          device.lost.then(function () { api.dead = true; body.classList.remove("gpu-webgpu"); body.classList.add("gpu-none"); });
          // Any uncaptured validation error after init: kill the stage quietly
          // (a beautiful static page beats a console firehose).
          device.addEventListener && device.addEventListener("uncapturederror", function () { api.dead = true; });
          var api = {
            kind: "webgpu", dead: false,
            draw: function (t, dt) {
              uarr[0] = t; uarr[1] = Math.min(dt, 0.05); uarr[2] = aspect; uarr[3] = pointer.on;
              uarr[4] = focus.x; uarr[5] = focus.y; uarr[6] = pointer.x; uarr[7] = pointer.y;
              uarr[8] = shock.x; uarr[9] = shock.y; uarr[10] = t - shock.t; uarr[11] = shock.amp;
              uarr[12] = cur[0]; uarr[13] = cur[1]; uarr[14] = cur[2]; uarr[15] = cur[3];
              uarr[16] = cur[4] + chapter * 0.05; uarr[17] = cur[5]; uarr[18] = cur[6]; uarr[19] = cur[7];
              uarr[20] = curRamp[0][0]; uarr[21] = curRamp[0][1]; uarr[22] = curRamp[0][2]; uarr[23] = cur[9];
              uarr[24] = curRamp[1][0]; uarr[25] = curRamp[1][1]; uarr[26] = curRamp[1][2]; uarr[27] = 0;
              uarr[28] = curRamp[2][0]; uarr[29] = curRamp[2][1]; uarr[30] = curRamp[2][2]; uarr[31] = 0;
              device.queue.writeBuffer(ubuf, 0, uarr);
              var enc = device.createCommandEncoder();
              var cp = enc.beginComputePass();
              cp.setPipeline(cpipe); cp.setBindGroup(0, cbind);
              cp.dispatchWorkgroups(Math.ceil(N * budget / 64));
              cp.end();
              var view = ctx.getCurrentTexture().createView();
              var rp = enc.beginRenderPass({ colorAttachments: [{ view: view, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }] });
              rp.setPipeline(rpipe); rp.setBindGroup(0, rbind);
              rp.draw(6, Math.floor(N * budget));
              rp.end();
              device.queue.submit([enc.finish()]);
            },
            size: function () { /* webgpu context tracks canvas w/h automatically */ }
          };
          return api;
          }
        });
      }).catch(function () { return null; });
    }

    /* ---------- WebGL2 backend (CPU sim, glyph point sprites) ---------- */
    function tryWebGL2() {
      var gl = null;
      try { gl = canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false, powerPreference: "low-power" }); } catch (e) {}
      if (!gl) return null;
      var atlas = makeGlyphAtlas();
      if (!atlas) return null;
      var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      var N = coarse ? 1700 : 3000;
      var px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
      var vx = new Float32Array(N), vy = new Float32Array(N), sd = new Float32Array(N), sz = new Float32Array(N);
      var glyph = new Float32Array(N);
      for (var i = 0; i < N; i++) {
        px[i] = (Math.random() * 2 - 1) * 2.2; py[i] = (Math.random() * 2 - 1) * 1.25;
        pz[i] = Math.random(); sd[i] = Math.random() * 6.283; sz[i] = 0.6 + Math.random() * 0.95;
        glyph[i] = Math.random() > 0.5 ? 1 : 0;
      }
      var attr = new Float32Array(N * 4); // x, y, size (sign carries the glyph), k
      var vsrc = "#version 300 es\nprecision highp float;\n"
        + "layout(location=0) in vec4 a;\nuniform float uAspect;\nuniform float uDpr;\nuniform float uH;\nout float vK;\nout float vG;\n"
        + "void main(){ gl_Position = vec4(a.x/uAspect, a.y, 0.0, 1.0); vK = a.w;\n"
        + "  vG = a.z < 0.0 ? 1.0 : 0.0;\n"
        + "  gl_PointSize = clamp(abs(a.z) * 0.0045 * uH, 2.0, 13.0 * uDpr); }";
      var fsrc = "#version 300 es\nprecision mediump float;\nin float vK;\nin float vG;\nuniform sampler2D uTex;\nuniform vec3 uLo;\nuniform vec3 uMi;\nuniform vec3 uHi;\nuniform float uFade;\nout vec4 o;\n"
        + "void main(){ vec2 uv = vec2((vG + gl_PointCoord.x) * 0.5, gl_PointCoord.y);\n"
        + "  float a = texture(uTex, uv).a * (0.09 + 0.6*vK*vK) * uFade;\n"
        + "  vec3 col = mix(uLo, uMi, smoothstep(0.0,0.62,vK)); col = mix(col, uHi, smoothstep(0.62,1.0,vK));\n"
        + "  o = vec4(col*a, a); }";
      function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { return null; } return s; }
      var vsh = sh(gl.VERTEX_SHADER, vsrc), fsh = sh(gl.FRAGMENT_SHADER, fsrc);
      if (!vsh || !fsh) return null;
      var prog = gl.createProgram();
      gl.attachShader(prog, vsh); gl.attachShader(prog, fsh); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      gl.useProgram(prog);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, attr.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      var uA = gl.getUniformLocation(prog, "uAspect"), uD = gl.getUniformLocation(prog, "uDpr"),
          uH = gl.getUniformLocation(prog, "uH"), uF = gl.getUniformLocation(prog, "uFade"),
          uLo = gl.getUniformLocation(prog, "uLo"), uMi = gl.getUniformLocation(prog, "uMi"), uHi = gl.getUniformLocation(prog, "uHi"),
          uT = gl.getUniformLocation(prog, "uTex");
      var texObj = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texObj);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(uT, 0);
      var lost = false;
      canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); lost = true; api.dead = true; }, false);
      var api = {
        kind: "webgl2", dead: false,
        draw: function (t, dt) {
          if (lost) return;
          dt = Math.min(dt, 0.05);
          var drift = cur[0], swirl = cur[1], conv = cur[2], grav = cur[3],
              fx = cur[4] + chapter * 0.05, fy = cur[5], speed = cur[6], fade = cur[7],
              safeAmp = cur[9];
          var live = Math.floor(N * budget);
          var damp = Math.pow(0.12, dt);
          var bx = aspect * 1.15 + 0.1;
          var age = t - shock.t;
          for (var i = 0; i < live; i++) {
            var s = sd[i], x = px[i], y = py[i];
            var ax = (Math.sin(y * 2.1 + t * 0.62 + s) + 0.6 * Math.sin(y * 5.3 - t * 0.21 + s * 2)) * drift + fx;
            var ay = (Math.cos(x * 1.7 - t * 0.47 + s * 1.7) + 0.6 * Math.cos(x * 4.1 + t * 0.17 + s)) * drift + fy;
            var dx2 = x - focus.x, dy2 = y - focus.y;
            var r = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 0.04; if (r < 0.04) r = 0.04;
            var fall = r > 1.5 ? 0 : 1 - (r / 1.5); fall *= fall;
            ax += (-dy2 / r) * swirl * fall; ay += (dx2 / r) * swirl * fall;
            var cf = r > 2.2 ? 0 : 1 - r / 2.2;
            ax += -dx2 * conv * cf; ay += -dy2 * conv * cf;
            ay -= grav;
            if (pointer.on) {
              var pdx = x - pointer.x, pdy = y - pointer.y;
              var pr2 = pdx * pdx + pdy * pdy;
              if (pr2 < 0.2 && pr2 > 0.000001) {
                var pr = Math.sqrt(pr2), rep = 0.9 * Math.exp(-pr2 * 14);
                ax += (pdx / pr) * rep; ay += (pdy / pr) * rep;
              }
            }
            if (age >= 0 && age < 1.1) {
              var sdx = x - shock.x, sdy = y - shock.y;
              var sr = Math.sqrt(sdx * sdx + sdy * sdy);
              if (sr > 0.001) {
                var ring = age * 2.4, q = (sr - ring) * 7;
                var imp = shock.amp * 3.2 * Math.exp(-q * q) * (1 - age * 0.85);
                ax += (sdx / sr) * imp; ay += (sdy / sr) * imp;
              }
            }
            var nvx = (vx[i] + ax * dt) * damp, nvy = (vy[i] + ay * dt) * damp;
            x += nvx * dt * speed; y += nvy * dt * speed;
            if (x > bx) x = -bx; else if (x < -bx) x = bx;
            if (y > 1.22) y = -1.22; else if (y < -1.22) { y = 1.22; x = (Math.random() * 2 - 1) * bx; }
            px[i] = x; py[i] = y; vx[i] = nvx; vy[i] = nvy;
            var k = pz[i] * 0.62 + Math.min(Math.sqrt(nvx * nvx + nvy * nvy) * 2.2, 1) * 0.55;
            if (k > 1) k = 1;
            // text safe-zone: the field parts around the focus so type reads
            var fdx2 = x - focus.x, fdy2 = y - focus.y;
            var fr = Math.sqrt(fdx2 * fdx2 + fdy2 * fdy2);
            var st = (fr - 0.12) / 0.83; st = st < 0 ? 0 : st > 1 ? 1 : st;
            k *= 1 - safeAmp * (1 - st * st * (3 - 2 * st));
            var o = i * 4;
            var sizeAttr = (0.6 + pz[i] * 2.1) * sz[i];
            attr[o] = x; attr[o + 1] = y;
            attr[o + 2] = glyph[i] > 0.5 ? -sizeAttr : sizeAttr; // sign = which digit
            attr[o + 3] = k;
          }
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform1f(uA, aspect); gl.uniform1f(uD, dpr); gl.uniform1f(uH, canvas.height); gl.uniform1f(uF, fade);
          gl.uniform3f(uLo, curRamp[0][0], curRamp[0][1], curRamp[0][2]);
          gl.uniform3f(uMi, curRamp[1][0], curRamp[1][1], curRamp[1][2]);
          gl.uniform3f(uHi, curRamp[2][0], curRamp[2][1], curRamp[2][2]);
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, attr.subarray(0, live * 4));
          gl.drawArrays(gl.POINTS, 0, live);
        },
        size: function () { }
      };
      return api;
    }

    var backend = null, rafId = 0;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      W = canvas.clientWidth || window.innerWidth;
      H = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      aspect = canvas.width / canvas.height;
      if (backend) backend.size();
    }
    function loop() {
      rafId = 0;
      if (!running || !backend || backend.dead) {
        if (backend && backend.dead) { body.classList.add("gpu-none"); }
        return;
      }
      var t = now() / 1000 - t0;
      var dt = clamp(t - last, 0.001, 0.05);
      last = t;
      frameTick(dt);
      try { backend.draw(t, dt); } catch (e) { backend.dead = true; body.classList.add("gpu-none"); return; }
      rafId = raf(loop);
    }
    var stage = {
      ready: false,
      setMode: setMode, setFocus: setFocus, setPointer: setPointer, pulse: pulse, setChapter: setChapter,
      start: function () { if (!running && backend && !backend.dead) { running = true; last = now() / 1000 - t0; if (!rafId) rafId = raf(loop); } },
      stop: function () { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }
    };
    resize();
    on(window, "resize", resize);
    on(doc, "visibilitychange", function () { doc.hidden ? stage.stop() : stage.start(); });
    tryWebGPU().then(function (gpu) {
      backend = gpu || tryWebGL2();
      if (!backend) { body.classList.add("gpu-none"); return; }
      body.classList.add(backend.kind === "webgpu" ? "gpu-webgpu" : "gpu-webgl2");
      stage.ready = true;
      resize();
      stage.start();
    });
    return stage;
  }

  var stage = makeStage($("stage"));
  if (!stage) body.classList.add("gpu-none");

  /* ════════════════════════ SHARED TEXTURE LAYER ═════════════════════════ */

  /* Pointer spotlight + stage pointer (fine pointers only). */
  var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (!still && finePointer) {
    var mx = -1, my = -1, spotQueued = false;
    on(doc, "pointermove", function (e) {
      mx = e.clientX; my = e.clientY;
      if (stage) stage.setPointer(mx, my, true);
      if (!spotQueued) {
        spotQueued = true;
        raf(function () {
          spotQueued = false;
          root.style.setProperty("--mx", mx + "px");
          root.style.setProperty("--my", my + "px");
        });
      }
    }, { passive: true });
    on(doc, "pointerleave", function () { if (stage) stage.setPointer(mx, my, false); });
  }

  /* Magnetic pull on primary actions (subtle, spring-released). */
  function magnetize(el) {
    if (still || !finePointer || !el) return;
    var r = null;
    on(el, "pointerenter", function () { r = el.getBoundingClientRect(); el.classList.add("mag"); });
    on(el, "pointermove", function (e) {
      if (!r) r = el.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      el.style.setProperty("--magx", clamp(dx * 0.18, -7, 7) + "px");
      el.style.setProperty("--magy", clamp(dy * 0.22, -5, 5) + "px");
    });
    on(el, "pointerleave", function () {
      el.classList.remove("mag");
      el.style.setProperty("--magx", "0px"); el.style.setProperty("--magy", "0px");
      r = null;
    });
  }
  var btns = doc.querySelectorAll(".btn, .lp-go");
  for (var bi = 0; bi < btns.length; bi++) magnetize(btns[bi]);

  /* 3D tilt on the identity block + lookup plate (perspective handled in CSS). */
  function tiltify(el, maxDeg) {
    if (still || !finePointer || !el) return;
    on(el, "pointermove", function (e) {
      var r = el.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width * 2 - 1;
      var ny = (e.clientY - r.top) / r.height * 2 - 1;
      el.style.setProperty("--ty", (nx * maxDeg) + "deg");
      el.style.setProperty("--tx", (-ny * maxDeg) + "deg");
      el.style.setProperty("--gx", ((nx + 1) * 50) + "%");
      el.style.setProperty("--gy", ((ny + 1) * 50) + "%");
    });
    on(el, "pointerleave", function () {
      el.style.setProperty("--tx", "0deg"); el.style.setProperty("--ty", "0deg");
    });
  }
  tiltify(doc.querySelector(".hero .identity"), 3.2);
  tiltify(doc.querySelector(".lookup-plate"), 2.2);

  /* Seal specular tracking: light follows the pointer across the medallion. */
  (function () {
    var seal = doc.querySelector(".verdict .seal");
    if (!seal || still || !finePointer) return;
    on(doc, "pointermove", function (e) {
      var r = seal.getBoundingClientRect();
      if (!r.width) return;
      var nx = clamp((e.clientX - r.left) / r.width, -0.4, 1.4);
      var ny = clamp((e.clientY - r.top) / r.height, -0.4, 1.4);
      seal.style.setProperty("--sx", (nx * 100) + "%");
      seal.style.setProperty("--sy", (ny * 100) + "%");
    }, { passive: true });
  })();

  /* Verdict letter-split (visual only; the accessible name stays on .word). */
  function splitWord(elId) {
    var el = $(elId);
    if (!el || still) return;
    var word = el.textContent || "";
    var parent = el.closest(".word");
    if (parent && !parent.getAttribute("aria-label")) parent.setAttribute("aria-label", parent.textContent || word);
    el.setAttribute("aria-hidden", "true");
    el.textContent = "";
    for (var i = 0; i < word.length; i++) {
      var s = doc.createElement("span");
      s.className = "ltr";
      s.style.setProperty("--li", String(i));
      s.textContent = word[i] === " " ? " " : word[i];
      el.appendChild(s);
    }
    el.classList.add("split");
  }
  splitWord("verdict-word");

  /* Scroll: chapter tracking for the stage + IO fallback for reveal classes. */
  var supportsScrollTimeline = false;
  try { supportsScrollTimeline = CSS.supports("animation-timeline: view()"); } catch (e) {}
  var revealables = doc.querySelectorAll(".reveal");
  if (revealables.length && (!supportsScrollTimeline || still)) {
    if ("IntersectionObserver" in window && !still) {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { entries[i].target.classList.add("in"); io.unobserve(entries[i].target); }
        }
      }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
      for (var ri = 0; ri < revealables.length; ri++) io.observe(revealables[ri]);
    } else {
      for (var rj = 0; rj < revealables.length; rj++) revealables[rj].classList.add("in");
    }
  }
  if (stage) {
    var worlds = doc.querySelectorAll(".world");
    var scrollQueued = false;
    on(window, "scroll", function () {
      if (scrollQueued) return;
      scrollQueued = true;
      raf(function () {
        scrollQueued = false;
        var vh = window.innerHeight || 1;
        var depth = clamp(window.scrollY / (vh * 1.2), 0, 1);
        stage.setChapter(depth);
        if (!worlds.length) return;
      });
    }, { passive: true });
  }

  /* Smooth-anchor the scroll cue (native smooth scroll; CSS also sets it). */
  on(doc.querySelector(".scrollcue"), "click", function (e) {
    var href = e.currentTarget.getAttribute("href") || "";
    if (href.charAt(0) !== "#") return;
    var target = $(href.slice(1));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView(still ? { behavior: "auto" } : { behavior: "smooth" });
  });

  /* View-transition helper: wrap a DOM state flip when supported. A skipped
     transition rejects its finished promise — swallow it (it is not an error,
     and the rejection would spam the console as one). */
  function withTransition(fn) {
    if (!still && doc.startViewTransition) {
      var t = doc.startViewTransition(fn);
      if (t && t.finished && t.finished.catch) t.finished.catch(function () {});
    } else { fn(); }
  }

  /* ═══════════════════════════ THE CHOREOGRAPHY ══════════════════════════ */
  if (page !== "credential") {
    if (stage) stage.setMode(page === "error" ? "fog" : "ambient", true);
    return;
  }

  var verifyUrl = body.getAttribute("data-verify-url");
  var credentialId = body.getAttribute("data-credential-id");
  var verifyToken = body.getAttribute("data-verify-token");   // WS2: present on new issuance
  var fileGate = body.getAttribute("data-filegate") === "1";
  var statusEl = $("status"), labelEl = $("status-label"), noteEl = $("status-note");
  var checksEl = $("checks"), verdictEl = $("verdict"),
      verdictWordEl = $("verdict-word"), verdictSubEl = $("verdict-sub");
  var verdictGlyphEl = verdictEl ? verdictEl.querySelector(".glyph") : null;
  var sealEl = verdictEl ? verdictEl.querySelector(".seal") : null;

  function focusOnVerdict() {
    if (!stage || !verdictEl) return;
    var r = (sealEl && sealEl.getBoundingClientRect().width ? sealEl : verdictEl).getBoundingClientRect();
    stage.setFocus(r.left + r.width / 2, r.top + r.height / 2);
  }

  var ssrOutcome = (statusEl && statusEl.getAttribute("data-ssr-outcome")) || "unknown";
  if (stage) {
    stage.setMode(ssrOutcome === "valid" ? "ambient" : ssrOutcome === "unknown" ? "fog" : "embers", true);
    raf(focusOnVerdict);
    on(window, "resize", function () { raf(focusOnVerdict); });
  }

  /* Tier-1/Tier-2 copy mirrored from the server renderer (kept in lockstep). */
  var COPY = {
    valid: { cls: "valid", label: "VALID", note: "The post-quantum signature verifies against this record, which is in the transparency log and not revoked.",
      word: "Genuine.", sub: "Issued by dmj.one Trust Services, and unaltered since.", glyph: "✓" },
    revoked: { cls: "revoked", label: "REVOKED", note: "Issued by dmj.one, then withdrawn by the issuer. It should not be relied upon.",
      word: "Revoked.", sub: "Issued by dmj.one, then withdrawn. Do not rely on it.", glyph: "⊘" },
    tampered: { cls: "bad", label: "TAMPERED", note: "The data shown does not match what was cryptographically signed.",
      word: "Altered.", sub: "This does not match what was signed. Do not rely on it.", glyph: "✕" },
    unknown: { cls: "unknown", label: "UNKNOWN", note: "We could not confirm this against our records. Check the ID, or contact the issuer.",
      word: "Not confirmed.", sub: "We could not confirm this. Check the ID or contact the issuer.", glyph: "—" }
  };
  var FILECOPY = {
    match: { cls: "valid", label: "AUTHENTIC FILE", note: "This file matches the attested record exactly, byte for byte.",
      word: "Authentic.", sub: "This is the exact document dmj.one attested.", glyph: "✓" },
    mismatch: { cls: "bad", label: "FILE DOES NOT MATCH", note: "This file is not the document we attested.",
      word: "This file does not match.", sub: "It is NOT the document we attested. A QR code or document number may have been copied onto a different file.", glyph: "✕" }
  };

  function setVerdictDom(c, sealed) {
    if (verdictEl) verdictEl.className = "verdict " + c.cls + (sealed ? " sealed" : "");
    if (verdictGlyphEl && c.glyph) verdictGlyphEl.textContent = c.glyph;
    if (verdictWordEl) {
      verdictWordEl.classList.remove("split");
      verdictWordEl.removeAttribute("aria-hidden");
      verdictWordEl.textContent = c.word;
      var parent = verdictWordEl.closest(".word");
      if (parent) parent.setAttribute("aria-label", (verdictGlyphEl ? verdictGlyphEl.textContent + " " : "") + c.word);
      splitWord("verdict-word");
    }
    if (verdictSubEl) verdictSubEl.textContent = c.sub;
  }
  function setStatusDom(c) {
    if (statusEl) statusEl.className = "status " + c.cls;
    if (labelEl) labelEl.textContent = c.label;
    if (noteEl) noteEl.textContent = c.note;
  }

  /** The verdict STRIKE: stage mode + shockwave + DOM flip, in one beat. */
  function strike(outcome, viaFile) {
    var c = viaFile ? (outcome === "valid" ? FILECOPY.match : FILECOPY.mismatch) : (COPY[outcome] || COPY.unknown);
    var sealed = c.cls === "valid";
    withTransition(function () {
      setStatusDom(c);
      setVerdictDom(c, sealed);
      body.classList.remove("is-checking");
      body.classList.add("struck");
    });
    if (!stage) return;
    focusOnVerdict();
    if (sealed) {
      stage.setMode("triumph");
      setTimeout(function () {
        var r = (sealEl || verdictEl).getBoundingClientRect();
        stage.pulse(r.left + r.width / 2, r.top + r.height / 2, 1);
        // haptic beat only when the user has actually interacted (Chrome
        // rejects pre-gesture vibration with a console error otherwise)
        if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) {
          try { navigator.vibrate(18); } catch (e) {}
        }
      }, still ? 0 : 430);
      setTimeout(function () { stage.setMode("aura"); }, 1900);
    } else if (c.cls === "unknown" || c.cls === "unconfirmed") {
      stage.setMode("fog");
    } else {
      stage.setMode("embers");
      var r2 = verdictEl ? verdictEl.getBoundingClientRect() : null;
      if (r2) stage.pulse(r2.left + r2.width / 2, r2.top + r2.height / 2, 0.55);
    }
  }

  /** Ignite check rows one by one (stagger), then hand off to done(). */
  function igniteChecks(checks, paintFile, done) {
    if (!checksEl) { done(); return; }
    var items = checksEl.querySelectorAll("li[data-check]");
    var queue = [];
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      if (!paintFile && li.getAttribute("data-filecheck") === "1") continue;
      queue.push(li);
    }
    var step = still ? 0 : 150;
    function paintOne(li) {
      var key = li.getAttribute("data-check");
      var v = checks ? checks[key] : undefined;
      li.classList.remove("run", "pass", "warn", "fail", "lit");
      var word = "Checking";
      if (key === "anchorProof" && v === false) { li.classList.add("warn"); word = "Pending"; }
      else if (v === true) { li.classList.add("pass"); word = "Passed"; }
      else if (v === false) { li.classList.add("fail"); word = "Failed"; }
      li.classList.add("lit");
      var sr = li.querySelector("[data-check-status]");
      if (sr) sr.textContent = word;
    }
    if (still) {
      for (var j = 0; j < queue.length; j++) paintOne(queue[j]);
      done();
      return;
    }
    var idx = 0;
    (function next() {
      if (idx >= queue.length) { setTimeout(done, 240); return; }
      paintOne(queue[idx++]);
      setTimeout(next, step);
    })();
  }

  function markRunning(includeFileRow) {
    if (!checksEl) return;
    checksEl.hidden = false;
    var rows = checksEl.querySelectorAll(includeFileRow ? "li[data-check]" : "li[data-check]:not([data-filecheck])");
    for (var i = 0; i < rows.length; i++) rows[i].classList.add("run");
  }
  function clearRunning() {
    if (!checksEl) return;
    var rows = checksEl.querySelectorAll("li[data-check]");
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove("run");
  }

  /* ---- The live re-verification rite (id/QR flow) ---- */
  var MIN_BEAT = still ? 0 : 1150;
  function runRite() {
    body.classList.add("is-checking");
    if (stage) { stage.setMode("rite"); focusOnVerdict(); }
    statusEl.className = "status checking";
    if (labelEl) labelEl.textContent = fileGate ? "Verifying record" : "Verifying live";
    if (noteEl) noteEl.textContent = fileGate
      ? "Running the post-quantum signature, transparency-log, anchor and revocation checks…"
      : "Re-running the post-quantum signature and transparency-log checks against the live record…";
    markRunning(false);
    var started = now();
    fetch(verifyUrl, { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("verify failed")); })
      .then(function (result) {
        var wait = Math.max(0, MIN_BEAT - (now() - started));
        setTimeout(function () {
          igniteChecks(result.checks, false, function () {
            if (fileGate) {
              body.classList.remove("is-checking");
              if (result.outcome === "valid") {
                statusEl.className = "status unconfirmed";
                if (labelEl) labelEl.textContent = "RECORD VERIFIED · FILE NOT CONFIRMED";
                if (noteEl) noteEl.textContent = "The attestation record is genuine and intact. Confirm the file itself to prove your copy is the one we attested.";
                if (stage) stage.setMode("ambient");
              } else {
                strike(result.outcome, false);
              }
            } else {
              strike(result.outcome, false);
            }
          });
        }, wait);
      })
      .catch(function () {
        clearRunning();
        body.classList.remove("is-checking");
        var c = COPY[ssrOutcome] || COPY.unknown;
        setStatusDom(c);
        if (stage) stage.setMode(ssrOutcome === "valid" ? "ambient" : ssrOutcome === "unknown" ? "fog" : "embers");
      });
  }
  if (verifyUrl && statusEl) runRite();

  /* ---- The file gate (uploads): drop a file, the chain re-runs on IT. ---- */
  (function wireFileGate() {
    var fcForm = $("fc-form"), fcInput = $("fc-input"), fcDrop = $("fc-drop"),
        fcMsg = $("fc-msg"), fcSubmit = $("fc-submit"), fcBox = $("filecheck");
    if (!fcForm || !fcInput) return;
    function retireFileCheck() {   // a clean pass → the whole gate has done its job; fade it out, then collapse, so the hero seal stands alone
      if (!fcBox) return;
      fcBox.classList.add("retired");
      if (still) { fcBox.hidden = true; return; }
      setTimeout(function () { fcBox.hidden = true; }, 480);
    }
    function run(file) {
      if (!file) return;
      if (fcMsg) { fcMsg.className = "fc-msg"; fcMsg.textContent = "Verifying your file…"; }
      if (fcSubmit) fcSubmit.disabled = true;
      body.classList.add("is-checking");
      if (fcDrop) fcDrop.classList.add("scanning");
      if (stage) { stage.setMode("rite"); }
      statusEl.className = "status checking";
      if (labelEl) labelEl.textContent = "Verifying your file";
      if (noteEl) noteEl.textContent = "Hashing your file and checking it against the post-quantum signature, transparency log and revocation…";
      markRunning(true);
      var started = now();
      var fd = new FormData();
      // New issuance is gated by the unguessable token, not the sequential id.
      if (verifyToken) { fd.append("verifyToken", verifyToken); } else { fd.append("credentialId", credentialId); }
      fd.append("file", file);
      fetch("/api/verify/file", { method: "POST", headers: { accept: "application/json" }, body: fd })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("verify failed")); })
        .then(function (result) {
          var wait = Math.max(0, MIN_BEAT - (now() - started));
          setTimeout(function () {
            if (fcDrop) fcDrop.classList.remove("scanning");
            igniteChecks(result && result.checks, true, function () {
              if (result && result.outcome === "valid") {
                strike("valid", true);
                if (fcMsg) { fcMsg.className = "fc-msg ok"; fcMsg.textContent = "Verified: this file is the document we attested."; }
                retireFileCheck();   // confirmed → the whole confirm-box bows out; the picker stays put on every non-pass below so a retry is always one click away
              } else if (result && result.outcome === "tampered") {
                strike("tampered", true);
                if (fcMsg) { fcMsg.className = "fc-msg err"; fcMsg.textContent = "This file does NOT match the attested document."; }
              } else {
                body.classList.remove("is-checking");
                if (stage) stage.setMode("fog");
                if (fcMsg) { fcMsg.className = "fc-msg err"; fcMsg.textContent = "We could not confirm this file against the record."; }
              }
              if (fcSubmit) fcSubmit.disabled = false;
            });
          }, wait);
        })
        .catch(function () {
          if (fcDrop) fcDrop.classList.remove("scanning");
          clearRunning();
          body.classList.remove("is-checking");
          if (stage) stage.setMode("ambient");
          if (fcMsg) { fcMsg.className = "fc-msg err"; fcMsg.textContent = "Something went wrong checking the file. Please try again."; }
          if (fcSubmit) fcSubmit.disabled = false;
        });
    }
    on(fcInput, "change", function () { run(fcInput.files && fcInput.files[0]); });
    on(fcForm, "submit", function (ev) { ev.preventDefault(); run(fcInput.files && fcInput.files[0]); });
    if (fcDrop) {
      ["dragenter", "dragover"].forEach(function (t) { on(fcDrop, t, function (ev) { ev.preventDefault(); fcDrop.classList.add("over"); }); });
      ["dragleave", "dragend"].forEach(function (t) { on(fcDrop, t, function (ev) { ev.preventDefault(); fcDrop.classList.remove("over"); }); });
      on(fcDrop, "drop", function (ev) {
        ev.preventDefault(); fcDrop.classList.remove("over");
        var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        if (f) { try { fcInput.files = ev.dataTransfer.files; } catch (e) {} run(f); }
      });
    }
  })();

  /* ---- Password-gated download (recipient ritual). Same endpoint, fetch UX. */
  (function wireDownload() {
    var form = $("dl-form"), msg = $("dl-msg"), pass = $("dl-pass"), submit = $("dl-submit");
    if (!form) return;
    on(form, "submit", function (ev) {
      ev.preventDefault();
      if (!pass || !pass.value) return;
      if (msg) { msg.className = "msg"; msg.textContent = "Verifying…"; }
      if (submit) submit.disabled = true;
      fetch("/api/download", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ credentialId: credentialId, password: pass.value })
      }).then(function (res) {
        if (res.status === 200) {
          return res.blob().then(function (blob) {
            var url = URL.createObjectURL(blob);
            var a = doc.createElement("a");
            a.href = url; a.download = (credentialId || "certificate") + ".pdf";
            doc.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
            if (msg) { msg.className = "msg ok"; msg.textContent = "Download started."; }
            if (pass) pass.value = "";
          });
        }
        if (res.status === 429) {
          var ra = res.headers.get("retry-after");
          if (msg) { msg.className = "msg err"; msg.textContent = "Too many attempts. Please wait" + (ra ? " " + ra + "s" : "") + " and try again."; }
          return;
        }
        if (msg) { msg.className = "msg err"; msg.textContent = "Verification failed. Check your details and try again."; }
      }).catch(function () {
        if (msg) { msg.className = "msg err"; msg.textContent = "Something went wrong. Please try again."; }
      }).then(function () {
        if (submit) submit.disabled = false;
      });
    });
  })();
})();
`;

/**
 * Content hash of the engine source — the cache-busting token in the asset URL.
 * `GET /assets/cinema-<hash>.js` serves {@link CINEMA_JS} with an immutable
 * Cache-Control; a changed engine changes the hash, so clients can cache hard
 * forever and still pick up every deploy instantly.
 */
export const CINEMA_JS_HASH: string = createHash('sha256')
  .update(CINEMA_JS, 'utf8')
  .digest('hex')
  .slice(0, 12);

/** The exact same-origin path the pages reference and the route serves. */
export function cinemaAssetPath(): string {
  return `/assets/cinema-${CINEMA_JS_HASH}.js`;
}
