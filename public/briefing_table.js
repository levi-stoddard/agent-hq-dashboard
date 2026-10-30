// Agent HQ briefing table: a product hologram above the central table and three read-only views.
// Additive module. The hologram is a schematic of a fictional Acme Widgets thermostat built from simple primitives.
// All text comes from briefing_table_records.json, a static sample file. Nothing here is live.

const MODES = [
  { id: 'system',   label: 'SYSTEM VIEW' },
  { id: 'mission',  label: 'MISSION VIEW' },
  { id: 'briefing', label: 'OWNER BRIEFING' },
];
// Component markers on the hologram (thermostat-space metres; the face points to +Z).
const COMPONENTS = [
  { id: 'SENSOR',  label: 'SENSOR',      color: 0x22D3EE, pos: [0, -0.62, 0.14],   lab: [0, -0.32, 0.25] },
  { id: 'DISPLAY', label: 'DISPLAY',     color: 0x818CF8, pos: [0, 0.05, 0.16],    lab: [0, 0.42, 0.25] },
  { id: 'MCU',     label: 'MCU',         color: 0xA78BFA, pos: [-0.45, 0.2, 0.02], lab: [-0.55, 0.3, 0.2] },
  { id: 'RADIO',   label: 'WI-FI RADIO', color: 0xF59E0B, pos: [0.45, 0.42, 0.02], lab: [0.5, 0.3, 0.2] },
  { id: 'BATTERY', label: 'BATTERY',     color: 0x34D399, pos: [0.4, -0.35, -0.08], lab: [0.5, -0.2, 0.2] },
];
const VIEW = { pos: { x: -1.9, y: 3.1, z: -0.4 }, look: { x: 0, y: 1.7, z: -3.8 } };
const HOLO_Y = 1.55;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function installBriefingTable({ THREE, interactiveObjects, tableGroup, oldHolo, tableMeshes, flyTo, onReturn }) {
  let records = null, recordsError = null;
  let active = false, mode = 'system', selected = null, glow = 0.55;

  // ---------------------------------------------------------------- scene
  if (oldHolo) oldHolo.visible = false;

  const pivot = new THREE.Group();
  pivot.position.set(0, HOLO_Y, 0);
  tableGroup.add(pivot);
  const product = new THREE.Group();
  pivot.add(product);

  const skinMat = new THREE.MeshBasicMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  const lineMat = new THREE.LineBasicMaterial({ color: 0x7DD3FC, transparent: true, opacity: 0.7, depthWrite: false });
  const solidMat = new THREE.MeshBasicMaterial({ color: 0x7DD3FC, transparent: true, opacity: 0.5, depthWrite: false });

  // Body: a round puck standing on its edge, with a bezel ring, a display disc and a wall plate behind it.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.22, 64, 1, true), skinMat);
  body.rotation.x = Math.PI / 2; product.add(body);
  const bodyEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.8, 0.8, 0.22, 32)), lineMat);
  bodyEdges.rotation.x = Math.PI / 2; product.add(bodyEdges);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.025, 8, 72), solidMat);
  bezel.position.z = 0.11; product.add(bezel);
  const display = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), new THREE.MeshBasicMaterial({ color: 0x818CF8, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
  display.position.z = 0.115; product.add(display);
  const plate = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.2, 0.04)), lineMat);
  plate.position.z = -0.14; product.add(plate);
  const board = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.66, 0.66, 0.02, 24)), lineMat);
  board.rotation.x = Math.PI / 2; product.add(board);
  product.scale.setScalar(0.85);

  const makeLabel = (text, color, w = 256) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = 56;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(6,11,18,0.82)'; g.fillRect(0, 0, w, 56);
    g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, 53);
    g.fillStyle = color; g.font = '700 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, 29);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
    sp.userData.aspect = w / 56; sp.raycast = () => {}; sp.renderOrder = 20;
    return sp;
  };

  const markers = {};
  COMPONENTS.forEach((def) => {
    const g = new THREE.Group(); g.position.set(...def.pos);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: def.color, transparent: true }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.22, depthWrite: false }));
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.userData = { tableComponent: def.id };
    const label = makeLabel(def.label, hex(def.color), def.label.length > 8 ? 360 : 256);
    label.position.set(def.lab[0] - def.pos[0], def.lab[1] - def.pos[1], def.lab[2] - def.pos[2]);
    g.add(core, halo, hit, label);
    product.add(g);
    interactiveObjects.push(hit);
    markers[def.id] = { def, group: g, core, halo, label };
  });

  // Faint polar grid at table height and a click target.
  const grid = new THREE.PolarGridHelper(1.74, 8, 4, 64, 0x38BDF8, 0x38BDF8);
  grid.material.transparent = true; grid.material.opacity = 0.16; grid.material.depthWrite = false; grid.position.y = -0.65;
  pivot.add(grid);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 1.0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  shell.position.set(0, HOLO_Y, 0); shell.userData = { isBriefingTable: true };
  tableGroup.add(shell); interactiveObjects.push(shell);
  (tableMeshes || []).forEach((m) => { m.userData = Object.assign(m.userData || {}, { isBriefingTable: true }); interactiveObjects.push(m); });
  const hint = makeLabel('BRIEFING TABLE · CLICK TO OPEN', '#7DD3FC', 520);
  hint.position.set(0, HOLO_Y + 1.0, 0); hint.scale.set(1.5, 1.5 / hint.userData.aspect, 1);
  tableGroup.add(hint);

  // ---------------------------------------------------------------- interface
  const css = document.createElement('style');
  css.textContent = `
    #bt-bar { position: fixed; top: 84px; left: 50%; transform: translateX(-50%); z-index: 60; display: none; gap: 6px; padding: 6px;
      background: rgba(6,11,18,0.9); border: 1px solid rgba(56,189,248,0.35); border-radius: 12px; font: 600 12px/1 system-ui, sans-serif; }
    #bt-bar button { cursor: pointer; padding: 9px 13px; border-radius: 8px; border: 1px solid rgba(148,163,184,0.3); background: rgba(15,23,42,0.9); color: #CBD5E1; font: inherit; letter-spacing: .04em; white-space: nowrap; }
    #bt-bar button:hover { border-color: #38BDF8; color: #F8FAFC; }
    #bt-bar button.on { background: #0C4A6E; border-color: #38BDF8; color: #F8FAFC; }
    #bt-bar button.ret { border-color: rgba(212,175,55,0.6); color: #FDE68A; margin-left: 8px; }
    #bt-panel { position: fixed; top: 138px; right: 16px; width: min(410px, calc(100vw - 32px)); max-height: calc(100vh - 160px); overflow: auto; z-index: 60; display: none;
      background: rgba(6,11,18,0.93); border: 1px solid rgba(56,189,248,0.3); border-radius: 12px; padding: 16px; color: #CBD5E1; font: 13px/1.5 system-ui, sans-serif; }
    #bt-panel h2 { margin: 0 0 2px; font-size: 17px; color: #F8FAFC; } #bt-panel h3 { margin: 16px 0 6px; font-size: 11px; letter-spacing: .09em; color: #7DD3FC; text-transform: uppercase; }
    #bt-panel .sub { color: #94A3B8; font-size: 12px; } #bt-panel ul { margin: 0; padding-left: 18px; } #bt-panel li { margin-bottom: 5px; }
    #bt-panel .warn { margin-top: 10px; padding: 8px 10px; border: 1px dashed #F59E0B; border-radius: 8px; color: #FCD34D; font-size: 12px; }
    #bt-panel .kv { display: grid; grid-template-columns: 38% 1fr; gap: 4px 10px; } #bt-panel .kv b { color: #94A3B8; font-weight: 600; }
    #bt-panel .req b { color: #F8FAFC; } #bt-panel .src { font-size: 11.5px; color: #94A3B8; word-break: break-all; margin-bottom: 8px; } #bt-panel .src b { color: #CBD5E1; }
    #bt-panel .chip { display: inline-block; padding: 1px 7px; border-radius: 999px; border: 1px solid #64748B; font-size: 11px; color: #E2E8F0; white-space: nowrap; }
    #bt-panel .chip.open { border-color: #F59E0B; color: #FCD34D; } #bt-panel .chip.done { border-color: #34D399; color: #6EE7B7; }
    #bt-panel .item { padding: 9px 0; border-top: 1px solid rgba(148,163,184,0.18); } #bt-panel .item:first-of-type { border-top: 0; }
    #bt-panel .pick { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; } #bt-panel .pick button, #bt-panel a.go { cursor: pointer; padding: 8px; border-radius: 8px; border: 1px solid rgba(148,163,184,0.3); background: rgba(15,23,42,0.9); color: #E2E8F0; font: 600 12px system-ui, sans-serif; text-align: left; }
    #bt-panel a.go { display: block; text-align: center; text-decoration: none; border-color: rgba(212,175,55,0.7); color: #FDE68A; margin-top: 10px; }
    #bt-panel table { width: 100%; border-collapse: collapse; font-size: 12px; } #bt-panel td, #bt-panel th { text-align: left; padding: 4px 6px 4px 0; border-bottom: 1px solid rgba(148,163,184,0.18); vertical-align: top; }
    #bt-panel .foot { margin-top: 14px; font-size: 11px; color: #64748B; }
  `;
  document.head.appendChild(css);
  const bar = document.createElement('div'); bar.id = 'bt-bar';
  const panel = document.createElement('div'); panel.id = 'bt-panel';
  document.body.append(bar, panel);
  [bar, panel].forEach((el) => ['click', 'pointerdown', 'wheel'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation())));
  MODES.forEach((m) => {
    const b = document.createElement('button'); b.textContent = m.label; b.dataset.mode = m.id;
    b.addEventListener('click', () => setMode(m.id)); bar.appendChild(b);
  });
  const ret = document.createElement('button'); ret.className = 'ret'; ret.textContent = '← Return to Headquarters';
  ret.addEventListener('click', () => deactivate()); bar.appendChild(ret);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) deactivate(); });

  const srcHtml = (list) => (list || []).map((s) => `<div class="src"><b>${esc(s.label)}</b><br>${esc(s.path)}<br>` +
    (s.present ? 'sample file in this repository' : 'illustrative path (not included)') + '</div>').join('');
  const kvHtml = (list) => '<div class="kv">' + (list || []).map((r) => `<b>${esc(r.k)}</b><span>${esc(r.v)}</span>`).join('') + '</div>';
  const foot = () => `<div class="foot">Static sample written ${esc(records.as_of)}. Fictional data. Not live. Read-only.</div>`;
  // Status Board link: HQ_CONFIG.statusBoardUrl (hq-config.local.js) wins; an empty string hides the link.
  const statusBoardUrl = () => {
    const cfg = window.HQ_CONFIG || {};
    if (typeof cfg.statusBoardUrl === 'string') return cfg.statusBoardUrl;
    return (records && records.owner && records.owner.board_url) || '';
  };

  function render() {
    bar.querySelectorAll('button[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    if (!records) { panel.innerHTML = `<h2>Briefing table</h2><div class="warn">${recordsError ? 'Records could not be read: ' + esc(recordsError) : 'Reading records…'}</div>`; return; }
    if (mode === 'system') {
      const c = selected && records.components[selected];
      if (!c) {
        panel.innerHTML = `<h2>System view</h2><div class="sub">Select a component below, or click a marker on the hologram.</div>
          <h3>Thermostat components (fictional product)</h3><div class="pick">${COMPONENTS.filter((d) => records.components[d.id]).map((d) => `<button data-pick="${d.id}" style="border-left:3px solid ${hex(d.color)}">${esc(records.components[d.id].name)}</button>`).join('')}</div>
          <div class="warn">The hologram is a schematic drawn from simple shapes. Positions are illustrative.</div>${foot()}`;
      } else {
        panel.innerHTML = `<h2>${esc(c.name)}</h2><div class="sub">${esc(c.role)}</div>
          <div class="warn">Placement: ${esc(c.placement)}</div>
          <h3>Known requirements</h3><ul class="req">${c.requirements.map((r) => `<li><b>${esc(r.id)}</b> · ${esc(r.text)}</li>`).join('')}</ul>
          <h3>Status</h3>${kvHtml(c.status)}
          ${c.open && c.open.length ? `<h3>Open items</h3><ul>${c.open.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
          <h3>Evidence</h3>${srcHtml(c.sources)}
          <div class="pick" style="margin-top:10px"><button data-pick="">← All components</button></div>${foot()}`;
      }
    } else if (mode === 'mission') {
      panel.innerHTML = '<h2>Mission view</h2><div class="sub">Current engineering work from the sample records. This is not a task register.</div>' + records.mission.map((m) => `
        <h3>${esc(m.id)} · ${esc(m.title)}</h3><div><span class="chip open">${esc(m.status)}</span></div><div class="sub">Recorded ${esc(m.recorded_utc)}</div>
        <div style="margin-top:8px">${kvHtml(m.facts)}</div>
        <h3>Options considered</h3><table><tr><th>Option</th><th>Decision</th><th>Data</th><th>Bench</th></tr>
          ${m.candidates.map((k) => `<tr><td>${esc(k.name)}</td><td>${esc(k.acquisition)}</td><td>${esc(k.recording)}</td><td>${esc(k.physical)}</td></tr>`).join('')}</table>
        <h3>Blockers</h3><ul>${m.blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        <h3>Evidence</h3>${srcHtml(m.sources)}`).join('') + foot();
    } else {
      const f = records.owner;
      const chip = (s) => `<span class="chip ${/OPEN|AWAIT|PEND/i.test(s) ? 'open' : 'done'}">${esc(s)}</span>`;
      const url = statusBoardUrl();
      panel.innerHTML = `<h2>Owner briefing</h2><div class="sub">${esc(f.authority)}</div>
        ${url ? `<a class="go" href="${esc(url)}" target="_blank" rel="noopener">Open the Status Board ↗</a>` : '<div class="sub">Status Board link not configured (set statusBoardUrl in hq-config.local.js).</div>'}
        <h3>Decisions on the Status Board</h3><div class="sub">Board data read ${esc(f.board_snapshot_utc)}. Approval states are as recorded there.</div>
        ${f.decisions.map((d) => `<div class="item"><b style="color:#F8FAFC">${esc(d.id)} · ${esc(d.title)}</b> ${chip(d.status)}<br>${esc(d.question)}<div class="sub">Reviewer: ${esc(d.required_reviewer)} · raised ${esc(d.raised_utc)}${d.owner_decision ? ' · decision recorded' : ' · no owner decision recorded'}</div></div>`).join('') || '<div class="sub">None in the sample.</div>'}
        <h3>Engineering items awaiting owners</h3>${f.engineering_open.map((d) => `<div class="item"><b style="color:#F8FAFC">${esc(d.title)}</b> ${chip(d.state)}<div class="sub">${esc(d.ref)}</div></div>`).join('')}
        <h3>From the owner brief</h3><div class="sub">${esc(f.brief_items.note)}</div>
        ${f.brief_items.items.map((d) => `<div class="item"><b style="color:#F8FAFC">${esc(d.title)}</b><div class="sub">${esc(d.owner)} · ${esc(d.ref)} · ${esc(d.next)}</div></div>`).join('')}
        ${foot()}`;
    }
    panel.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => select(b.dataset.pick || null)));
    panel.scrollTop = 0;
  }

  // ---------------------------------------------------------------- behaviour
  function select(id) {
    selected = id;
    if (mode !== 'system') { setMode('system'); return; }
    render();
  }
  function setMode(next) {
    mode = next;
    if (active) flyTo(VIEW.pos, VIEW.look);
    render();
  }
  const hudHidden = ['.hud-telemetry-box', '.hud-executive-card', '#hud-activity-banner'];
  const hud = (show) => hudHidden.forEach((q) => { const el = document.querySelector(q); if (el) el.style.visibility = show ? '' : 'hidden'; });
  function activate(next) {
    active = true; hud(false); hint.visible = false;
    bar.style.display = 'flex'; panel.style.display = 'block';
    setMode(next || mode);
  }
  function deactivate() {
    active = false; selected = null; hint.visible = true; hud(true);
    bar.style.display = 'none'; panel.style.display = 'none';
    if (onReturn) onReturn();
  }
  /** Called first by the page's click handler with the raycast hits. Returns true when the table used the click. */
  function tryClick(hits) {
    let onTable = false;
    for (const h of hits) {
      const ud = h.object.userData || {};
      if (ud.tableComponent) {
        if (active && mode === 'system') { select(ud.tableComponent); return true; }
        onTable = true; continue;
      }
      if (ud.isBriefingTable) { onTable = true; continue; }
      break;
    }
    if (!onTable) return false;
    if (!active) activate('system');
    return true;
  }
  function update(time, delta) {
    const k = Math.min(1, (delta || 0.016) * 4);
    glow += ((active ? 1 : 0.55) - glow) * k;
    if (!active) pivot.rotation.y += (delta || 0.016) * 0.25;
    else pivot.rotation.y += (0 - pivot.rotation.y) * k;
    product.position.y = Math.sin(time * 0.9) * 0.03;
    lineMat.opacity = 0.9 * glow; skinMat.opacity = 0.16 * glow; solidMat.opacity = 0.55 * glow;
    Object.values(markers).forEach((m) => {
      const on = selected === m.def.id && mode === 'system' && active;
      m.label.visible = active && mode === 'system';
      m.label.scale.set(0.09 * m.label.userData.aspect, 0.09, 1);
      m.core.scale.setScalar(on ? 1.5 : 1); m.halo.scale.setScalar(on ? 1.9 + Math.sin(time * 3) * 0.12 : 1);
      m.halo.material.opacity = on ? 0.4 : 0.22 * glow; m.core.material.opacity = glow;
    });
  }

  fetch('./briefing_table_records.json', { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((json) => { records = json; })
    .catch((err) => { recordsError = err.message; })
    .finally(() => {
      const want = new URLSearchParams(location.search).get('table');
      if (want && MODES.some((m) => m.id === want)) activate(want); else render();
    });

  return { update, tryClick, activate, deactivate, setMode, select, markers, state: () => ({ active, mode, selected }) };
}
