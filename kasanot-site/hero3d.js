import * as THREE from './three.module.min.js';

const host = document.getElementById('sahne3d');
if (host) start();

function start() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2)) return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0, 9);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc6b0, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 6); scene.add(key);
  const amber = new THREE.PointLight(0xe8a317, 18, 14); amber.position.set(-3.5, -1.5, 3); scene.add(amber);
  const teal = new THREE.PointLight(0x1fb5a5, 14, 14); teal.position.set(3.5, 2.5, 2); scene.add(teal);

  /* ---------- doku çizimleri ---------- */
  const F = 'ui-sans-serif,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function tex(w, h, draw) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  const screenTex = tex(600, 1220, (c, w, h) => {
    c.fillStyle = '#f2f4f1'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, 150);
    c.fillStyle = '#0b6e66'; rr(c, 34, 78, 44, 44, 12); c.fill();
    c.fillStyle = '#10201f'; c.font = `700 32px ${F}`; c.fillText('Belgeyi onayla', 96, 112);
    const card = (y, hh) => { c.fillStyle = '#fff'; rr(c, 28, y, w - 56, hh, 26); c.fill(); c.strokeStyle = '#e3e8e5'; c.lineWidth = 2; c.stroke(); };
    card(180, 150);
    c.fillStyle = '#667573'; c.font = `22px ${F}`; c.fillText('Cari', 56, 224);
    c.fillStyle = '#10201f'; c.font = `700 28px ${F}`; c.fillText('Örnek Toptan Gıda Ltd.', 56, 262);
    c.fillStyle = '#667573'; c.font = `21px ${F}`; c.fillText('ÖRN-2026-0412 · 27.10.2026', 56, 306);
    card(352, 290);
    const rows = [['Dana kıyma · 24 kg', '13.560 ₺'], ['Ayçiçek yağı · 6 bidon', '4.320 ₺'], ['Un 25 kg · 10 çuval', '5.900 ₺']];
    c.font = `24px ${F}`;
    rows.forEach((r, i) => { const y = 410 + i * 62; c.fillStyle = '#10201f'; c.textAlign = 'left'; c.fillText(r[0], 56, y); c.textAlign = 'right'; c.font = `700 24px ${F}`; c.fillText(r[1], w - 56, y); c.font = `24px ${F}`; c.strokeStyle = '#e3e8e5'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(56, y + 22); c.lineTo(w - 56, y + 22); c.stroke(); c.setLineDash([]); });
    c.textAlign = 'left'; c.font = `700 28px ${F}`; c.fillText('Toplam', 56, 622); c.textAlign = 'right'; c.fillText('23.780 ₺', w - 56, 622); c.textAlign = 'left';
    c.fillStyle = '#fdf1d6'; rr(c, 28, 672, w - 56, 130, 26); c.fill(); c.strokeStyle = '#f1d9a0'; c.stroke();
    c.fillStyle = '#7a4705'; c.font = `700 26px ${F}`; c.fillText('Fiyat uyarısı', 56, 722);
    c.font = `23px ${F}`; c.fillText('Dana kıyma: 520 ₺ → 565 ₺/kg (+%8,7)', 56, 764);
    c.fillStyle = '#0b6e66'; rr(c, 28, 1090, w - 56, 92, 28); c.fill();
    c.fillStyle = '#fff'; c.font = `700 30px ${F}`; c.textAlign = 'center'; c.fillText('Onayla ve kaydet', w / 2, 1148);
  });

  function cardTex(w, h, bg, draw) { return tex(w, h, (c, W, H) => { c.fillStyle = bg; rr(c, 4, 4, W - 8, H - 8, 40); c.fill(); c.strokeStyle = 'rgba(14,31,29,.12)'; c.lineWidth = 3; c.stroke(); draw(c, W, H); }); }
  const faturaTex = cardTex(420, 560, '#fffdf8', (c, w) => {
    c.fillStyle = '#0b6e66'; c.font = `700 30px ${F}`; c.fillText('FATURA', 36, 70);
    c.fillStyle = '#667573'; c.font = `22px ${F}`; c.fillText('Örnek Toptan Gıda Ltd.', 36, 108);
    for (let i = 0; i < 7; i++) { c.fillStyle = '#e3e8e5'; rr(c, 36, 150 + i * 46, 220 + (i % 3) * 40, 14, 7); c.fill(); c.fillStyle = '#d9d0bd'; rr(c, w - 130, 150 + i * 46, 94, 14, 7); c.fill(); }
    c.fillStyle = '#10201f'; c.font = `700 36px ${F}`; c.textAlign = 'right'; c.fillText('23.780 ₺', w - 36, 510);
  });
  const uyariTex = cardTex(520, 220, '#fdf1d6', (c, w) => {
    c.fillStyle = '#e8a317'; c.beginPath(); c.arc(70, 110, 34, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.font = `700 40px ${F}`; c.textAlign = 'center'; c.fillText('!', 70, 124);
    c.textAlign = 'left'; c.fillStyle = '#7a4705'; c.font = `700 34px ${F}`; c.fillText('Fiyat arttı', 128, 96);
    c.font = `28px ${F}`; c.fillText('Dana kıyma +%8,7', 128, 140);
  });
  const okunduTex = cardTex(440, 200, '#ffffff', (c) => {
    c.fillStyle = '#12793d'; c.beginPath(); c.arc(76, 100, 36, 0, 7); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(60, 102); c.lineTo(73, 116); c.lineTo(96, 86); c.stroke();
    c.fillStyle = '#10201f'; c.font = `700 34px ${F}`; c.fillText('Okundu', 134, 92);
    c.fillStyle = '#667573'; c.font = `26px ${F}`; c.fillText('4 saniyede', 134, 134);
  });
  const bakiyeTex = cardTex(460, 220, '#0b6e66', (c, w) => {
    c.fillStyle = '#a9cfc9'; c.font = `26px ${F}`; c.fillText('Cari bakiye', 36, 70);
    c.fillStyle = '#ffb3b6'; c.font = `700 52px ${F}`; c.fillText('−14.200 ₺', 36, 140);
    c.fillStyle = '#d7ece8'; c.font = `24px ${F}`; c.fillText('Örnek Toptan Gıda', 36, 184);
  });

  /* ---------- telefon ---------- */
  const phone = new THREE.Group(); scene.add(phone);
  const PW = 1.5, PH = 3.05, R = 0.24;
  const shape = new THREE.Shape();
  shape.moveTo(-PW / 2 + R, -PH / 2);
  shape.lineTo(PW / 2 - R, -PH / 2); shape.absarc(PW / 2 - R, -PH / 2 + R, R, -Math.PI / 2, 0);
  shape.lineTo(PW / 2, PH / 2 - R); shape.absarc(PW / 2 - R, PH / 2 - R, R, 0, Math.PI / 2);
  shape.lineTo(-PW / 2 + R, PH / 2); shape.absarc(-PW / 2 + R, PH / 2 - R, R, Math.PI / 2, Math.PI);
  shape.lineTo(-PW / 2, -PH / 2 + R); shape.absarc(-PW / 2 + R, -PH / 2 + R, R, Math.PI, Math.PI * 1.5);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 5, curveSegments: 20 });
  bodyGeo.translate(0, 0, -0.06);
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x0e1f1d, metalness: 0.65, roughness: 0.28 }));
  phone.add(body);
  const sw = PW - 0.14, sh = PH - 0.14;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: screenTex }));
  scr.position.z = 0.108; phone.add(scr);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(sw, 0.05), new THREE.MeshBasicMaterial({ color: 0xe8a317, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.z = 0.112; phone.add(beam);

  /* ---------- yüzen kartlar ---------- */
  function plane(t, w, h) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); scene.add(m); return m; }
  const fatura = plane(faturaTex, 1.35, 1.8);
  const uyari = plane(uyariTex, 1.7, 0.72);
  const okundu = plane(okunduTex, 1.45, 0.66);
  const bakiye = plane(bakiyeTex, 1.5, 0.72);
  const coins = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 28), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe8a317 : 0xf5c75a, metalness: 0.85, roughness: 0.25 }));
    m.userData = { a: Math.random() * 6.28, r: 2.1 + Math.random() * 1.2, y: (Math.random() - 0.5) * 3.2, s: 0.4 + Math.random() * 0.6 };
    scene.add(m); coins.push(m);
  }

  /* ---------- boyut, etkileşim, döngü ---------- */
  let hw = 2.5, cs = 1, mx = 0, my = 0, p = 0, visible = true, narrow = false;
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    narrow = w < 520; cam.position.z = narrow ? 10.5 : 8.2; cam.updateProjectionMatrix(); hw = Math.tan(cam.fov * Math.PI / 360) * cam.position.z * cam.aspect; cs = Math.min(1, hw / 2.7);
  }
  new ResizeObserver(resize).observe(host); resize();
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  addEventListener('scroll', () => { const r = host.getBoundingClientRect(); p = Math.min(1, Math.max(0, -r.top / (r.height * 0.9))); }, { passive: true });
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) loop(); }).observe(host);

  const ease = t => t * t * (3 - 2 * t);
  const clock = new THREE.Clock();
  let ry = 0, rx = 0, first = true;
  function loop() {
    if (!visible) return;
    const t = clock.getElapsedTime();
    ry += ((-0.38 + mx * 0.7 + p * 0.9) - ry) * 0.06;
    rx += ((my * 0.35 - p * 0.1) - rx) * 0.06;
    phone.rotation.set(rx, ry, -0.04 + Math.sin(t * 0.6) * 0.015);
    phone.position.y = Math.sin(t * 0.9) * 0.07 - p * 0.2;
    beam.position.y = Math.sin(t * 1.4) * (sh * 0.34) + 0.15;
    beam.material.opacity = 0.35 + 0.55 * Math.abs(Math.cos(t * 1.4));

    const e = ease(p), sx = hw / 2.6;
    fatura.position.set(-hw * 0.56 + e * hw * 0.56, 0.5 - e * 0.4 + Math.sin(t * 0.8) * 0.1, 0.6 - e * 0.7);
    fatura.rotation.set(0, 0.35 - e * 0.35, -0.12 + e * 0.12); fatura.material.opacity = 1 - ease(Math.min(1, e * 1.4));
    fatura.scale.setScalar(cs);
    okundu.position.set(-hw * 0.52, -1.45 + Math.sin(t * 1.1 + 1) * 0.08, 0.9); okundu.rotation.set(0, 0.25, 0.05);
    okundu.material.opacity = ease(Math.min(1, Math.max(0, (e - 0.35) / 0.4))); okundu.scale.setScalar(cs);
    uyari.position.set(hw * 0.7, 0.9 + Math.sin(t * 0.9 + 2) * 0.1, 0.9); uyari.rotation.set(0, -0.3, 0.06); uyari.scale.setScalar(cs);
    uyari.material.opacity = ease(Math.min(1, Math.max(0, (e - 0.2) / 0.5)));
    bakiye.position.set(hw * 0.68, -1.4 + Math.sin(t * 1.0 + 4) * 0.09, 0.7); bakiye.rotation.set(0, -0.28, -0.05); bakiye.scale.setScalar(cs);
    bakiye.material.opacity = ease(Math.min(1, Math.max(0, (e - 0.5) / 0.5)));
    coins.forEach(m => { const d = m.userData, a = d.a + t * d.s * 0.4; m.position.set(Math.cos(a) * d.r * Math.min(sx,1.3), d.y + Math.sin(t * d.s + d.a) * 0.15, -1.3 + Math.sin(a) * 0.9); m.rotation.set(t * d.s, t * 0.5 * d.s + d.a, 0); });
    renderer.render(scene, cam);
    if (first) { first = false; host.classList.add('hazir'); }
    requestAnimationFrame(loop);
  }
  loop();
}
