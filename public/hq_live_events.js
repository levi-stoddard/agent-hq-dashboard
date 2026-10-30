// Headquarters live activity: speech bubbles and a history panel driven by a local event log.
// It shows only what is in ./live_events/events.jsonl. It never calls a model and never invents text.
// Each line is one JSON event written by the acting CTO session or by a worker's own tool call:
//   { id, ts, task_id, station, from, runtime, to, kind, quote, text, source, resolves }
// kind: assignment | message | finding | handoff | review | error | approval_needed | completed | status
// quote=true means the text is the sender's own words; otherwise it is a status label.
// A role proxy (for example "IMPLEMENTER role - Claude Code subagent") appears at that workstation, but the
// orchestrator runtime status on the name tags is separate and is not changed here.

// ?liveFixture=1 reads a separate UI test log instead of the real one; everything shown is then marked as a test fixture.
const FIXTURE = new URLSearchParams(location.search).get('liveFixture') === '1';
const LOG_URL = FIXTURE ? './live_events/ui_fixture.jsonl' : './live_events/events.jsonl';
const POLL_MS = 3000;
const MAX_EVENTS = 200;
const FRESH_MS = 45000;          // only events newer than this pop up as bubbles; older ones go to history only
const MIN_SHOW_MS = 5000;        // when several events arrive together, each one is shown at least this long, in order
const STALE_MS = 120000;         // a queued event older than this is not popped up as if it were current; it stays in history
const TOP_CLEAR_PX = 112;        // height kept free for the page toolbar
const FX_NOTE ='<div class="fx">UI TEST FIXTURE · not worker activity</div>';
const SHOW_MS = { default: 9000, error: 20000, completed: 14000, review: 14000 };
const KIND_LABEL = { assignment: 'ASSIGNMENT', message: 'MESSAGE', finding: 'FINDING', handoff: 'HANDOFF', review: 'REVIEW', error: 'ERROR',
  approval_needed: 'APPROVAL NEEDED', completed: 'COMPLETED', status: 'STATUS' };
const KIND_COLOR = { assignment: '#38BDF8', message: '#CBD5E1', finding: '#A78BFA', handoff: '#22D3EE', review: '#34D399', error: '#F87171',
  approval_needed: '#FBBF24', completed: '#34D399', status: '#94A3B8' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const hhmmss = (ts) => { const d = new Date(ts); return isNaN(d) ? '' : d.toISOString().slice(11, 19) + 'Z'; };

export function installLiveEvents({ THREE, camera, getAnchor }) {
  const events = [], seen = new Set();
  const bubbles = {};            // station -> { el, until, queue: [], current }
  const pending = {};            // event id -> open approval_needed event (several can be open at one workstation)
  const resolved = new Set();    // ids of approval requests that a later event resolved
  const openAt = (station) => Object.values(pending).filter((e) => e.station === station);
  let filter = null, panelOpen = false, lastText = null, pollError = null, lastPoll = null;

  const css = document.createElement('style');
  css.textContent = `
    .hq-bubble { position: fixed; z-index: 40; max-width: 250px; min-width: 150px; transform: translate(-50%, -100%); pointer-events: none;
      background: rgba(8,13,22,0.94); border: 1px solid #38BDF8; border-radius: 10px; padding: 7px 10px 6px; color: #E2E8F0; font: 12px/1.35 system-ui, sans-serif;
      box-shadow: 0 6px 20px rgba(0,0,0,0.55); opacity: 0; transition: opacity .25s; }
    .hq-bubble.on { opacity: 1; }
    .hq-bubble::after { content: ''; position: absolute; left: 50%; bottom: -6px; width: 10px; height: 10px; background: inherit; border-right: 1px solid; border-bottom: 1px solid; border-color: inherit; transform: translateX(-50%) rotate(45deg); }
    .hq-bubble .who { font-weight: 700; font-size: 10.5px; letter-spacing: .03em; color: #7DD3FC; }
    .hq-bubble .txt { margin: 2px 0 3px; color: #F8FAFC; }
    .hq-bubble .txt.status { font-style: italic; color: #CBD5E1; }
    .hq-bubble .meta { font-size: 9.5px; color: #94A3B8; }
    .hq-bubble.approval { border-width: 2px; }
    .hq-bubble .fx, #hq-live-panel .fx { font-size: 9.5px; font-weight: 700; letter-spacing: .04em; color: #F0ABFC; }
    .hq-bubble .pend { margin-top: 3px; padding-top: 3px; border-top: 1px solid rgba(251,191,36,0.5); font-size: 10px; color: #FBBF24; }
    #hq-live-btn.approval { border-color: #FBBF24; color: #FDE68A; }
    #hq-live-btn { position: fixed; right: 16px; bottom: 44px; z-index: 55; cursor: pointer; padding: 7px 12px; border-radius: 8px; border: 1px solid rgba(56,189,248,0.45);
      background: rgba(6,11,18,0.92); color: #CBD5E1; font: 600 12px system-ui, sans-serif; }
    #hq-live-btn.new { border-color: #34D399; color: #A7F3D0; }
    #hq-live-panel { position: fixed; right: 16px; bottom: 84px; width: min(430px, calc(100vw - 32px)); max-height: 52vh; overflow: auto; z-index: 55; display: none;
      background: rgba(6,11,18,0.95); border: 1px solid rgba(56,189,248,0.35); border-radius: 12px; padding: 12px; color: #CBD5E1; font: 12px/1.4 system-ui, sans-serif; }
    #hq-live-panel h4 { margin: 0 0 6px; font-size: 13px; color: #F8FAFC; }
    #hq-live-panel .row { padding: 6px 0; border-top: 1px solid rgba(148,163,184,0.16); }
    #hq-live-panel .k { display: inline-block; padding: 0 6px; border-radius: 999px; border: 1px solid; font-size: 10px; margin-right: 6px; }
    #hq-live-panel .m { color: #94A3B8; font-size: 10.5px; }
    #hq-live-panel .f button { cursor: pointer; margin: 0 4px 4px 0; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(148,163,184,0.35); background: #0F172A; color: #CBD5E1; font: 11px system-ui, sans-serif; }
    #hq-live-panel .f button.on { border-color: #38BDF8; color: #F8FAFC; }
  `;
  document.head.appendChild(css);
  const btn = document.createElement('button'); btn.id = 'hq-live-btn'; btn.textContent = 'Live activity (0)';
  const panel = document.createElement('div'); panel.id = 'hq-live-panel';
  document.body.append(btn, panel);
  [btn, panel].forEach((el) => ['click', 'pointerdown', 'wheel'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation())));
  btn.addEventListener('click', () => { panelOpen = !panelOpen; btn.classList.remove('new'); renderPanel(); });

  function renderPanel() {
    panel.style.display = panelOpen ? 'block' : 'none';
    const open = Object.keys(pending).length;
    btn.textContent = `${FIXTURE ? 'UI fixture log' : 'Live activity'} (${events.length})${open ? ` · ${open} approval needed` : ''}`;
    btn.classList.toggle('approval', open > 0);
    if (!panelOpen) return;
    const stations = [...new Set(events.map((e) => e.station))];
    const list = events.filter((e) => !filter || e.station === filter).slice().reverse();
    panel.innerHTML = `<h4>${FIXTURE ? 'UI fixture log' : 'Live activity'}${filter ? ' · ' + esc(filter) : ''}</h4>${FIXTURE ? FX_NOTE : ''}
      <div class="m">Newest first. Times are when each event was sent, not when it was displayed. Source: local event log, read every ${POLL_MS / 1000} s. No model is called to show this. ${pollError ? 'Last read failed: ' + esc(pollError) : lastPoll ? 'Last read ' + hhmmss(lastPoll) : ''}</div>
      <div class="f" style="margin-top:6px"><button data-f="" class="${filter ? '' : 'on'}">All</button>${stations.map((s) => `<button data-f="${esc(s)}" class="${filter === s ? 'on' : ''}">${esc(s)}</button>`).join('')}</div>
      ${list.length ? list.map((e) => `<div class="row"${pending[e.id] ? ' style="background:rgba(251,191,36,0.08)"' : ''}>${e.fixture && !FIXTURE ? FX_NOTE : ''}<span class="k" style="color:${KIND_COLOR[e.kind] || '#94A3B8'}">${KIND_LABEL[e.kind] || esc(e.kind)}${pending[e.id] ? ' · OPEN' : resolved.has(e.id) ? ' · resolved' : ''}</span><b style="color:#F8FAFC">${esc(e.from)}</b>${e.to ? ' → ' + esc(e.to) : ''}
        <div style="margin:2px 0;${e.quote ? '' : 'font-style:italic'}">${e.quote ? '“' + esc(e.text) + '”' : esc(e.text)}</div>
        <div class="m">${e.quote ? 'sender’s words' : 'status label, not a quotation'} · ${esc(e.runtime || '')} · task ${esc(e.task_id || '-')} · ${hhmmss(e.ts)} · source ${esc(e.source || '-')}</div></div>`).join('')
        : '<div class="row m">No recorded activity' + (filter ? ' for this workstation' : '') + '. Workstations with no events have no bubbles.</div>'}`;
    panel.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f || null; renderPanel(); }));
  }

  function bubbleFor(station) {
    if (!bubbles[station]) {
      const el = document.createElement('div'); el.className = 'hq-bubble'; document.body.appendChild(el);
      bubbles[station] = { el, until: 0, shownAt: 0, queue: [], current: null };
    }
    return bubbles[station];
  }
  // Draws the bubble for b.current. The time shown is always the event's own send time; if it is displayed later
  // (for example because it waited behind another event) the delay is stated.
  function render(b) {
    const e = b.current, color = KIND_COLOR[e.kind] || '#38BDF8';
    const p = openAt(e.station).filter((x) => x.id !== e.id), ago = b.delayS;   // delay is fixed when the event is first shown
    const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
    b.el.style.borderColor = color;
    b.el.classList.toggle('approval', e.kind === 'approval_needed');
    b.el.innerHTML = `${FIXTURE || e.fixture ? FX_NOTE : ''}<div class="who" style="color:${color}">${esc(e.from)}${e.to ? ' → ' + esc(e.to) : ''}</div>
      <div class="txt ${e.quote ? '' : 'status'}">${e.quote ? '“' + esc(e.text) + '”' : esc(e.text)}</div>
      <div class="meta">${KIND_LABEL[e.kind] || esc(e.kind)}${e.quote ? '' : ' (status)'} · ${esc(e.task_id || '')} · sent ${hhmmss(e.ts)}${ago >= 6 ? ` (${ago} s before this was shown)` : ''}</div>
      ${e.runtime ? `<div class="meta">${esc(cut(e.runtime, 60))}</div>` : ''}
      ${b.queue.length ? '<div class="meta">more events waiting at this workstation</div>' : ''}
      ${p.length ? `<div class="pend">APPROVAL NEEDED still open${p.length > 1 ? ' (' + p.length + ')' : ''}: ${esc(cut(p[0].text, 80))}</div>` : ''}`;
  }
  function show(b, e) {
    b.current = e; b.shownAt = performance.now();
    b.delayS = Math.round((Date.now() - new Date(e.ts).getTime()) / 1000);
    b.until = e.kind === 'approval_needed' ? Infinity : b.shownAt + (SHOW_MS[e.kind] || SHOW_MS.default);
    render(b);
  }
  function ingest(e) {
    if (!e || !e.id || seen.has(e.id) || !e.station || !e.text) return;
    seen.add(e.id); events.push(e);
    if (events.length > MAX_EVENTS) events.shift();
    if (e.resolves && pending[e.resolves]) {
      const s = pending[e.resolves].station, b = bubbles[s];
      delete pending[e.resolves]; resolved.add(e.resolves);
      if (b && b.current) { if (b.current.id === e.resolves) b.until = 0; else render(b); }
    }
    if (e.kind === 'approval_needed' && !resolved.has(e.id)) pending[e.id] = e;
    const age = Date.now() - new Date(e.ts).getTime();
    const fresh = age < FRESH_MS && age > -5000;     // a timestamp in the future is not treated as current
    if (fresh || e.kind === 'approval_needed') bubbleFor(e.station).queue.push(e);
    if (!panelOpen) btn.classList.add('new');
  }

  async function poll() {
    if (document.hidden) return;                 // no work while the page is not visible
    try {
      const r = await fetch(LOG_URL, { cache: 'no-store' });
      lastPoll = Date.now();
      if (r.status === 404) { pollError = null; return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      pollError = null;
      if (text === lastText) return;             // nothing new
      lastText = text;
      text.split('\n').forEach((line) => { line = line.trim(); if (!line) return; try { ingest(JSON.parse(line)); } catch (err) { /* skip a partly written line */ } });
      renderPanel();
    } catch (err) { pollError = err.message; }
  }
  setInterval(poll, POLL_MS); poll();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  const v = new THREE.Vector3();
  function update() {
    const now = performance.now();
    const placed = [];
    Object.entries(bubbles).forEach(([station, b]) => {
      // One event at a time per workstation, in arrival order. A waiting event takes over once the current one has had
      // its minimum time; nothing is dropped except events that have gone stale (those remain in the history).
      if (b.queue.length && (!b.current || now > b.until || now - b.shownAt >= MIN_SHOW_MS)) {
        let e = null;
        while (b.queue.length && !e) {
          const c = b.queue.shift();
          if (c.kind === 'approval_needed' ? !!pending[c.id] : Date.now() - new Date(c.ts).getTime() < STALE_MS) e = c;
        }
        if (e) show(b, e);
      } else if (b.current && now > b.until) { b.current = null; const o = openAt(station); if (o.length) show(b, o[0]); }
      const a = b.current && now <= b.until ? getAnchor(station) : null;
      if (!a) { b.el.classList.remove('on'); return; }
      v.copy(a).project(camera);
      const vis = v.z < 1 && v.x > -1.05 && v.x < 1.05 && v.y > -1.05 && v.y < 1.05;
      b.el.classList.toggle('on', vis);
      if (vis) placed.push({ b, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight - 8, w: b.el.offsetWidth, h: b.el.offsetHeight });
    });
    // Keep bubbles from covering each other: lowest first, each later one is lifted clear of those already placed.
    placed.sort((p, q) => q.y - p.y);
    placed.forEach((p, i) => {
      p.x = Math.min(Math.max(p.x, p.w / 2 + 8), innerWidth - p.w / 2 - 8);
      for (let pass = 0; pass < 2; pass++) for (let k = 0; k < i; k++) {
        const o = placed[k];
        if (Math.abs(p.x - o.x) < (p.w + o.w) / 2 + 6 && p.y > o.y - o.h - 12 && p.y - p.h < o.y + 12) p.y = o.y - o.h - 12;
      }
      if (p.y < p.h + TOP_CLEAR_PX) {                // stay below the page toolbar; if that puts it back on a neighbour, step sideways
        p.y = p.h + TOP_CLEAR_PX;
        for (let k = 0; k < i; k++) {
          const o = placed[k];
          if (Math.abs(p.x - o.x) < (p.w + o.w) / 2 + 6 && p.y > o.y - o.h - 12 && p.y - p.h < o.y + 12) p.x = o.x + (p.x >= o.x ? 1 : -1) * ((p.w + o.w) / 2 + 10);
        }
        p.x = Math.min(Math.max(p.x, p.w / 2 + 8), innerWidth - p.w / 2 - 8);
      }
      p.b.el.style.left = p.x + 'px'; p.b.el.style.top = p.y + 'px';
    });
  }
  function focus(station) { filter = station; panelOpen = true; btn.classList.remove('new'); renderPanel(); }

  return { update, focus, poll, events, state: () => ({ count: events.length, bubbles: Object.fromEntries(Object.entries(bubbles).map(([k, b]) => [k, b.current && performance.now() <= b.until ? b.current.id : null])), pending: [...new Set(Object.values(pending).map((e) => e.station))], openApprovals: Object.keys(pending), pollError }) };
}
