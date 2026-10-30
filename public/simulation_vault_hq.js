// Headquarters Simulation Vault v1.0: a holographic table in the 3D room and a library panel.
// Additive module. It reads the registry from the local Vault service (see SERVICE below) and could ask that service to launch
// allowlisted simulations, which then run in an embedded frame. It cannot approve, promote or change anything in the Vault:
// the service is read-only for registry and approvals. Owner approval is recorded outside this page.
// Vault address: set HQ_CONFIG.simulationVaultUrl in hq-config.local.js (for example the loopback service on port 8780).
// When it is empty the table shows "not configured" and no request is sent.
const SERVICE = String((window.HQ_CONFIG && window.HQ_CONFIG.simulationVaultUrl) || '').replace(/\/+$/, '');
const POS = { x: 5.6, z: 6.2 };                       // free floor between the Gemini workstation and the Implementer desk
const VIEW = { pos: { x: 9.4, y: 3.4, z: 10.6 }, look: { x: 5.6, y: 1.35, z: 6.2 } };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TONE = { STAGED_FOR_OWNER_REVIEW: '#FBBF24', PRESERVED_BASELINE_NOT_APPROVED: '#94A3B8', OWNER_APPROVED: '#34D399' };
const APPROVAL_TEXT = { STAGED_FOR_OWNER_REVIEW: 'Staged for owner review', PRESERVED_BASELINE_NOT_APPROVED: 'Preserved baseline (not approved)', OWNER_APPROVED: 'Owner-approved' };

export function installSimulationVault({ THREE, scene, camera, interactiveObjects, flyTo, onReturn }) {
  let registry = null, serviceError = null, selected = null, filter = 'all', viewer = null, open = false;

  // ------------------------------------------------------------------ 3D table
  const group = new THREE.Group(); group.position.set(POS.x, 0, POS.z); scene.add(group);
  const dark = new THREE.MeshStandardMaterial({ color: 0x121A26, roughness: 0.3, metalness: 0.7 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x7DD3FC });
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.85, 0.12, 48), dark); dais.position.y = 0.06; dais.receiveShadow = true; group.add(dais);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.025, 8, 72), glow); ring.rotation.x = Math.PI / 2; ring.position.y = 0.13; group.add(ring);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 0.74, 32), dark); pedestal.position.y = 0.49; pedestal.castShadow = true; group.add(pedestal);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.06, 48), new THREE.MeshStandardMaterial({ color: 0x0B1220, roughness: 0.15, metalness: 0.8 })); top.position.y = 0.89; group.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.018, 8, 72), glow); rim.rotation.x = Math.PI / 2; rim.position.y = 0.925; group.add(rim);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.62, 1.5, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x7DD3FC, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 1.7; group.add(beam);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial({ color: 0xE0F2FE, wireframe: true, transparent: true, opacity: 0.85 }));
  core.position.y = 1.6; group.add(core);
  const light = new THREE.PointLight(0x7DD3FC, 1.8, 5); light.position.y = 1.7; group.add(light);
  const cards = new THREE.Group(); cards.position.y = 1.62; group.add(cards);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.7, 16), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 1.35; hit.userData.isSimVault = true; group.add(hit); interactiveObjects.push(hit);

  function label(lines, color, w = 512, h = 128) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    g.fillStyle = 'rgba(6,11,18,0.86)'; g.fillRect(0, 0, w, h); g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(([text, font, col], i) => { g.fillStyle = col || color; g.font = font; g.fillText(text, w / 2, h * (i + 1) / (lines.length + 1)); });
    return new THREE.CanvasTexture(cv);
  }
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: label([['SIMULATION VAULT', '700 44px sans-serif'], ['click the table to open', '26px sans-serif', '#CBD5E1']], '#7DD3FC'), transparent: true }));
  sign.scale.set(1.9, 0.475, 1); sign.position.y = 2.6; group.add(sign);

  function rebuildCards() {
    while (cards.children.length) { const c = cards.children.pop(); c.material.map.dispose(); c.material.dispose(); c.geometry.dispose(); }
    const items = [];
    (registry ? registry.simulations : []).forEach((s) => s.versions.forEach((v) => items.push({ s, v })));
    items.forEach((it, i) => {
      const col = TONE[it.v.approval.status] || '#94A3B8';
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.3), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false,
        map: label([[it.s.id + '  ' + it.v.version, '700 34px sans-serif'], [(APPROVAL_TEXT[it.v.approval.status] || it.v.approval.status).toUpperCase(), '22px sans-serif', '#E2E8F0']], col, 512, 248) }));
      m.userData.angle = (i / Math.max(items.length, 3)) * Math.PI * 2; cards.add(m);
    });
    const staged = items.filter((x) => x.v.approval.status === 'STAGED_FOR_OWNER_REVIEW').length, approved = registry ? registry.active.length : 0;
    sign.material.map.dispose();
    sign.material.map = label([['SIMULATION VAULT', '700 44px sans-serif'], [registry ? `${approved} owner-approved · ${staged} staged for review` : (SERVICE ? 'Vault service not running' : 'Vault not configured'), '26px sans-serif', '#CBD5E1']], '#7DD3FC');
  }

  // ------------------------------------------------------------------ panel
  const css = document.createElement('style');
  css.textContent = `
    #sv { position: fixed; inset: 78px 16px 16px 16px; z-index: 70; display: none; flex-direction: column; background: rgba(6,11,18,0.96); border: 1px solid rgba(125,211,252,0.55);
      border-radius: 14px; color: #CBD5E1; font: 13px/1.45 system-ui, sans-serif; box-shadow: 0 20px 60px rgba(0,0,0,0.7); overflow: hidden; }
    #sv header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid rgba(125,211,252,0.25); }
    #sv h2 { margin: 0; font-size: 16px; color: #E0F2FE; letter-spacing: .04em; } #sv .sp { flex: 1; }
    #sv button { font: inherit; cursor: pointer; padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(148,163,184,0.4); background: #0F172A; color: #E2E8F0; }
    #sv button.pri { background: #0369A1; border-color: #38BDF8; color: #fff; font-weight: 600; } #sv button:disabled { opacity: .5; cursor: default; }
    #sv .body { flex: 1; display: grid; grid-template-columns: 200px minmax(240px, 0.9fr) minmax(320px, 1.6fr); min-height: 0; }
    #sv .col { overflow: auto; padding: 12px 14px; border-right: 1px solid rgba(148,163,184,0.15); }
    #sv .nav button { display: block; width: 100%; text-align: left; margin-bottom: 5px; } #sv .nav button.on { border-color: #38BDF8; color: #fff; }
    #sv h4 { margin: 12px 0 6px; font-size: 11px; color: #94A3B8; text-transform: uppercase; letter-spacing: .06em; }
    #sv .card { border: 1px solid rgba(148,163,184,0.25); border-radius: 10px; padding: 9px 11px; margin-bottom: 8px; cursor: pointer; background: #0B1220; }
    #sv .card.on { border-color: #38BDF8; } #sv .card b { color: #F8FAFC; }
    #sv .pill { display: inline-block; border: 1px solid; border-radius: 999px; padding: 0 8px; font-size: 11px; margin: 2px 4px 2px 0; }
    #sv table { border-collapse: collapse; width: 100%; font-size: 12px; } #sv td { border-top: 1px solid rgba(148,163,184,0.15); padding: 4px 6px; vertical-align: top; } #sv td:first-child { color: #94A3B8; width: 150px; }
    #sv .warn { border: 1px dashed #FBBF24; color: #FDE68A; border-radius: 8px; padding: 8px 10px; margin: 8px 0; font-size: 12px; }
    #sv .syn { background: #2a1b33; color: #E9C6F7; font-weight: 700; padding: 6px 14px; font-size: 12px; display: flex; gap: 12px; align-items: center; border-bottom: 2px solid #C084FC; }
    #sv iframe { flex: 1; width: 100%; border: 0; background: #0f1418; } #sv .view { flex: 1; display: none; flex-direction: column; min-height: 0; }
    #sv ul { margin: 4px 0 4px 18px; padding: 0; } #sv .m { color: #94A3B8; font-size: 12px; }
    @media (max-width: 1000px) { #sv .body { grid-template-columns: 1fr; } }`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'sv';
  el.innerHTML = `<header><h2>SIMULATION VAULT</h2><span class="m" id="sv-status"></span><span class="sp"></span><button id="sv-refresh">Refresh</button><button id="sv-close">← Return to Headquarters</button></header>
    <div class="body" id="sv-lib"><div class="col nav" id="sv-nav"></div><div class="col" id="sv-list"></div><div class="col" id="sv-detail" style="border-right:0"></div></div>
    <div class="view" id="sv-view"><div class="syn"><span id="sv-vtitle"></span><span class="sp"></span><button id="sv-back">← Return to library</button></div><iframe id="sv-frame" sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy="no-referrer" title="Simulation"></iframe></div>`;
  document.body.appendChild(el);
  ['click', 'pointerdown', 'pointerup', 'mousedown', 'wheel', 'mousemove', 'dblclick', 'contextmenu'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
  const $ = (id) => el.querySelector('#' + id);

  async function api(path, body) {
    const r = await fetch(SERVICE + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    return r.json();
  }
  async function refresh() {
    if (!SERVICE) { registry = null; serviceError = 'Simulation Vault not configured (set simulationVaultUrl in hq-config.local.js).'; rebuildCards(); render(); return; }
    try { registry = await api('/api/registry'); serviceError = null; } catch (e) { registry = null; serviceError = 'The Vault service is not running.'; }
    rebuildCards(); render();
  }
  const versionsOf = () => (registry ? registry.simulations.flatMap((s) => s.versions.map((v) => ({ s, v }))) : []);
  function shown() {
    return versionsOf().filter(({ s, v }) => filter === 'all' || filter === 'dom:' + s.domain || (filter === 'staged' && v.approval.status === 'STAGED_FOR_OWNER_REVIEW')
      || (filter === 'approved' && v.approval.status === 'OWNER_APPROVED') || (filter === 'baseline' && v.approval.status === 'PRESERVED_BASELINE_NOT_APPROVED'));
  }
  function render() {
    $('sv-status').textContent = serviceError ? serviceError : registry ? `local service connected · registry written ${registry.written_utc}` : 'connecting…';
    if (!registry) {
      $('sv-nav').innerHTML = ''; $('sv-list').innerHTML = '';
      $('sv-detail').innerHTML = `<div class="warn">The Simulation Vault service is not running, so the library cannot be read and nothing can be launched.<br><br>The Vault service is a separate private project and is not included in this public copy. If you run your own, set <code>simulationVaultUrl</code> in <code>hq-config.local.js</code> and press Refresh.</div>`;
      return;
    }
    const all = versionsOf(), n = (f) => all.filter(f).length;
    const navBtn = (id, text) => `<button data-f="${id}" class="${filter === id ? 'on' : ''}">${text}</button>`;
    $('sv-nav').innerHTML = `<h4>Library</h4>${navBtn('all', `All versions (${all.length})`)}${navBtn('approved', `Owner-approved (${n(({ v }) => v.approval.status === 'OWNER_APPROVED')})`)}`
      + `${navBtn('staged', `Staged for review (${n(({ v }) => v.approval.status === 'STAGED_FOR_OWNER_REVIEW')})`)}${navBtn('baseline', `Preserved baselines (${n(({ v }) => v.approval.status === 'PRESERVED_BASELINE_NOT_APPROVED')})`)}`
      + `${navBtn('archive', `Archive (${registry.simulations.reduce((a, s) => a + s.archive.length, 0)})`)}${navBtn('inventory', `Inventory, not migrated (${registry.inventory_not_migrated.length})`)}`
      + `<h4>Engineering category</h4>${registry.domains.map((d) => navBtn('dom:' + d, `${d} (${n(({ s }) => s.domain === d)})`)).join('')}`;
    $('sv-nav').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; selected = null; render(); }));
    if (filter === 'inventory') {
      $('sv-list').innerHTML = `<h4>Existing simulations and prototypes (listed only)</h4>` + registry.inventory_not_migrated.map((i) => `<div class="card" style="cursor:default"><b>${esc(i.name)}</b><div class="m">${esc(i.domain)} · ${esc(i.kind)}</div><div class="m">${esc(i.status)}</div></div>`).join('');
      $('sv-detail').innerHTML = `<h4>Inventory</h4><p>These exist elsewhere and are listed so nothing is forgotten. They have not been copied into the Vault, preserved, tested here or made launchable. Each would be staged one at a time.</p>`
        + `<table>${registry.inventory_not_migrated.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.location)}${i.path_exists === false ? ' (path not found)' : ''}</td></tr>`).join('')}</table>`;
      return;
    }
    if (filter === 'archive') {
      const arch = registry.simulations.flatMap((s) => s.archive.map((a) => ({ s, a })));
      $('sv-list').innerHTML = `<h4>Archive</h4>` + (arch.length ? arch.map(({ s, a }) => `<div class="card" style="cursor:default"><b>${esc(s.id)} ${esc(a.version)}</b><div class="m">${esc(a.reason || '')}</div></div>`).join('') : '<div class="m">Empty. A version moves here, still runnable, when a newer one is owner-approved.</div>');
      $('sv-detail').innerHTML = `<h4>How the archive works</h4><p>The main collection shows only the latest owner-approved version of each simulation. When a newer version is approved, the previous approved version is archived with its runnable files and evidence. Preserved baselines that were never approved stay under "Preserved baselines".</p>`;
      return;
    }
    const list = shown();
    if (!selected || !list.some(({ s, v }) => s.id + v.version === selected)) selected = list.length ? list[list.length - 1].s.id + list[list.length - 1].v.version : null;
    $('sv-list').innerHTML = (filter === 'approved' && !list.length ? '<div class="warn">No simulation has been owner-approved yet. Staged candidates are shown under "Staged for review".</div>' : '')
      + (list.length ? '' : filter === 'approved' ? '' : '<div class="m">Nothing in this category yet.</div>')
      + list.map(({ s, v }) => `<div class="card ${s.id + v.version === selected ? 'on' : ''}" data-k="${esc(s.id + v.version)}"><b>${esc(s.name)}</b><div class="m">${esc(s.id)} · ${esc(v.version)} · ${esc(s.domain)}</div>
        <span class="pill" style="color:${TONE[v.approval.status] || '#94A3B8'}">${esc(APPROVAL_TEXT[v.approval.status] || v.approval.status)}</span>
        <span class="pill" style="color:${v.runtime_status.running ? '#34D399' : '#94A3B8'}">${v.runtime_status.running ? 'running' : 'not running'}</span></div>`).join('');
    $('sv-list').querySelectorAll('[data-k]').forEach((c) => c.addEventListener('click', () => { selected = c.dataset.k; render(); }));
    const cur = list.find(({ s, v }) => s.id + v.version === selected);
    if (!cur) { $('sv-detail').innerHTML = ''; return; }
    const { s, v } = cur, t = v.software_tests || {}, p = v.preservation || {}, rs = v.runtime_status || {};
    const row = (k, val) => `<tr><td>${k}</td><td>${val}</td></tr>`;
    $('sv-detail').innerHTML = `<h2 style="font-size:17px;color:#F8FAFC;margin:0 0 2px">${esc(v.title)}</h2><div class="m">${esc(s.id)} · ${esc(s.domain)} · ${esc(v.role)} · <b style="color:#E9C6F7">${esc(s.data_kind)}</b></div>
      <p>${esc(s.purpose)}</p>
      <div class="warn" id="sv-readonly">Read-only: this Headquarters shows the Vault status only. Launch and stop are switched off until an owner-authorized control workflow exists. ${rs.running ? 'Running now on this computer at ' + esc(rs.url) + ' (started by the Vault earlier).' : 'Not running.'}</div>
      <div class="warn">A simulation that runs is not thereby validated. The three results below are separate.</div>
      <table>
        ${row('Approval status', `<b style="color:${TONE[v.approval.status] || '#CBD5E1'}">${esc(APPROVAL_TEXT[v.approval.status] || v.approval.status)}</b><br><span class="m">${esc(v.approval.note)}</span>`)}
        ${row('Engineering result', `<b>${esc(v.engineering_result)}</b><br><span class="m">${esc(v.engineering_note)}</span>`)}
        ${row('Software tests', `<b>${esc(t.result)}</b>${t.tests_run != null ? ` · ${t.tests_run} tests, ${t.failures} failures` : ''} · ${esc(t.basis || '')}${t.rerun_utc ? ` · re-run ${esc(t.rerun_utc)}` : ''}`)}
        ${row('Runtime status', rs.running ? `running locally at ${esc(rs.url)} (started by the Vault)` : 'not running')}
        ${row('Preservation', `${esc(p.status)} · ${p.files} files · restore-and-launch test ${esc(p.restore_and_launch_test)}<br><span class="m">snapshot integrity now: ${p.verified_now ? 'verified' : 'FAILED'} (${esc(p.verify_detail || '')})<br>manifest ${esc((p.manifest_sha256 || '').slice(0, 16))}…</span>`)}
        ${row('Evidence', esc(v.evidence_status))}
        ${row('Runtime needs', esc(s.runtime_requirements))}
      </table>
      ${(v.changes_from_previous || []).length ? `<h4>Changed from the previous version</h4><ul>${v.changes_from_previous.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${(v.known_weaknesses || []).length ? `<h4>Known weaknesses</h4><ul>${v.known_weaknesses.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <h4>Limitations</h4><ul>${(v.limitations || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h4>Version history</h4><table>${s.versions.map((x) => row(esc(x.version), `${esc(x.role)} · ${esc(APPROVAL_TEXT[x.approval.status] || x.approval.status)}`)).join('')}</table>
      <h4>Owner approval</h4><p class="m">Activation needs an explicit decision from either owner. There is no approve button here on purpose: a button on an unauthenticated local page cannot prove who pressed it. An approval is recorded in the Vault only on an owner's instruction.</p>`;
  }
  async function openSim(s, v) {
    $('sv-msg').textContent = 'Checking the preserved snapshot and starting…'; $('sv-open').disabled = true;
    const r = { ok: false, error: 'launch is switched off in this read-only Headquarters' };   // no request is sent
    if (!r.ok) { $('sv-msg').textContent = 'Not opened: ' + r.error; $('sv-open').disabled = false; refresh(); return; }
    viewer = { id: s.id, version: v.version };
    $('sv-vtitle').textContent = `${s.data_kind} · ${s.name} ${v.version} · ${APPROVAL_TEXT[v.approval.status] || v.approval.status} · running on this computer at ${r.url}`;
    $('sv-frame').src = r.url; $('sv-lib').style.display = 'none'; $('sv-view').style.display = 'flex';
  }
  function closeViewer() { $('sv-frame').src = 'about:blank'; viewer = null; $('sv-view').style.display = 'none'; $('sv-lib').style.display = 'grid'; refresh(); }
  $('sv-back').addEventListener('click', closeViewer);
  $('sv-refresh').addEventListener('click', refresh);
  function show() { open = true; el.style.display = 'flex'; flyTo(VIEW.pos, VIEW.look); refresh(); }
  function hide() { if (viewer) closeViewer(); open = false; el.style.display = 'none'; if (onReturn) onReturn(); }
  $('sv-close').addEventListener('click', hide);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { if (viewer) closeViewer(); else hide(); } });

  // a button beside the existing camera presets
  const sibling = document.getElementById('btn-cam-gemini');
  if (sibling && sibling.parentElement) {
    const b = document.createElement('button'); b.id = 'btn-cam-vault'; b.className = sibling.className.replace(/\bactive\b/, ''); b.textContent = '◈ Simulation Vault';
    b.addEventListener('click', (e) => { e.stopPropagation(); show(); }); sibling.insertAdjacentElement('afterend', b);
  }
  refresh();

  function tryClick(hits) { if (hits.length && hits[0].object.userData && hits[0].object.userData.isSimVault) { show(); return true; } return false; }
  function update(time) {
    core.rotation.y = time * 0.5; core.rotation.x = time * 0.23; core.position.y = 1.6 + Math.sin(time * 1.3) * 0.04;
    cards.children.forEach((c) => { const a = c.userData.angle + time * 0.22; c.position.set(Math.cos(a) * 0.78, Math.sin(time + c.userData.angle) * 0.05, Math.sin(a) * 0.78); c.lookAt(camera.position); });
    light.intensity = 1.6 + Math.sin(time * 1.7) * 0.25;
  }
  return { tryClick, update, show, hide, refresh, group, state: () => ({ open, viewer, filter, selected, serviceError, versions: versionsOf().map(({ s, v }) => s.id + ' ' + v.version + ' ' + v.approval.status) }) };
}
