// AI engineer workstations (CLAUDE and GEMINI) for the Agent HQ 3D headquarters. PREVIEW.
//
// Additive module: it only adds objects to the existing scene and fills the existing dossier
// drawer. It creates no connection to any model, API or agent session. What it shows about each
// engineer comes from one static records file (ai_engineers_records.json); in this public copy it holds
// fictional sample data. If that file is missing, the stations show UNAVAILABLE rather than anything invented.

const RECORDS_URL = './ai_engineers_records.json';

// What each state means, and how the android behaves in it. Only WORKING types at the keyboard.
export const STATES = {
  WORKING:      { label: 'WORKING',      color: '#34D399', glow: 1.00, hint: 'A session is recorded as running now.' },
  IDLE:         { label: 'IDLE',         color: '#38BDF8', glow: 0.75, hint: 'Available. No task recorded as running.' },
  PAUSED:       { label: 'PAUSED',       color: '#F59E0B', glow: 0.45, hint: 'Stopped by an owner decision.' },
  UNAVAILABLE:  { label: 'UNAVAILABLE',  color: '#EF4444', glow: 0.20, hint: 'Cannot be used, or no record could be read.' },
  NO_LIVE_LINK: { label: 'NO LIVE LINK', color: '#94A3B8', glow: 0.65, hint: 'Last recorded state only. This page has no live connection.' },
};

const DESIGN = {
  CLAUDE: {
    name: 'CLAUDE', side: -1,
    shell: 0xF2F4F6, shellRough: 0.24, shellMetal: 0.18,
    under: 0x15181D, glow: 0xF5A623, glowCss: '#F5A623', eye: 0xFFD79A,
  },
  GEMINI: {
    name: 'GEMINI', side: 1,
    shell: 0x5B6B82, shellRough: 0.28, shellMetal: 0.60,
    under: 0x161C26, glow: 0x2F8BFF, glowCss: '#2F8BFF', eye: 0x9CCBFF,
  },
};

// Connection health. Separate from what an agent is doing. Categories only: no percentages are shown
// because no evidence source provides one.
export const HEALTH = {
  HEALTHY:  { label: 'HEALTHY',  color: '#34D399', hint: 'Confirmed alive by a live process heartbeat.' },
  DEGRADED: { label: 'DEGRADED', color: '#F59E0B', hint: 'Running, but reported as degraded or blocked.' },
  OFFLINE:  { label: 'OFFLINE',  color: '#94A3B8', hint: 'No running process.' },
  PAUSED:   { label: 'PAUSED',   color: '#94A3B8', hint: 'Stopped by an owner decision.' },
  UNKNOWN:  { label: 'UNKNOWN',  color: '#64748B', hint: 'No heartbeat or process evidence is available.' },
};
// What the agent is doing, and how much its station and character move for it. Only WORKING types.
export const ACTIVITY = {
  WORKING: { label: 'WORKING', typing: 1, motion: 1.00, glow: 1.00 },
  IDLE:    { label: 'IDLE',    typing: 0, motion: 0.55, glow: 0.30 },
  PAUSED:  { label: 'PAUSED',  typing: 0, motion: 0.12, glow: 0.00 },
  OFFLINE: { label: 'OFFLINE', typing: 0, motion: 0.12, glow: 0.00 },
  UNKNOWN: { label: 'NO LIVE EVIDENCE', typing: 0, motion: 0.30, glow: 0.00 },
};
const SPECIALIST_POLL_MS = 5000;

export function installAIEngineers({ THREE, scene, interactiveObjects, camera = null, roster = [], getController = () => null }) {
  const stations = {};
  const tags = {};          // floating name tags for every agent, androids and specialists alike
  const rings = {};         // floor glow under each specialist station, lit only by real activity
  const status = {};        // id -> { health, activity, basis, asOf, live }
  let records = null;
  let recordsError = null;

  // ---------------------------------------------------------------- helpers
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };

  function haloTexture(css) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, css + 'AA');
    grad.addColorStop(0.35, css + '44');
    grad.addColorStop(1, css + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function screenTexture(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    return { canvas: c, ctx: c.getContext('2d'), tex };
  }

  function wrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text).split(/\s+/);
    let line = '';
    let lines = 0;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        line = word;
        if (lines >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, y + lines * lineHeight);
    return y + (lines + 1) * lineHeight;
  }

  // ---------------------------------------------------------------- android
  function buildAndroid(d) {
    const shell = new THREE.MeshPhysicalMaterial({
      color: d.shell, roughness: d.shellRough, metalness: d.shellMetal, clearcoat: 0.8, clearcoatRoughness: 0.18,
    });
    const under = new THREE.MeshStandardMaterial({ color: d.under, roughness: 0.42, metalness: 0.75 });
    const glow = new THREE.MeshBasicMaterial({ color: d.glow });
    const eyeMat = new THREE.MeshBasicMaterial({ color: d.eye });

    const body = new THREE.Group();          // faces +Z; the station turns it to face its desk
    const parts = { glowMats: [glow, eyeMat] };

    // Pelvis and segmented waist with thin light rings, as in the reference image.
    body.add(mesh(new THREE.BoxGeometry(0.34, 0.16, 0.26), under, 0, 0.60, 0));
    body.add(mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.20, 20), under, 0, 0.77, 0));
    for (const y of [0.72, 0.80]) {
      const ring = mesh(new THREE.TorusGeometry(0.118, 0.006, 8, 28), glow, 0, y, 0);
      ring.rotation.x = Math.PI / 2; ring.castShadow = false;
      body.add(ring);
    }

    // Chest: shell plates over a dark core.
    const torso = new THREE.Group();
    torso.position.set(0, 0.87, 0);
    // Tapered chest (broad at the shoulders, narrow at the waist) with a shoulder yoke and collar.
    const chest = mesh(new THREE.CylinderGeometry(0.205, 0.122, 0.34, 28), shell, 0, 0.19, 0);
    chest.scale.set(1.0, 1.0, 0.62);
    torso.add(chest);
    const yoke = mesh(new THREE.SphereGeometry(1, 24, 14), shell, 0, 0.355, 0);
    yoke.scale.set(0.212, 0.060, 0.132);
    torso.add(yoke);
    torso.add(mesh(new THREE.CylinderGeometry(0.072, 0.085, 0.035, 18), under, 0, 0.405, 0));
    // Back: dark spine channel with a light line, and two inset armour seams.
    const TILT = -0.145;
    const channel = mesh(new THREE.BoxGeometry(0.040, 0.31, 0.016), under, 0, 0.19, -0.106);
    channel.rotation.x = TILT; torso.add(channel);
    const spine = mesh(new THREE.BoxGeometry(0.012, 0.27, 0.012), glow, 0, 0.19, -0.116);
    spine.rotation.x = TILT; spine.castShadow = false; torso.add(spine);
    for (const sx of [-1, 1]) {
      const seam = mesh(new THREE.BoxGeometry(0.008, 0.24, 0.010), under, sx * 0.085, 0.20, -0.098);
      seam.rotation.x = TILT; seam.rotation.z = sx * 0.16; seam.castShadow = false; torso.add(seam);
    }
    const chestLight = mesh(new THREE.CircleGeometry(0.020, 20), glow, 0, 0.25, 0.114);
    chestLight.rotation.x = -0.145; chestLight.castShadow = false; torso.add(chestLight);
    body.add(torso);
    parts.torso = torso;

    // Neck and head.
    torso.add(mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.09, 14), under, 0, 0.43, 0));
    const head = new THREE.Group();
    head.position.set(0, 0.58, 0);
    const skull = mesh(new THREE.SphereGeometry(0.108, 28, 22), shell);
    skull.scale.set(0.90, 1.10, 1.02);
    head.add(skull);
    // Dark band around the back of the head, between the ear modules.
    const band = mesh(new THREE.TorusGeometry(0.097, 0.007, 8, 30, Math.PI), under, 0, 0.0, 0.0);
    band.rotation.x = Math.PI / 2; band.rotation.z = Math.PI; band.castShadow = false; head.add(band);
    const face = mesh(new THREE.SphereGeometry(0.108, 24, 18, 0, Math.PI * 2, 0, Math.PI), under, 0, -0.012, 0.022);
    face.scale.set(0.80, 0.92, 0.86);
    head.add(face);
    const facePlate = mesh(new THREE.SphereGeometry(0.106, 24, 18), shell, 0, -0.02, 0.034);
    facePlate.scale.set(0.70, 0.86, 0.80);
    head.add(facePlate);
    parts.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.0125, 12, 10), eyeMat, sx * 0.036, 0.004, 0.118);
      eye.scale.set(1.5, 0.75, 0.6); eye.castShadow = false;
      head.add(eye); parts.eyes.push(eye);
      // Ear module: dark disc with a light ring.
      const ear = mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.022, 20), under, sx * 0.108, 0.0, 0.0);
      ear.rotation.z = Math.PI / 2; head.add(ear);
      const earRing = mesh(new THREE.TorusGeometry(0.030, 0.005, 8, 22), glow, sx * 0.121, 0.0, 0.0);
      earRing.rotation.y = Math.PI / 2; earRing.castShadow = false; head.add(earRing);
    }
    torso.add(head);
    parts.head = head;

    // Arms: shoulders, upper arms hanging slightly forward, forearms resting toward the desk.
    parts.forearms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.232, 0.315, 0.0);
      const cap = mesh(new THREE.SphereGeometry(0.062, 18, 14), shell);
      cap.scale.set(1.0, 0.92, 1.05); arm.add(cap);
      arm.add(mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 14), under, 0, -0.065, 0.012));   // dark shoulder joint
      const upper = mesh(new THREE.CapsuleGeometry(0.041, 0.17, 4, 12), shell, 0, -0.17, 0.035);
      upper.rotation.x = -0.22; arm.add(upper);
      arm.add(mesh(new THREE.SphereGeometry(0.046, 14, 12), under, 0, -0.30, 0.065));
      const elbowLight = mesh(new THREE.SphereGeometry(0.012, 10, 8), glow, sx * 0.046, -0.30, 0.065);
      elbowLight.castShadow = false; arm.add(elbowLight);
      const fore = new THREE.Group();
      fore.position.set(0, -0.30, 0.065);
      const foreMesh = mesh(new THREE.CapsuleGeometry(0.037, 0.22, 4, 12), shell, 0, -0.015, 0.16);
      foreMesh.rotation.x = Math.PI / 2 - 0.10; fore.add(foreMesh);
      fore.add(mesh(new THREE.BoxGeometry(0.075, 0.03, 0.10), under, 0, -0.035, 0.33));
      arm.add(fore);
      torso.add(arm);
      parts.forearms.push(fore);
    }

    // Legs, seated: thighs forward, shins down.
    for (const sx of [-1, 1]) {
      const thigh = mesh(new THREE.CapsuleGeometry(0.066, 0.26, 4, 12), shell, sx * 0.10, 0.60, 0.22);
      thigh.rotation.x = Math.PI / 2; body.add(thigh);
      body.add(mesh(new THREE.SphereGeometry(0.062, 14, 12), under, sx * 0.10, 0.60, 0.43));
      const kneeLight = mesh(new THREE.SphereGeometry(0.012, 10, 8), glow, sx * 0.10, 0.60, 0.493);
      kneeLight.castShadow = false; body.add(kneeLight);
      body.add(mesh(new THREE.CapsuleGeometry(0.052, 0.30, 4, 12), shell, sx * 0.10, 0.33, 0.44));
      body.add(mesh(new THREE.BoxGeometry(0.095, 0.05, 0.21), under, sx * 0.10, 0.085, 0.49));
    }

    // Soft halo behind head and chest. One sprite, additive, no post-processing.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(d.glowCss), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55,
    }));
    halo.position.set(0, 1.28, 0);
    halo.scale.set(1.5, 1.8, 1);
    body.add(halo);
    parts.halo = halo;

    return { body, parts };
  }

  // ---------------------------------------------------------------- workstation
  function buildStation(id) {
    const d = DESIGN[id];
    const dark = new THREE.MeshStandardMaterial({ color: 0x1A2230, roughness: 0.30, metalness: 0.88 });
    const deskTopMat = new THREE.MeshStandardMaterial({ color: 0x0E141E, roughness: 0.18, metalness: 0.80 });
    const glow = new THREE.MeshBasicMaterial({ color: d.glow });

    const group = new THREE.Group();
    group.userData = { aiEngineerId: id };

    // Low plinth with an edge light, the same language as the owner dais.
    const plinth = mesh(new THREE.BoxGeometry(2.5, 0.08, 2.3), dark, 0, 0.04, 0.1);
    plinth.receiveShadow = true; group.add(plinth);
    const plinthGlow = mesh(new THREE.BoxGeometry(2.54, 0.022, 2.34), glow, 0, 0.012, 0.1);
    plinthGlow.castShadow = false; group.add(plinthGlow);

    // Desk.
    const desk = mesh(new THREE.BoxGeometry(1.9, 0.07, 0.82), deskTopMat, 0, 0.80, -0.30);
    desk.receiveShadow = true; group.add(desk);
    const edge = mesh(new THREE.BoxGeometry(1.93, 0.018, 0.85), glow, 0, 0.80, -0.30);
    edge.castShadow = false; group.add(edge);
    for (const sx of [-1, 1]) group.add(mesh(new THREE.BoxGeometry(0.10, 0.70, 0.66), dark, sx * 0.82, 0.43, -0.30));
    group.add(mesh(new THREE.BoxGeometry(0.62, 0.02, 0.20), dark, 0, 0.845, -0.06));       // keyboard

    // Three engineering monitors. Content is drawn from the records file once it loads.
    const screens = {};
    const addMonitor = (key, w, h, x, z, ry, px) => {
      const frame = mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.035), dark, x, 0.84 + 0.12 + h / 2, z);
      frame.rotation.y = ry; group.add(frame);
      group.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.14, 10), dark, x, 0.90, z));
      const s = screenTexture(px, Math.round(px * h / w));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.tex }));
      face.position.set(x + Math.sin(ry) * 0.019, 0.84 + 0.12 + h / 2, z + Math.cos(ry) * 0.019);
      face.rotation.y = ry; group.add(face);
      screens[key] = s;
    };
    addMonitor('main', 0.78, 0.46, 0, -0.52, 0, 624);
    addMonitor('left', 0.56, 0.36, -0.70, -0.42, 0.42, 448);
    addMonitor('right', 0.56, 0.36, 0.70, -0.42, -0.42, 448);

    // Nameplate on the far edge of the desk, readable from the briefing-table side.
    const plate = screenTexture(512, 96);
    const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.80, 0.15), new THREE.MeshBasicMaterial({ map: plate.tex }));
    plateMesh.position.set(0, 0.66, -0.716); plateMesh.rotation.y = Math.PI; group.add(plateMesh);
    plate.ctx.fillStyle = '#060B12'; plate.ctx.fillRect(0, 0, 512, 96);
    plate.ctx.strokeStyle = d.glowCss; plate.ctx.lineWidth = 3; plate.ctx.strokeRect(3, 3, 506, 90);
    plate.ctx.fillStyle = d.glowCss; plate.ctx.font = 'bold 54px sans-serif'; plate.ctx.textAlign = 'center';
    plate.ctx.fillText(d.name, 256, 67); plate.tex.needsUpdate = true;

    // Chair.
    const chair = new THREE.Group();
    chair.position.set(0, 0.08, 0.50);
    chair.add(mesh(new THREE.CylinderGeometry(0.20, 0.27, 0.42, 20), dark, 0, 0.21, 0));
    chair.add(mesh(new THREE.BoxGeometry(0.56, 0.09, 0.56), new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.55 }), 0, 0.46, 0));
    // Open, low-backed seat: a slim post and a lumbar bar, so the android stays visible from behind.
    chair.add(mesh(new THREE.BoxGeometry(0.06, 0.34, 0.05), dark, 0, 0.66, 0.27));
    chair.add(mesh(new THREE.BoxGeometry(0.44, 0.13, 0.06), new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.55 }), 0, 0.80, 0.265));
    const piping = mesh(new THREE.BoxGeometry(0.46, 0.014, 0.07), glow, 0, 0.872, 0.265);
    piping.castShadow = false; chair.add(piping);
    group.add(chair);

    // Android, seated, facing the desk (-Z in station space).
    const android = buildAndroid(d);
    android.body.position.set(0, 0.02, 0.50);
    android.body.rotation.y = Math.PI;
    group.add(android.body);

    // One small coloured light per station.
    const light = new THREE.PointLight(d.glow, 2.2, 3.6, 2);
    light.position.set(0, 1.75, -0.05);
    group.add(light);
    // Neutral fill from behind and above so the shell reads as its own colour from the usual camera side.
    const fill = new THREE.PointLight(0xDDE6F5, 3.0, 3.2, 2);
    fill.position.set(d.side * -0.5, 2.0, 1.35);
    group.add(fill);

    // Workstations sit on the floor either side of the owner dais, turned slightly toward it.
    group.position.set(d.side * 4.35, 0, 0.45);
    group.rotation.y = d.side * 0.38;

    scene.add(group);
    interactiveObjects.push(group);

    stations[id] = { id, design: d, group, android, screens, light, baseLight: 2.2, phase: d.side > 0 ? 1.7 : 0 };
    group.updateMatrixWorld(true);
    const anchor = group.localToWorld(new THREE.Vector3(0, 2.22, 0.30));
    makeTag(id, d.name, d.glowCss, () => anchor);
    paint(id);
  }

  // ---------------------------------------------------------------- name tags and health
  const clock = (iso) => (iso ? String(iso).slice(5, 16).replace('T', ' ') + 'Z' : 'never');

  /** Health and activity for an android, from its static record. Never reported as live. */
  function statusFromRecord(rec) {
    const at = rec.last_record ? rec.last_record.at : null;
    const lastKnown = at ? ` Last recorded activity ${at}.` : '';
    const map = {
      WORKING:      ['HEALTHY', 'WORKING'],
      IDLE:         ['HEALTHY', 'IDLE'],
      PAUSED:       ['PAUSED', 'PAUSED'],
      UNAVAILABLE:  ['OFFLINE', 'OFFLINE'],
      NO_LIVE_LINK: ['UNKNOWN', 'UNKNOWN'],
    };
    const [health, activity] = map[rec.state] || ['UNKNOWN', 'UNKNOWN'];
    return { health, activity, live: false, asOf: at, basis: (rec.state_basis || 'No record.') + lastKnown };
  }

  function makeTag(id, name, accentCss, anchorFn) {
    const t = screenTexture(512, 184);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthWrite: false, depthTest: false }));
    sprite.renderOrder = 20;
    scene.add(sprite);                      // in the scene, not in any clickable group: tags never take a click
    sprite.raycast = () => {};
    tags[id] = { ...t, sprite, name: String(name).toUpperCase(), accentCss, anchorFn, base: [1.15, 0.413] };
    if (!status[id]) status[id] = { health: 'UNKNOWN', activity: 'UNKNOWN', live: false, asOf: null, basis: 'Waiting for the first status read.' };
    paintTag(id);
  }

  function paintTag(id) {
    const tag = tags[id];
    if (!tag) return;
    const st = status[id];
    const health = HEALTH[st.health] || HEALTH.UNKNOWN;
    const activity = ACTIVITY[st.activity] || ACTIVITY.UNKNOWN;
    const { ctx, tex } = tag;
    ctx.clearRect(0, 0, 512, 184);
    ctx.fillStyle = 'rgba(6, 11, 18, 0.84)';
    ctx.beginPath(); ctx.roundRect(28, 6, 456, 172, 14); ctx.fill();
    ctx.strokeStyle = tag.accentCss; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = tag.accentCss;
    let size = 54; ctx.font = `bold ${size}px sans-serif`;
    while (size > 30 && ctx.measureText(tag.name).width > 430) { size -= 2; ctx.font = `bold ${size}px sans-serif`; }
    ctx.fillText(tag.name, 256, 64);

    // Health bar: a category, never a percentage.
    const x = 70, y = 82, w = 372, h = 16;
    ctx.fillStyle = '#0F172A'; ctx.fillRect(x, y, w, h);
    if (st.health === 'UNKNOWN') {
      ctx.setLineDash([10, 8]); ctx.strokeStyle = health.color; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    } else {
      ctx.fillStyle = health.color; ctx.globalAlpha = (st.health === 'OFFLINE' || st.health === 'PAUSED') ? 0.45 : 1; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
      if (st.health === 'DEGRADED') {
        ctx.strokeStyle = '#0F172A'; ctx.lineWidth = 4;
        for (let i = -h; i < w; i += 18) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
      }
    }
    ctx.fillStyle = health.color; ctx.font = 'bold 26px monospace';
    ctx.fillText('HEALTH ' + health.label, 256, 130);
    ctx.fillStyle = '#94A3B8'; ctx.font = '19px monospace';
    ctx.fillText(`${activity.label} · ${st.live ? 'live ' + clock(st.asOf) : (st.asOf ? 'last known ' + clock(st.asOf) : 'no timestamp')}`, 256, 160);
    tex.needsUpdate = true;
  }

  // The nine specialists. Their health is read live from Mission Control, which derives it from the
  // worker process heartbeat. Nothing is assumed when that cannot be read.
  function buildSpecialistTags() {
    for (const agent of roster) {
      const fallback = new THREE.Vector3(agent.pos.x, 2.30, agent.pos.z);
      const here = new THREE.Vector3();
      makeTag(agent.id, agent.name, agent.accentHex, () => {
        const ctrl = getController(agent.id);
        if (ctrl && ctrl.model) return here.set(ctrl.model.position.x, ctrl.isSeated ? 2.05 : 2.30, ctrl.model.position.z);
        return fallback;
      });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.25, 2.33, 64),
        new THREE.MeshBasicMaterial({ color: agent.accentColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(agent.pos.x, 0.015, agent.pos.z);
      ring.visible = false;
      ring.raycast = () => {};
      scene.add(ring);
      rings[agent.id] = ring;
    }
  }

  function setSpecialistStatus(id, next) {
    const prev = status[id] || {};
    status[id] = next;
    if (prev.health !== next.health || prev.activity !== next.activity || prev.live !== next.live || clock(prev.asOf) !== clock(next.asOf)) paintTag(id);
  }

  async function pollSpecialists() {
    if (!roster.length) return;
    const asOf = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    try {
      const get = (url) => fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.json(); });
      const [agents, worker, jobs] = await Promise.all([
        get('/api/agents'),
        get('/api/worker'),
        get('/api/jobs').catch(() => [])
      ]);
      const condition = String(worker.worker_condition || 'not reported').toUpperCase();
      const source = `Mission Control worker heartbeat: running=${worker.worker_running === true}, condition=${condition}, pid=${worker.pid ?? 'none'}.`;
      const degraded = worker.worker_running === true && /DEGRAD|STALE|BLOCK|ERROR/.test(condition);
      const byId = Object.fromEntries((Array.isArray(agents) ? agents : []).map((a) => [a.id, a]));
      for (const agent of roster) {
        const reported = byId[agent.id] ? String(byId[agent.id].operational_health || '') : '';
        let health = 'UNKNOWN', activity = 'UNKNOWN', live = false;
        if (reported === 'ACTIVE_WORKING') { health = 'HEALTHY'; activity = 'WORKING'; live = true; }
        else if (reported === 'ONLINE_IDLE') { health = 'HEALTHY'; activity = 'IDLE'; live = true; }
        else if (reported === 'OFFLINE') { health = 'OFFLINE'; activity = 'OFFLINE'; live = true; }
        if (degraded && health === 'HEALTHY') health = 'DEGRADED';
        setSpecialistStatus(agent.id, { health, activity, live, asOf,
          basis: reported ? `${source} Reported for this agent: ${reported}.` : `${source} This agent is not in the Mission Control agent list.` });

        // Update radial workstation center monitor in 3D scene
        if (window.__hqCenterMonitors && window.__hqCenterMonitors[agent.id]) {
          const mon = window.__hqCenterMonitors[agent.id];
          if (activity === 'WORKING') {
            const activeJob = Array.isArray(jobs) ? jobs.find(j => j.assigned_agent === agent.id && (j.status === 'IN_PROGRESS' || j.status === 'ACTIVE' || j.status === 'RUNNING')) : null;
            if (activeJob) {
              const displayTitle = activeJob.title.length > 34 ? activeJob.title.substring(0, 32) + '...' : activeJob.title;
              mon.updateContent(
                `⚡ TASK: ${activeJob.job_id}`,
                [
                  `TITLE: ${displayTitle}`,
                  `STATUS: ${activeJob.status} • PROGRESS: ${activeJob.progress || 'ACTIVE'}`,
                  `PID: ${worker.pid || 'RUNNING'} • BEAT: HEALTHY`
                ],
                '#10B981'
              );
            } else {
              mon.updateContent(
                `⚡ ACTIVE: ${agent.id}`,
                [
                  `WORKER PID: ${worker.pid || 'RUNNING'}`,
                  `CONDITION: ${condition}`,
                  `SUBAGENT TELEMETRY SYNCED`
                ],
                agent.accentHex || '#38BDF8'
              );
            }
          } else if (activity === 'IDLE') {
            mon.updateContent(
              `STANDBY // IDLE`,
              [
                `AGENT: ${agent.id} (${agent.name})`,
                `STATION: ONLINE_IDLE`,
                `AWAITING TASK DISPATCH`
              ],
              agent.accentHex || '#38BDF8'
            );
          } else if (activity === 'OFFLINE') {
            mon.updateContent(
              `OFFLINE // STANDBY`,
              [
                `AGENT: ${agent.id} (${agent.name})`,
                `STATION: OFFLINE`,
                `NO ACTIVE WORKER PROCESS`
              ],
              '#64748B'
            );
          }
        }
      }
    } catch (err) {
      for (const agent of roster) {
        setSpecialistStatus(agent.id, { health: 'UNKNOWN', activity: 'UNKNOWN', live: false, asOf: null,
          basis: `Mission Control status could not be read (${err.message}). No health is assumed.` });
        if (window.__hqCenterMonitors && window.__hqCenterMonitors[agent.id]) {
          window.__hqCenterMonitors[agent.id].updateContent(
            `DISCONNECTED`,
            [
              `AGENT: ${agent.id} (${agent.name})`,
              `TELEMETRY: UNAVAILABLE`,
              `AUTHENTICATE AT OWNER DESK`
            ],
            '#64748B'
          );
        }
      }
    }
    // The page's built-in HUD starts with a fixed "ONLINE_ACTIVE" badge for the orchestrator. Replace it with what was read.
    const hudBadge = document.getElementById('agent-hud-badge');
    if (hudBadge && hudBadge.textContent.trim() === 'ONLINE_ACTIVE' && status.ORCHESTRATOR) {
      const h = HEALTH[status.ORCHESTRATOR.health] || HEALTH.UNKNOWN;
      hudBadge.textContent = h.label; hudBadge.style.color = h.color;
    }
  }

  /** Motion and typing level for a specialist, for the page's own character animation. */
  function activityOf(id) {
    return ACTIVITY[(status[id] || {}).activity] || ACTIVITY.UNKNOWN;
  }

  /** Put a specialist's live health and activity into the open dossier drawer. */
  function showSpecialistStatus(id) {
    const st = status[id];
    const content = document.querySelector('#owner-agent-drawer .drawer-content');
    if (!st || !content) return;
    const health = HEALTH[st.health] || HEALTH.UNKNOWN;
    const activity = ACTIVITY[st.activity] || ACTIVITY.UNKNOWN;
    const el = document.createElement('div');
    el.className = 'drawer-card ai-engineer-card';
    el.innerHTML = `<div class="drawer-card-title"><span>Health and activity</span><span style="color:${health.color}; font-weight:700;">${health.label}</span></div>` +
      `<div class="drawer-meta-line"><span>Connection health:</span> <strong style="color:${health.color};">${health.label}</strong></div>` +
      `<div class="drawer-meta-line"><span>Activity:</span> <strong>${activity.label}</strong></div>` +
      `<div class="drawer-meta-line"><span>${st.live ? 'Read live at:' : 'Last known:'}</span> <strong>${esc(st.asOf || 'no timestamp')}</strong></div>` +
      `<div class="drawer-log-box">${esc(st.basis)}</div>` +
      `<div style="font-size:10px; color:#64748B; margin-top:6px;">The assignment and telemetry cards below are the orchestrator's configured descriptions, not live activity.</div>`;
    content.insertBefore(el, content.firstChild);
    const pill = document.getElementById('drawer-status-pill');
    if (pill) { pill.textContent = `${health.label} · ${activity.label}`; pill.style.color = health.color; }
    const hudBadge = document.getElementById('agent-hud-badge');
    if (hudBadge) { hudBadge.textContent = health.label; hudBadge.style.color = health.color; }
  }

  // ---------------------------------------------------------------- records -> screens
  function recordFor(id) {
    if (records && records.engineers && records.engineers[id]) return records.engineers[id];
    return {
      state: 'UNAVAILABLE',
      state_basis: recordsError ? `Records file could not be read (${recordsError}).` : 'Records are loading.',
      identity: '', role: '', last_record: null, assignments: [], evidence: [], notes: [],
    };
  }

  function paint(id) {
    const st = stations[id];
    const d = st.design;
    const rec = recordFor(id);
    const state = STATES[rec.state] || STATES.UNAVAILABLE;

    // Floating tag: derived from the same record.
    status[id] = statusFromRecord(rec);
    paintTag(id);

    // Main monitor: identity, state, last record.
    {
      const { canvas, ctx, tex } = st.screens.main;
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = '#060B12'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = d.glowCss; ctx.lineWidth = 3; ctx.strokeRect(4, 4, W - 8, H - 8);
      ctx.textAlign = 'left';
      ctx.fillStyle = d.glowCss; ctx.font = 'bold 34px sans-serif'; ctx.fillText(d.name, 22, 48);
      ctx.fillStyle = state.color; ctx.font = 'bold 22px monospace'; ctx.fillText(state.label, 22, 82);
      ctx.fillStyle = '#94A3B8'; ctx.font = '15px sans-serif';
      let y = wrap(ctx, rec.identity || 'No identity recorded', 22, 112, W - 44, 20, 2);
      ctx.fillStyle = '#CBD5E1'; ctx.font = '15px sans-serif';
      y = wrap(ctx, rec.state_basis || '', 22, y + 8, W - 44, 20, 3);
      if (rec.last_record) {
        ctx.fillStyle = d.glowCss; ctx.font = 'bold 15px monospace'; ctx.fillText('LAST RECORD', 22, y + 14);
        ctx.fillStyle = '#F8FAFC'; ctx.font = '15px sans-serif';
        y = wrap(ctx, `${rec.last_record.status} · ${rec.last_record.title}`, 22, y + 36, W - 44, 20, 3);
        ctx.fillStyle = '#64748B'; ctx.font = '13px monospace';
        ctx.fillText(String(rec.last_record.at || ''), 22, Math.min(y + 4, H - 16));
      }
      tex.needsUpdate = true;
    }

    // Left monitor: assignments on record.
    {
      const { canvas, ctx, tex } = st.screens.left;
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = '#060B12'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = d.glowCss; ctx.lineWidth = 2; ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.textAlign = 'left';
      ctx.fillStyle = d.glowCss; ctx.font = 'bold 17px monospace'; ctx.fillText('ASSIGNMENTS ON RECORD', 16, 30);
      let y = 58;
      const list = rec.assignments || [];
      if (!list.length) { ctx.fillStyle = '#64748B'; ctx.font = '15px sans-serif'; ctx.fillText('None recorded.', 16, y); }
      for (const a of list.slice(0, 4)) {
        ctx.fillStyle = '#F8FAFC'; ctx.font = 'bold 14px sans-serif';
        y = wrap(ctx, a.title, 16, y, W - 32, 18, 2);
        ctx.fillStyle = '#94A3B8'; ctx.font = '13px monospace';
        y = wrap(ctx, a.status, 16, y, W - 32, 17, 1) + 10;
        if (y > H - 20) break;
      }
      tex.needsUpdate = true;
    }

    // Right monitor: measured numbers from the records, as plain figures.
    {
      const { canvas, ctx, tex } = st.screens.right;
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = '#060B12'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = d.glowCss; ctx.lineWidth = 2; ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.textAlign = 'left';
      ctx.fillStyle = d.glowCss; ctx.font = 'bold 17px monospace'; ctx.fillText('RECORDED FIGURES', 16, 30);
      let y = 62;
      const figures = rec.figures || [];
      if (!figures.length) { ctx.fillStyle = '#64748B'; ctx.font = '15px sans-serif'; ctx.fillText('None recorded.', 16, y); }
      for (const f of figures.slice(0, 5)) {
        ctx.fillStyle = '#F8FAFC'; ctx.font = 'bold 24px monospace'; ctx.fillText(String(f.value), 16, y);
        ctx.fillStyle = '#94A3B8'; ctx.font = '13px sans-serif'; ctx.fillText(String(f.label), 16, y + 18);
        y += 54;
        if (y > H - 10) break;
      }
      ctx.fillStyle = '#64748B'; ctx.font = '12px monospace';
      ctx.fillText('static snapshot · not live', 16, H - 12);
      tex.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- drawer
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function resetDrawer() {
    const content = document.querySelector('#owner-agent-drawer .drawer-content');
    if (!content) return;
    content.querySelectorAll('.ai-engineer-card').forEach((n) => n.remove());
    content.querySelectorAll('.drawer-card').forEach((n) => { n.style.display = ''; });
    const pill = document.getElementById('drawer-status-pill');
    if (pill) { pill.textContent = 'ONLINE_ACTIVE'; pill.style.color = '#34D399'; }
  }

  function openPanel(id) {
    const st = stations[id];
    if (!st) return;
    const d = st.design;
    const rec = recordFor(id);
    const state = STATES[rec.state] || STATES.UNAVAILABLE;
    resetDrawer();

    document.getElementById('drawer-name').textContent = d.name;
    document.getElementById('drawer-role').textContent = rec.role || 'AI engineer';
    const badge = document.getElementById('drawer-avatar');
    badge.textContent = d.name.substring(0, 2);
    badge.style.color = d.glowCss; badge.style.borderColor = d.glowCss;

    const content = document.querySelector('#owner-agent-drawer .drawer-content');
    content.querySelectorAll('.drawer-card').forEach((n) => { n.style.display = 'none'; });   // specialist-only cards

    const card = (title, html) => {
      const el = document.createElement('div');
      el.className = 'drawer-card ai-engineer-card';
      el.innerHTML = `<div class="drawer-card-title">${title}</div>${html}`;
      content.appendChild(el);
    };
    const line = (k, v) => `<div class="drawer-meta-line"><span>${esc(k)}</span> <strong>${esc(v)}</strong></div>`;

    card(`<span>Status</span><span style="color:${state.color}; font-weight:700;">${state.label}</span>`,
      `<div class="drawer-log-box">${esc(rec.state_basis)}</div>` +
      `<div style="font-size:10px; color:#64748B; margin-top:6px;">${esc(state.hint)}</div>` +
      line('Connection health:', (HEALTH[(status[id] || {}).health] || HEALTH.UNKNOWN).label + ' (static record, not live)') +
      line('Identity:', rec.identity || 'not recorded') +
      line('Records as of:', records ? records.as_of : 'not loaded'));

    if (rec.last_record) {
      card('Last recorded activity',
        `<div style="font-weight:700; color:#F8FAFC; margin-bottom:4px;">${esc(rec.last_record.title)}</div>` +
        line('Recorded status:', rec.last_record.status) + line('When:', rec.last_record.at) +
        (rec.last_record.detail ? `<div class="drawer-log-box">${esc(rec.last_record.detail)}</div>` : ''));
    }

    card('Assignments on record', (rec.assignments || []).length
      ? rec.assignments.map((a) => `<div style="margin-bottom:8px;"><div style="font-weight:700; color:#F8FAFC;">${esc(a.title)}</div>` +
          `<div style="font-size:10px; color:#94A3B8; font-family:monospace;">${esc(a.status)}</div></div>`).join('')
      : '<div style="color:#64748B;">None recorded.</div>');

    card('Evidence', (rec.evidence || []).length
      ? rec.evidence.map((e) => `<div style="margin-bottom:8px;"><div style="color:#CBD5E1;">${esc(e.label)}</div>` +
          `<div style="font-size:10px; color:#38BDF8; font-family:monospace; word-break:break-all;">${esc(e.path)}</div>` +
          (e.sha256 ? `<div style="font-size:10px; color:#64748B; font-family:monospace;">SHA-256 ${esc(e.sha256.slice(0, 16))}…</div>` : '')).join('')
      : '<div style="color:#64748B;">No evidence linked.</div>');

    if ((rec.notes || []).length) {
      card('What this station is not', `<ul style="margin:0; padding-left:16px; color:#94A3B8;">${rec.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`);
    }

    card('State legend', Object.values(STATES).map((s) =>
      `<div class="drawer-meta-line"><span style="color:${s.color}; font-weight:700;">${s.label}</span> <strong style="font-weight:400; color:#94A3B8;">${esc(s.hint)}</strong></div>`).join(''));

    const pill = document.getElementById('drawer-status-pill');
    if (pill) { pill.textContent = state.label; pill.style.color = state.color; }
    const hudName = document.getElementById('agent-hud-name');
    if (hudName) hudName.textContent = `${d.name} • ${rec.role || 'AI engineer'}`;
    const hudRoom = document.getElementById('agent-hud-room');
    if (hudRoom) hudRoom.textContent = `Station: beside the owner dais (${d.side < 0 ? 'left' : 'right'} side)`;
    const hudBadge = document.getElementById('agent-hud-badge');
    if (hudBadge) { hudBadge.textContent = state.label; hudBadge.style.color = state.color; }
    const hudAction = document.getElementById('agent-hud-action');
    if (hudAction) hudAction.innerHTML = `&gt; ${esc(rec.state_basis)}<br>&gt; Static snapshot. No live connection.`;

    document.getElementById('owner-agent-drawer').style.display = 'flex';
  }

  /** If the clicked object belongs to an AI engineer station, open its panel and return true. */
  function tryOpen(object) {
    let target = object;
    while (target && !(target.userData && target.userData.aiEngineerId)) target = target.parent;
    if (!target) return false;
    openPanel(target.userData.aiEngineerId);
    return true;
  }

  // ---------------------------------------------------------------- idle animation
  function update(time) {
    for (const st of Object.values(stations)) {
      const rec = recordFor(st.id);
      const state = STATES[rec.state] || STATES.UNAVAILABLE;
      const { parts } = st.android;
      const t = time + st.phase;
      const live = state.glow;                                   // dimmer and slower when paused or unavailable

      const breath = Math.sin(t * (0.9 + 0.5 * live)) * 0.010 * (0.5 + live);
      parts.torso.scale.set(1 + breath * 0.6, 1 + breath, 1 + breath * 0.6);
      parts.head.rotation.y = Math.sin(t * 0.31) * 0.20 * live;
      parts.head.rotation.x = 0.10 + Math.sin(t * 0.47) * 0.035 * live;

      // Hands move at the keyboard only when a session is actually recorded as working.
      const typing = (ACTIVITY[(status[st.id] || {}).activity] || ACTIVITY.UNKNOWN).typing;
      parts.forearms.forEach((f, i) => { f.rotation.x = typing * Math.sin(t * 7 + i * 1.9) * 0.035; });

      const pulse = 0.82 + 0.18 * Math.sin(t * 1.6);
      parts.halo.material.opacity = (0.16 + 0.38 * live) * pulse;
      parts.eyes.forEach((e) => { e.scale.y = 0.75 * (Math.sin(t * 0.9) > 0.985 ? 0.15 : 1); });   // rare blink
      st.light.intensity = st.baseLight * (0.25 + 0.75 * live) * pulse;
    }

    // Tags: stay above their agent, keep a readable size at a distance, pulse gently only while working.
    for (const [id, tag] of Object.entries(tags)) {
      const pos = tag.anchorFn();
      tag.sprite.position.copy(pos);
      const k = camera ? Math.min(2.3, Math.max(1.0, camera.position.distanceTo(pos) / 7.5)) : 1;
      tag.sprite.scale.set(tag.base[0] * k, tag.base[1] * k, 1);
      const working = (status[id] || {}).activity === 'WORKING';
      tag.sprite.material.opacity = working ? 0.86 + 0.14 * Math.sin(time * 2.2) : 0.94;
    }
    // Station floor glow: only for an agent with live evidence of work or idle availability.
    for (const [id, ring] of Object.entries(rings)) {
      const glowLevel = activityOf(id).glow;
      ring.visible = glowLevel > 0;
      if (ring.visible) ring.material.opacity = glowLevel * (0.30 + 0.20 * Math.sin(time * 1.8));
    }
  }

  // ---------------------------------------------------------------- start
  buildStation('CLAUDE');
  buildStation('GEMINI');
  buildSpecialistTags();
  pollSpecialists();
  setInterval(pollSpecialists, SPECIALIST_POLL_MS);

  fetch(RECORDS_URL, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((json) => { records = json; })
    .catch((err) => { recordsError = err.message; })
    .finally(() => { Object.keys(stations).forEach(paint); });

  // Small corner tag so nobody mistakes this build for the approved Headquarters.
  const tag = document.createElement('div');
  tag.textContent = 'PREVIEW BUILD · Claude and Gemini workstations · awaiting owner approval';
  tag.style.cssText = 'position:fixed; left:50%; bottom:8px; transform:translateX(-50%); z-index:50; padding:4px 12px; border-radius:6px;' +
    'background:rgba(6,11,18,0.85); border:1px dashed #F59E0B; color:#F59E0B; font:600 11px sans-serif; pointer-events:none;';
  if (/_ai_preview/.test(location.pathname)) document.body.appendChild(tag);   // preview pages only

  return { update, tryOpen, openPanel, resetDrawer, stations, tags, status, activityOf, showSpecialistStatus, pollSpecialists };
}
