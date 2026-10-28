import * as THREE from './three.module.min.js';

const slots = [...document.querySelectorAll('[data-o]')];
if (slots.length) start();

function start() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (e) { return; }
  const small = innerWidth < 700;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const cv = renderer.domElement; cv.id = 'cv3d'; cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);

  const scene = new THREE.Scene();
  const FOV = 30, CZ = 14;
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60); cam.position.set(0, 0, CZ);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc6b0, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 8); scene.add(key);
  const amberL = new THREE.PointLight(0xe8a317, 40, 30); amberL.position.set(-5, -3, 6); scene.add(amberL);
  const purpL = new THREE.PointLight(0x8a6cff, 40, 30); purpL.position.set(5, 4, 5); scene.add(purpL);

  const C = { teal: 0x0b6e66, tealK: 0x064e48, amber: 0xe8a317, amberA: 0xf5c75a, mor: 0x6b4fd8, morA: 0x8a6cff, cream: 0xfffdf8, dark: 0x0e1f1d };
  const std = (color, m = 0.1, r = 0.4) => new THREE.MeshStandardMaterial({ color, metalness: m, roughness: r });
  const F = 'ui-sans-serif,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  function tex(w, h, draw) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function rshape(w, h, r) { const s = new THREE.Shape(); const x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2); s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5); return s; }
  function slab(w, h, r, d, mat, bev = 0.04) { const g = new THREE.ExtrudeGeometry(rshape(w, h, r), { depth: d, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 16 }); g.translate(0, 0, -d / 2); return new THREE.Mesh(g, mat); }
  const tube = (pts, rad, mat, seg = 60) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, rad, 10, false), mat);
  const clamp01 = x => Math.min(1, Math.max(0, x)), ease = x => x * x * (3 - 2 * x);

  /* ---------- dokular ---------- */
  const screenTex = tex(600, 1220, (c, w, h) => {
    c.fillStyle = '#f2f4f1'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(0, 0, w, 150);
    c.fillStyle = '#0b6e66'; rrect(c, 34, 78, 44, 44, 12); c.fill();
    c.fillStyle = '#10201f'; c.font = `700 32px ${F}`; c.fillText('Belgeyi onayla', 96, 112);
    const card = (y, hh) => { c.fillStyle = '#fff'; rrect(c, 28, y, w - 56, hh, 26); c.fill(); c.strokeStyle = '#e3e8e5'; c.lineWidth = 2; c.stroke(); };
    card(180, 150); c.fillStyle = '#667573'; c.font = `22px ${F}`; c.fillText('Cari', 56, 224);
    c.fillStyle = '#10201f'; c.font = `700 28px ${F}`; c.fillText('Örnek Toptan Gıda Ltd.', 56, 262);
    c.fillStyle = '#667573'; c.font = `21px ${F}`; c.fillText('ÖRN-2026-0412 · 27.10.2026', 56, 306);
    card(352, 290);
    [['Dana kıyma · 24 kg', '13.560 ₺'], ['Ayçiçek yağı · 6 bidon', '4.320 ₺'], ['Un 25 kg · 10 çuval', '5.900 ₺']].forEach((r, i) => { const y = 410 + i * 62; c.fillStyle = '#10201f'; c.textAlign = 'left'; c.font = `24px ${F}`; c.fillText(r[0], 56, y); c.textAlign = 'right'; c.font = `700 24px ${F}`; c.fillText(r[1], w - 56, y); c.strokeStyle = '#e3e8e5'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(56, y + 22); c.lineTo(w - 56, y + 22); c.stroke(); c.setLineDash([]); });
    c.textAlign = 'left'; c.fillStyle = '#10201f'; c.font = `700 28px ${F}`; c.fillText('Toplam', 56, 622); c.textAlign = 'right'; c.fillText('23.780 ₺', w - 56, 622); c.textAlign = 'left';
    c.fillStyle = '#fdf1d6'; rrect(c, 28, 672, w - 56, 130, 26); c.fill(); c.strokeStyle = '#f1d9a0'; c.stroke();
    c.fillStyle = '#7a4705'; c.font = `700 26px ${F}`; c.fillText('Fiyat uyarısı', 56, 722); c.font = `23px ${F}`; c.fillText('Dana kıyma: 520 ₺ → 565 ₺/kg (+%8,7)', 56, 764);
    c.fillStyle = '#6b4fd8'; rrect(c, 28, 1090, w - 56, 92, 28); c.fill(); c.fillStyle = '#fff'; c.font = `700 30px ${F}`; c.textAlign = 'center'; c.fillText('Onayla ve kaydet', w / 2, 1148);
  });
  const cardTex = (w, h, bg, draw) => tex(w, h, (c, W, H) => { c.fillStyle = bg; rrect(c, 4, 4, W - 8, H - 8, 40); c.fill(); c.strokeStyle = 'rgba(14,31,29,.12)'; c.lineWidth = 3; c.stroke(); draw(c, W, H); });
  const faturaTex = cardTex(420, 560, '#fffdf8', (c, w) => {
    c.fillStyle = '#0b6e66'; c.font = `700 30px ${F}`; c.fillText('FATURA', 36, 70); c.fillStyle = '#667573'; c.font = `22px ${F}`; c.fillText('Örnek Toptan Gıda Ltd.', 36, 108);
    for (let i = 0; i < 7; i++) { c.fillStyle = '#e3e8e5'; rrect(c, 36, 150 + i * 46, 220 + (i % 3) * 40, 14, 7); c.fill(); c.fillStyle = '#d9d0bd'; rrect(c, w - 130, 150 + i * 46, 94, 14, 7); c.fill(); }
    c.fillStyle = '#10201f'; c.font = `700 36px ${F}`; c.textAlign = 'right'; c.fillText('23.780 ₺', w - 36, 510);
  });
  const uyariTex = cardTex(520, 220, '#fdf1d6', c => { c.fillStyle = '#e8a317'; c.beginPath(); c.arc(70, 110, 34, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = `700 40px ${F}`; c.textAlign = 'center'; c.fillText('!', 70, 124); c.textAlign = 'left'; c.fillStyle = '#7a4705'; c.font = `700 34px ${F}`; c.fillText('Fiyat arttı', 128, 96); c.font = `28px ${F}`; c.fillText('Dana kıyma +%8,7', 128, 140); });
  const okunduTex = cardTex(440, 200, '#ffffff', c => { c.fillStyle = '#12793d'; c.beginPath(); c.arc(76, 100, 36, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(60, 102); c.lineTo(73, 116); c.lineTo(96, 86); c.stroke(); c.fillStyle = '#10201f'; c.font = `700 34px ${F}`; c.fillText('Okundu', 134, 92); c.fillStyle = '#667573'; c.font = `26px ${F}`; c.fillText('4 saniyede', 134, 134); });
  const bakiyeTex = cardTex(460, 220, '#4a33b0', c => { c.fillStyle = '#d6ccff'; c.font = `26px ${F}`; c.fillText('Cari bakiye', 36, 70); c.fillStyle = '#ffd0d3'; c.font = `700 52px ${F}`; c.fillText('−14.200 ₺', 36, 140); c.fillStyle = '#e6dffb'; c.font = `24px ${F}`; c.fillText('Örnek Toptan Gıda', 36, 184); });
  const gridTex = tex(256, 256, (c, w, h) => { c.fillStyle = '#fffdf8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#cfd8d4'; c.lineWidth = 2; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); } c.fillStyle = '#0b6e66'; c.fillRect(0, 0, w, 32); c.fillStyle = 'rgba(107,79,216,.35)'; c.fillRect(32, 96, 96, 32); c.fillRect(160, 160, 64, 32); });
  const yaziTex = (txt, bg, fg) => tex(512, 128, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = `700 64px ui-serif,Georgia,serif`; c.textAlign = 'center'; c.fillText(txt, w / 2, 88); });

  /* ---------- nesneler ---------- */
  const items = [];
  const plane = (t, w, h, o = 1) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: o }));

  function phoneObj() {
    const g = new THREE.Group(), PW = 1.5, PH = 3.05;
    const body = slab(PW, PH, 0.24, 0.12, new THREE.MeshStandardMaterial({ color: C.dark, metalness: 0.65, roughness: 0.28 })); g.add(body);
    const sw = PW - 0.14, sh = PH - 0.14;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: screenTex })); scr.position.z = 0.108; g.add(scr);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(sw, 0.05), new THREE.MeshBasicMaterial({ color: C.amber, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.z = 0.112; g.add(beam);
    g.userData = { sh, beam }; return g;
  }
  const coinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.035, 28);
  const coin = i => new THREE.Mesh(coinGeo, std(i % 3 === 0 ? C.morA : (i % 2 ? C.amber : C.amberA), 0.85, 0.25));

  const builders = {
    hero() {
      const root = new THREE.Group(), phone = phoneObj(); root.add(phone);
      const fatura = plane(faturaTex, 1.35, 1.8), uyari = plane(uyariTex, 1.7, 0.72), okundu = plane(okunduTex, 1.45, 0.66), bakiye = plane(bakiyeTex, 1.5, 0.72);
      [fatura, uyari, okundu, bakiye].forEach(m => root.add(m));
      const coins = []; for (let i = 0; i < 9; i++) { const m = coin(i); m.userData = { a: Math.random() * 6.28, r: 2.1 + Math.random() * 1.2, y: (Math.random() - 0.5) * 3.2, s: 0.4 + Math.random() * 0.6 }; root.add(m); coins.push(m); }
      return { root, w: 5.2, h: 4.4, hero: true, update(t, o) {
        const { p, mx, my, hw } = o, e = ease(p), cs = Math.min(1, hw / 2.7), sh = phone.userData.sh;
        phone.rotation.set(my * 0.35 - p * 0.1, -0.38 + mx * 0.7 + p * 0.9, -0.04 + Math.sin(t * 0.6) * 0.015);
        phone.position.y = Math.sin(t * 0.9) * 0.07 - p * 0.2;
        phone.userData.beam.position.y = Math.sin(t * 1.4) * (sh * 0.34) + 0.15; phone.userData.beam.material.opacity = 0.35 + 0.55 * Math.abs(Math.cos(t * 1.4));
        fatura.position.set(-hw * 0.56 + e * hw * 0.56, 0.5 - e * 0.4 + Math.sin(t * 0.8) * 0.1, 0.6 - e * 0.7); fatura.rotation.set(0, 0.35 - e * 0.35, -0.12 + e * 0.12); fatura.material.opacity = 1 - ease(Math.min(1, e * 1.4)); fatura.scale.setScalar(cs);
        okundu.position.set(-hw * 0.52, -1.45 + Math.sin(t * 1.1 + 1) * 0.08, 0.9); okundu.rotation.set(0, 0.25, 0.05); okundu.material.opacity = ease(clamp01((e - 0.35) / 0.4)); okundu.scale.setScalar(cs);
        uyari.position.set(hw * 0.7, 0.9 + Math.sin(t * 0.9 + 2) * 0.1, 0.9); uyari.rotation.set(0, -0.3, 0.06); uyari.material.opacity = ease(clamp01((e - 0.2) / 0.5)); uyari.scale.setScalar(cs);
        bakiye.position.set(hw * 0.68, -1.4 + Math.sin(t * 1.0 + 4) * 0.09, 0.7); bakiye.rotation.set(0, -0.28, -0.05); bakiye.material.opacity = ease(clamp01((e - 0.5) / 0.5)); bakiye.scale.setScalar(cs);
        const sx = Math.min(hw / 2.6, 1.3);
        coins.forEach(m => { const d = m.userData, a = d.a + t * d.s * 0.4; m.position.set(Math.cos(a) * d.r * sx, d.y + Math.sin(t * d.s + d.a) * 0.15, -1.3 + Math.sin(a) * 0.9); m.rotation.set(t * d.s, t * 0.5 * d.s + d.a, 0); });
      } };
    },
    kamera() {
      const root = new THREE.Group();
      const body = slab(2.0, 1.3, 0.22, 0.7, std(C.teal, 0.2, 0.35)); root.add(body);
      const top = slab(0.7, 0.22, 0.08, 0.5, std(C.tealK, 0.3, 0.4)); top.position.set(-0.45, 0.76, 0); root.add(top);
      const lensR = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 40), std(C.dark, 0.8, 0.25)); lensR.rotation.x = Math.PI / 2; lensR.position.z = 0.5; root.add(lensR);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.05, 12, 40), std(C.amber, 0.9, 0.2)); ring.position.z = 0.67; root.add(ring);
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b2a6b, metalness: 1, roughness: 0.05 })); glass.rotation.x = Math.PI / 2; glass.position.z = 0.66; root.add(glass);
      const flash = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.08), new THREE.MeshStandardMaterial({ color: C.amberA, emissive: C.amber, emissiveIntensity: 0.4 })); flash.position.set(0.62, 0.45, 0.4); root.add(flash);
      const sheet = plane(faturaTex, 0.9, 1.2); sheet.position.set(0.5, 1.4, 0.1); root.add(sheet);
      return { root, w: 2.6, h: 3.0, update(t, o) { root.rotation.set(0.18 + o.my * 0.3, -0.5 + Math.sin(t * 0.6) * 0.3 + o.mx * 0.5, 0); sheet.position.y = 1.1 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.3)); flash.material.emissiveIntensity = Math.max(0, Math.sin(t * 2.6)) * 2; } };
    },
    onay() {
      const root = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 56), std(C.mor, 0.3, 0.3)); disc.rotation.x = Math.PI / 2; root.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 14, 56), std(C.amberA, 0.9, 0.25)); rim.position.z = 0.15; root.add(rim);
      const chk = tube([[-0.5, -0.02, 0], [-0.15, -0.38, 0], [0.55, 0.38, 0]], 0.14, std(0xffffff, 0.1, 0.3), 30); chk.position.z = 0.22; root.add(chk);
      return { root, w: 2.9, h: 2.9, update(t, o) { const k = ease(clamp01(o.local / 0.9)); root.rotation.set(o.my * 0.3, Math.sin(t * 0.7) * 0.45 + o.mx * 0.5, 0); chk.scale.setScalar(0.6 + 0.4 * k + Math.sin(t * 2.2) * 0.03) ; } };
    },
    takip() {
      const root = new THREE.Group(), hs = [0.7, 1.0, 0.85, 1.4, 1.9], bars = [];
      const base = slab(2.8, 0.18, 0.06, 0.9, std(C.cream, 0.05, 0.6)); base.position.y = -0.1; root.add(base);
      hs.forEach((h, i) => { const g = new THREE.BoxGeometry(0.38, 1, 0.5); g.translate(0, 0.5, 0); const m = new THREE.Mesh(g, std(i === 4 ? C.amber : (i === 3 ? C.morA : C.teal), 0.25, 0.35)); m.position.x = -1.1 + i * 0.55; root.add(m); bars.push(m); });
      return { root, w: 3.6, h: 3.1, update(t, o) { const k = ease(clamp01(o.local / 1.2)); bars.forEach((m, i) => m.scale.y = Math.max(0.01, hs[i] * k * (0.94 + 0.06 * Math.sin(t * 1.3 + i)))); root.rotation.set(0.35 + o.my * 0.2, -0.5 + Math.sin(t * 0.5) * 0.25 + o.mx * 0.4, 0); root.position.y = -0.8; } };
    },
    cizgi() {
      const root = new THREE.Group();
      const pts = [[-3, -0.8, 0], [-2, -0.9, 0.2], [-1, -1.0, 0], [0, -0.85, 0.2], [1, -0.4, 0], [2, 0.0, 0.2], [3, 0.8, 0]];
      const line = tube(pts, 0.07, std(C.teal, 0.2, 0.3), 120); root.add(line);
      const total = line.geometry.index.count;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 24), new THREE.MeshStandardMaterial({ color: C.amber, emissive: C.amber, emissiveIntensity: 0.6 })); dot.position.set(3, 0.8, 0); root.add(dot);
      const floor = plane(tex(512, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(11,110,102,.25)'; c.lineWidth = 2; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, h); c.stroke(); } for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); } }), 7, 2.6); floor.position.set(0, -0.3, -0.5); root.add(floor);
      return { root, w: 7.4, h: 3.2, update(t, o) { const k = ease(clamp01(o.local / 1.8)); line.geometry.setDrawRange(0, Math.floor(total * k / 3) * 3); dot.visible = k > 0.98; dot.scale.setScalar(1 + 0.25 * Math.sin(t * 4)); root.rotation.set(-0.35 + o.my * 0.15, -0.28 + o.mx * 0.25, 0); } };
    },
    paralar() {
      const root = new THREE.Group(), cs = [];
      for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.2, 40), std(i % 2 ? C.amber : C.morA, 0.85, 0.25)); m.position.y = -0.7 + i * 0.22; root.add(m); cs.push(m); }
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.2, 40), std(C.amberA, 0.9, 0.2)); root.add(top);
      return { root, w: 2.2, h: 3.0, update(t, o) { top.position.y = 0.55 + Math.abs(Math.sin(t * 1.5)) * 0.3; top.rotation.set(Math.sin(t * 1.5) * 0.3, t * 1.5, 0); root.rotation.set(0.35, o.mx * 0.5 + 0.3, 0); cs.forEach((m, i) => m.rotation.y = i * 0.5); } };
    },
    saat() {
      const root = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.22, 56), std(C.cream, 0.05, 0.6)); face.rotation.x = Math.PI / 2; root.add(face);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 16, 56), std(C.morA, 0.7, 0.3)); rim.position.z = 0.02; root.add(rim);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, m = new THREE.Mesh(new THREE.BoxGeometry(0.06, i % 3 ? 0.12 : 0.2, 0.05), std(C.dark)); m.position.set(Math.sin(a) * 0.8, Math.cos(a) * 0.8, 0.13); m.rotation.z = -a; root.add(m); }
      const mk = (len, w, col) => { const g = new THREE.BoxGeometry(w, len, 0.05); g.translate(0, len / 2, 0); const m = new THREE.Mesh(g, std(col, 0.2, 0.4)); m.position.z = 0.17; root.add(m); return m; };
      const hh = mk(0.5, 0.09, C.dark), mm = mk(0.75, 0.06, C.mor);
      return { root, w: 2.2, h: 2.2, update(t, o) { mm.rotation.z = -t * 1.2; hh.rotation.z = -t * 0.1; root.rotation.set(o.my * 0.4, -0.35 + Math.sin(t * 0.6) * 0.3 + o.mx * 0.4, 0); } };
    },
    tablo() {
      const root = new THREE.Group();
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 1.9), [std(C.cream), std(C.cream), new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.6 }), std(C.cream), std(C.cream), std(C.cream)]); m.position.set(i * 0.12, i * 0.16 - 0.2, -i * 0.12); root.add(m); }
      return { root, w: 2.8, h: 2.6, update(t, o) { root.rotation.set(0.9 + o.my * 0.2, -0.5 + Math.sin(t * 0.6) * 0.25 + o.mx * 0.4, 0.1); root.position.y = Math.sin(t) * 0.05; } };
    },
    kure() {
      const root = new THREE.Group();
      const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 2), new THREE.MeshStandardMaterial({ color: C.teal, wireframe: true })); root.add(globe);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 32), std(C.cream, 0.1, 0.5)); root.add(inner);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.05, 12, 64), std(C.amber, 0.9, 0.25)); ring.rotation.x = 1.2; root.add(ring);
      return { root, w: 3.0, h: 3.0, update(t, o) { globe.rotation.y = t * 0.6; inner.rotation.y = t * 0.6; ring.rotation.z = t * 0.8; root.rotation.set(o.my * 0.3, o.mx * 0.4, 0); } };
    },
    dukkan() {
      const root = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 1.2), std(C.cream, 0.05, 0.7)); body.position.y = -0.3; root.add(body);
      for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 1.0), std(i % 2 ? C.mor : 0xffffff, 0.05, 0.6)); m.position.set(-1.05 + i * 0.3, 0.55, 0.78); m.rotation.x = -0.45; root.add(m); }
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.06), std(C.tealK, 0.2, 0.4)); door.position.set(0.7, -0.55, 0.62); root.add(door);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: 0x9fd7d0, metalness: 0.9, roughness: 0.1 })); win.position.set(-0.55, -0.45, 0.62); root.add(win);
      const sign = plane(yaziTex('KasaNot', '#0b6e66', '#fff'), 1.5, 0.375); sign.material.depthWrite = true; sign.position.set(0, 0.95, 0.5); root.add(sign);
      for (let i = 0; i < 3; i++) { const c = coin(i + 1); c.position.set(-0.5 + i * 0.4, 1.4 + i * 0.1, 0); root.add(c); c.userData.i = i; }
      return { root, w: 3.0, h: 2.8, update(t, o) { root.rotation.set(0.12 + o.my * 0.2, -0.55 + Math.sin(t * 0.5) * 0.4 + o.mx * 0.4, 0); root.children.forEach(c => { if (c.userData.i !== undefined) { c.rotation.set(t * 1.5, t, 0); c.position.y = 1.5 + Math.sin(t * 2 + c.userData.i) * 0.12; } }); } };
    },
    kalkan() {
      const root = new THREE.Group(), s = new THREE.Shape();
      s.moveTo(0, 1.2); s.bezierCurveTo(0.5, 1.05, 0.85, 1.0, 1, 0.95); s.lineTo(1, 0.2); s.bezierCurveTo(1, -0.6, 0.5, -1.0, 0, -1.3); s.bezierCurveTo(-0.5, -1.0, -1, -0.6, -1, 0.2); s.lineTo(-1, 0.95); s.bezierCurveTo(-0.85, 1.0, -0.5, 1.05, 0, 1.2);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 5, curveSegments: 24 }); g.translate(0, 0, -0.125);
      root.add(new THREE.Mesh(g, std(C.tealK, 0.4, 0.3)));
      const chk = tube([[-0.45, 0.0, 0], [-0.12, -0.35, 0], [0.5, 0.4, 0]], 0.12, std(C.amberA, 0.9, 0.2), 30); chk.position.z = 0.28; root.add(chk);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.03, 10, 64), std(C.morA, 0.6, 0.3)); root.add(ring);
      return { root, w: 3.1, h: 3.0, update(t, o) { root.rotation.set(o.my * 0.3, Math.sin(t * 0.6) * 0.5 + o.mx * 0.5, 0); ring.rotation.set(1.2, t * 0.5, 0); } };
    },
    telefon2() {
      const root = new THREE.Group(), phone = phoneObj(); phone.scale.setScalar(0.8); root.add(phone);
      const cs = []; for (let i = 0; i < 7; i++) { const m = coin(i); m.userData = { a: i / 7 * 6.28 }; root.add(m); cs.push(m); }
      return { root, w: 5.0, h: 3.3, update(t, o) { phone.rotation.set(o.my * 0.3, -0.35 + Math.sin(t * 0.6) * 0.4 + o.mx * 0.5, 0); phone.userData.beam.position.y = Math.sin(t * 1.4) * 1.0; cs.forEach(m => { const a = m.userData.a + t * 0.6; m.position.set(Math.cos(a) * 1.9, Math.sin(a * 2) * 0.5, Math.sin(a) * 0.9); m.rotation.set(t * 1.2, t * 0.8, 0); }); } };
    },
  };

  slots.forEach(el => {
    const kind = el.dataset.o; if (!builders[kind]) return;
    const b = builders[kind](); b.root.visible = false; scene.add(b.root);
    items.push({ el, b, t0: null, kind });
  });

  /* ---------- boyut, etkileşim, döngü ---------- */
  let W = 1, H = 1, unit = 1, mx = 0, my = 0;
  function resize() { W = innerWidth; H = innerHeight; renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix(); unit = 2 * Math.tan(FOV * Math.PI / 360) * CZ / H; }
  addEventListener('resize', resize); resize();
  addEventListener('pointermove', e => { mx = e.clientX / W - 0.5; my = e.clientY / H - 0.5; }, { passive: true });
  const clock = new THREE.Clock();
  let first = true;
  function frame() {
    const t = clock.getElapsedTime(); let any = false;
    for (const it of items) {
      const r = it.el.getBoundingClientRect(), vis = r.bottom > -20 && r.top < H + 20 && r.width > 4 && r.height > 4;
      it.b.root.visible = vis; if (!vis) { it.t0 = null; continue; }
      any = true; if (it.t0 === null) it.t0 = t;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let s = Math.min(r.width / it.b.w, r.height / it.b.h) * unit;
      const o = { mx, my, p: 0, hw: 2.6, local: t - it.t0 };
      if (it.b.hero) { s = 0.226 * r.height * unit; o.p = clamp01(-r.top / (r.height * 0.9)); o.hw = Math.max(1.4, r.width * unit / 2 / s); }
      it.b.root.scale.setScalar(s); it.b.root.position.set((cx - W / 2) * unit, -(cy - H / 2) * unit, 0);
      it.b.update(t, o);
    }
    if (any) renderer.render(scene, cam);
    if (first) { first = false; document.documentElement.classList.add('v3'); }
    requestAnimationFrame(frame);
  }
  frame();
}
