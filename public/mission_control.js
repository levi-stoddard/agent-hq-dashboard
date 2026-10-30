// Agent HQ Mission Control v0.1 — read-only extension of the existing Command Board.
// Data comes from /api/mission-control. No model calls and no mutation controls.

const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

const tone = status => {
  const s = String(status || 'UNKNOWN').toUpperCase();
  if (['RUNNING', 'ACTIVE', 'VERIFIED_COMPLETE', 'PASS'].includes(s)) return 'ok';
  if (['STOPPED', 'OFFLINE', 'PENDING', 'LAST_RECORDED', 'AWAITING_OWNER_DECISION', 'UNFINISHED'].includes(s)) return 'warn';
  if (['UNAVAILABLE', 'BLOCKED', 'FAIL'].includes(s)) return 'bad';
  return 'muted';
};

const when = value => {
  if (!value) return 'not recorded';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleString();
};

function installShell() {
  const overlay = document.getElementById('mission-control-overlay');
  if (!overlay) return null;
  overlay.innerHTML = `
    <div class="mission-card mc-card">
      <div class="mission-header mc-header">
        <div>
          <div class="mission-title"><span>◆</span><span>AGENT HQ MISSION CONTROL <b>v0.1</b></span></div>
          <div class="mission-subtitle">Daily engineering command center · local evidence only · read-only briefing</div>
        </div>
        <div class="mc-actions">
          <button id="mc-open-vault" class="mc-button">Simulation Vault</button>
          <button id="mc-refresh" class="mc-button">Refresh</button>
          <button id="btn-close-mission" class="mc-close" aria-label="Close Mission Control">&times;</button>
        </div>
      </div>
      <div class="mc-sourcebar"><span id="mc-freshness">Waiting for local status…</span><span class="mc-readonly">READ ONLY · LOOPBACK</span></div>
      <div class="mission-body mc-body" id="mc-body"><div class="mc-loading">Reading local Headquarters evidence…</div></div>
    </div>`;

  const css = document.createElement('style');
  css.textContent = `
    #mission-control-overlay { background:rgba(2,8,18,.95); backdrop-filter:blur(18px); }
    .mc-card { width:min(1440px,96vw); height:92vh; border-color:#7DD3FC; background:linear-gradient(145deg,#07111f,#050b13 58%,#071827); box-shadow:0 30px 90px #000,0 0 35px rgba(56,189,248,.13); }
    .mc-header { border-color:rgba(125,211,252,.28); background:linear-gradient(90deg,rgba(14,116,144,.18),transparent); }
    .mission-title b { color:#7DD3FC; font-size:11px; margin-left:4px; }
    .mc-actions { display:flex; align-items:center; gap:8px; }
    .mc-button { cursor:pointer; padding:7px 11px; border-radius:7px; border:1px solid rgba(125,211,252,.45); background:#081522; color:#BAE6FD; font:700 10px system-ui; letter-spacing:.04em; }
    .mc-button:hover { border-color:#E0F2FE; color:#fff; background:#0c2236; }
    .mc-close { background:none;border:0;color:#94A3B8;font-size:26px;cursor:pointer;line-height:1; }
    .mc-sourcebar { padding:7px 24px; display:flex; justify-content:space-between; border-bottom:1px solid rgba(148,163,184,.12); color:#64748B; font:10px/1.3 ui-monospace,monospace; }
    .mc-readonly { color:#7DD3FC;font-weight:800;letter-spacing:.08em; }
    .mc-body { display:block; padding:16px 20px 24px; overflow:auto; }
    .mc-loading,.mc-error { padding:30px;border:1px solid rgba(125,211,252,.25);border-radius:10px;color:#94A3B8;text-align:center; }
    .mc-error { color:#FCA5A5;border-color:rgba(248,113,113,.4); }
    .mc-summary { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px; }
    .mc-kpi { padding:12px 14px;border:1px solid rgba(125,211,252,.18);border-radius:9px;background:rgba(7,18,31,.86); }
    .mc-kpi .n { font-size:22px;font-weight:850;color:#F8FAFC; }
    .mc-kpi .l { margin-top:2px;font-size:9px;color:#7DD3FC;text-transform:uppercase;letter-spacing:.08em; }
    .mc-grid { display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start; }
    .mc-panel { border:1px solid rgba(125,211,252,.18);border-radius:10px;background:rgba(5,13,23,.86);overflow:hidden; }
    .mc-panel.wide { grid-column:1/-1; }
    .mc-panel h3 { margin:0;padding:11px 13px;background:rgba(14,116,144,.12);border-bottom:1px solid rgba(125,211,252,.14);color:#E0F2FE;font-size:11px;letter-spacing:.09em;text-transform:uppercase; }
    .mc-list { padding:6px 12px; }
    .mc-row { display:grid;grid-template-columns:minmax(150px,1.1fr) minmax(90px,.45fr) minmax(220px,1.6fr);gap:10px;padding:9px 2px;border-top:1px solid rgba(148,163,184,.11);align-items:start;font-size:11px; }
    .mc-row:first-child { border-top:0; }
    .mc-name { color:#F8FAFC;font-weight:750; }
    .mc-detail { color:#94A3B8;line-height:1.4;overflow-wrap:anywhere; }
    .mc-chip { justify-self:start;padding:2px 7px;border-radius:999px;border:1px solid;font:800 9px/1.4 ui-monospace,monospace;letter-spacing:.03em; }
    .mc-chip.ok { color:#A7F3D0;border-color:#34D399;background:rgba(16,185,129,.1); }
    .mc-chip.warn { color:#FDE68A;border-color:#FBBF24;background:rgba(251,191,36,.1); }
    .mc-chip.bad { color:#FECACA;border-color:#F87171;background:rgba(248,113,113,.1); }
    .mc-chip.muted { color:#CBD5E1;border-color:#64748B;background:rgba(100,116,139,.1); }
    .mc-evidence { margin-top:3px;color:#64748B;font:9.5px/1.35 ui-monospace,monospace; }
    .mc-priority { display:grid;grid-template-columns:95px minmax(180px,1.1fr) minmax(240px,1.5fr) minmax(220px,1.2fr);gap:10px;padding:10px 2px;border-top:1px solid rgba(148,163,184,.11);font-size:11px; }
    .mc-priority:first-child { border-top:0; }
    .mc-next { margin:0 0 14px;padding:11px 14px;border:1px solid rgba(34,211,238,.35);border-radius:9px;background:linear-gradient(90deg,rgba(8,145,178,.18),rgba(8,145,178,.04));color:#CFFAFE;font-size:12px; }
    .mc-next b { color:#67E8F9; }
    @media(max-width:900px){.mc-summary{grid-template-columns:1fr 1fr}.mc-grid{grid-template-columns:1fr}.mc-panel.wide{grid-column:auto}.mc-row,.mc-priority{grid-template-columns:1fr}.mc-actions{gap:3px}.mc-button{padding:6px}.mc-sourcebar{padding-inline:12px}.mc-body{padding:12px}}
  `;
  document.head.appendChild(css);
  document.getElementById('mc-refresh').addEventListener('click', () => refresh(true));
  document.getElementById('mc-open-vault').addEventListener('click', () => {
    overlay.style.display = 'none';
    const vaultButton = document.getElementById('btn-cam-vault');
    if (vaultButton) vaultButton.click();
  });
  return overlay;
}

function chip(status) { return `<span class="mc-chip ${tone(status)}">${esc(status || 'UNKNOWN')}</span>`; }

function render(snapshot) {
  const body = document.getElementById('mc-body');
  const services = snapshot.services || [];
  const roles = snapshot.workforce?.claude_roles || [];
  const bridgeAgents = snapshot.workforce?.orchestrator_bridge_agents || [];
  const activeRoles = roles.filter(r => r.status === 'ACTIVE').length;
  const onlineBridge = bridgeAgents.filter(r => r.status === 'ACTIVE' || r.status === 'ONLINE_IDLE').length;
  const openDecisions = (snapshot.decisions || []).filter(d => !['RESOLVED', 'CLOSED'].includes(String(d.status).toUpperCase())).length;
  document.getElementById('mc-freshness').textContent = `Live service check ${when(snapshot.checked_at)} · ${snapshot.provenance_note || ''}`;
  body.innerHTML = `
    <div class="mc-summary">
      <div class="mc-kpi"><div class="n">${services.filter(s => s.status === 'RUNNING').length}/${services.length}</div><div class="l">Services running now</div></div>
      <div class="mc-kpi"><div class="n">${activeRoles}</div><div class="l">Claude roles active now</div></div>
      <div class="mc-kpi"><div class="n">${onlineBridge}/9</div><div class="l">Orchestrator workers with fresh heartbeat</div></div>
      <div class="mc-kpi"><div class="n">${openDecisions}</div><div class="l">Owner decisions pending</div></div>
    </div>
    ${snapshot.next_priority ? `<div class="mc-next"><b>NEXT ENGINEERING PRIORITY</b> · ${esc(snapshot.next_priority.title)} — ${esc(snapshot.next_priority.next_action)}</div>` : ''}
    <div class="mc-grid">
      <section class="mc-panel">
        <h3>A · Local system health</h3>
        <div class="mc-list">${services.map(s => `<div class="mc-row"><div><div class="mc-name">${esc(s.label)}</div><div class="mc-evidence">127.0.0.1:${esc(s.port)} · ${esc(s.endpoint)}</div></div>${chip(s.status)}<div class="mc-detail">${esc(s.detail)}<div class="mc-evidence">Checked ${when(s.checked_at)}${s.last_successful_check ? ` · last success ${when(s.last_successful_check)}` : ''}</div></div></div>`).join('')}</div>
      </section>
      <section class="mc-panel">
        <h3>B · AI engineering workforce</h3>
        <div class="mc-list">${roles.map(r => `<div class="mc-row"><div class="mc-name">${esc(r.label)}</div>${chip(r.status)}<div class="mc-detail">${r.last_event ? `${esc(r.last_event.kind)} · ${esc(r.last_event.text)}<div class="mc-evidence">${when(r.last_event.ts)} · task ${esc(r.last_event.task_id || '-')} · ${esc(r.last_event.source || '-')}</div>` : 'No verified local event found.'}</div></div>`).join('')}
          <div class="mc-row"><div class="mc-name">Orchestrator bridge: nine specialist runtimes</div>${chip(onlineBridge ? 'ONLINE' : 'OFFLINE')}<div class="mc-detail">${onlineBridge ? `${onlineBridge} worker records have a fresh shared heartbeat.` : 'No fresh genuine orchestrator heartbeat evidence. Registry labels are not treated as execution proof.'}<div class="mc-evidence">${snapshot.workforce?.orchestrator_bridge_heartbeat ? `Last heartbeat ${when(snapshot.workforce.orchestrator_bridge_heartbeat.last_heartbeat)} (${esc(snapshot.workforce.orchestrator_bridge_heartbeat.age_sec)} s old)` : 'Heartbeat file unavailable'}</div></div></div>
        </div>
      </section>
      <section class="mc-panel wide" id="mc-priorities">
        <h3>C · Current engineering priorities</h3>
        <div class="mc-list">${(snapshot.priorities || []).map(p => `<div class="mc-priority"><div>${chip(p.status)}</div><div><div class="mc-name">${esc(p.title)}</div><div class="mc-evidence">Owner: ${esc(p.owner || 'not established')}</div></div><div class="mc-detail">${esc(p.summary)}<div class="mc-evidence">Evidence: ${esc(p.evidence)}</div></div><div class="mc-detail"><b style="color:#BAE6FD">Next:</b> ${esc(p.next_action)}</div></div>`).join('') || '<div class="mc-row"><div>No priority register available.</div></div>'}</div>
      </section>
      <section class="mc-panel wide" id="mc-decisions">
        <h3>D · Owner decisions · briefing only</h3>
        <div class="mc-list">${(snapshot.decisions || []).map(d => `<div class="mc-priority"><div>${chip(d.status)}</div><div><div class="mc-name">${esc(d.title)}</div><div class="mc-evidence">Responsible: ${esc(d.responsible || 'not established')}</div></div><div class="mc-detail">${esc(d.supporting_evidence)}<div class="mc-evidence">Reference: ${esc(d.reference)}</div></div><div class="mc-detail"><b style="color:#BAE6FD">Requested:</b> ${esc(d.next_action)}</div></div>`).join('') || '<div class="mc-row"><div>No recorded owner decisions.</div></div>'}</div>
      </section>
      <section class="mc-panel wide" id="mc-howto">
        <h3>E · How owners approve and review · console only</h3>
        <div class="mc-list">
          <div class="mc-priority"><div><span class="mc-chip warn">READ ONLY</span></div><div>
            <div class="mc-name">Nothing on any screen approves anything. Draft actions only prepare drafts. Real approvals and reviews are made by an owner in the separate approval workflow, with that owner's own credentials.</div>
            <div class="mc-evidence">The approval console is part of the private project and is not included in this public copy. Never type a token on a command line, in chat or in a file.</div></div></div>
        </div>
      </section>
    </div>`;
  if (new URLSearchParams(location.search).get('missionSection') === 'decisions') {
    requestAnimationFrame(() => document.getElementById('mc-decisions')?.scrollIntoView({ block: 'start' }));
  }
}

let refreshing = false;
async function refresh(userInitiated = false) {
  if (refreshing) return;
  refreshing = true;
  const button = document.getElementById('mc-refresh');
  if (button) button.textContent = 'Checking…';
  try {
    const response = await fetch('/api/mission-control', { cache: 'no-store' });
    const snapshot = await response.json();
    if (!response.ok || snapshot.error) throw new Error(snapshot.detail || snapshot.error || `HTTP ${response.status}`);
    render(snapshot);
    window.__missionControl.lastSnapshot = snapshot;
    window.__missionControl.lastError = null;
  } catch (err) {
    window.__missionControl.lastError = err.message;
    const body = document.getElementById('mc-body');
    if (body) body.innerHTML = `<div class="mc-error">Mission Control data is unavailable. No healthy status is assumed.<br><span class="mc-evidence">${esc(err.message)}</span></div>`;
  } finally {
    refreshing = false;
    if (button) button.textContent = userInitiated ? 'Refreshed' : 'Refresh';
    if (button && userInitiated) setTimeout(() => { button.textContent = 'Refresh'; }, 900);
  }
}

const overlay = installShell();
window.__missionControl = { refresh, lastSnapshot: null, lastError: null, version: '0.1', readOnly: true };
if (overlay) {
  if (new URLSearchParams(location.search).get('missionControl') === '1') overlay.style.display = 'flex';
  const observer = new MutationObserver(() => { if (overlay.style.display === 'flex') refresh(); });
  observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
  setInterval(() => { if (overlay.style.display === 'flex' && !document.hidden) refresh(); }, 5000);
  refresh();
}
