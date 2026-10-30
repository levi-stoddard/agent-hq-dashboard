// hq_gateway_links.js - Agent HQ web 3D headquarters: "Headquarters pages (same as the Unreal room)".
// STATIC and READ-ONLY. It adds a button and a panel that list each desk's pages and OPEN THE SAME GATEWAY PAGES the Unreal room opens (new window).
// It sends no request except one no-cors reachability probe, stores nothing, approves nothing (approvals are console-only in both Headquarters),
// and builds all text with textContent (no innerHTML from data). The list comes from hq_shared_stations.json (generated from the Unreal station file).
(function () {
  'use strict';
  var LIST_URL = './hq_shared_stations.json';
  var state = { data: null, reachable: null };
  // Gateway address: HQ_CONFIG.gatewayBase (hq-config.local.js) wins, then the station list, then the loopback default.
  var DEFAULT_GATEWAY = 'http://127.0.0.1:8892';
  function gatewayBase() {
    var cfg = window.HQ_CONFIG || {};
    var v = cfg.gatewayBase || (state.data && state.data.gateway_base) || DEFAULT_GATEWAY;
    return String(v).replace(/\/+$/, '');
  }
  function configuredGatewayOrigin() { try { return new URL(gatewayBase()).origin; } catch (e) { return ''; } }

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'style') e.style.cssText = attrs[k]; else e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function pageUrl(p) { return gatewayBase() + p.path; }
  function linkFor(p) {
    var a = el('a', { href: pageUrl(p), target: '_blank', rel: 'noopener', style: 'display:block;color:#7DD3FC;text-decoration:none;padding:3px 0;font-size:12px;' }, p.label + '  ↗');
    return a;
  }
  function probe() {
    // reachable if the connection succeeds (an opaque response); not reachable if the browser cannot connect at all. Reads nothing.
    return fetch(gatewayBase() + '/api/public/status', { mode: 'no-cors', cache: 'no-store' }).then(function () { return true; }, function () { return false; });
  }

  var panel, button, statusLine;
  function build() {
    button = el('button', { id: 'btn-hq-pages', type: 'button', style: 'position:fixed;right:16px;bottom:16px;z-index:9998;padding:9px 14px;border-radius:8px;border:1px solid #38BDF8;background:#0B1B3D;color:#E0F2FE;font:700 12px sans-serif;cursor:pointer;' }, 'Headquarters pages');
    panel = el('div', { id: 'hq-pages-panel', style: 'position:fixed;right:16px;bottom:58px;z-index:9999;width:360px;max-height:70vh;overflow:auto;display:none;background:#08122B;border:1px solid #1E3A5F;border-radius:10px;padding:14px;color:#CBD5E1;font:12px sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);' });
    panel.appendChild(el('div', { style: 'font:800 14px sans-serif;color:#F8FAFC;margin-bottom:4px;' }, 'Headquarters pages'));
    panel.appendChild(el('div', { style: 'color:#94A3B8;margin-bottom:8px;' }, 'The same pages the Unreal room opens for each desk. They open in a new window. Nothing here approves anything: approvals and reviews are made at the owners\' console.'));
    statusLine = el('div', { style: 'margin-bottom:10px;font-weight:700;' }, 'Checking the Headquarters gateway...');
    panel.appendChild(statusLine);
    var cur = el('div', { style: 'margin:6px 0 10px;padding:8px;border:1px solid #1E3A5F;border-radius:8px;background:#0A1733;' });
    cur.appendChild(el('div', { style: 'color:#F8FAFC;font-weight:800;margin-bottom:4px;' }, 'How current is what this room shows'));
    panel.appendChild(cur);
    currencyRows(cur);
    state.data.stations.forEach(function (s) {
      if (!s.gateway_pages.length) return;
      var box = el('div', { 'data-station': s.id, style: 'border-top:1px solid #1E3A5F;padding:8px 0;' });
      box.appendChild(el('div', { style: 'color:#F8FAFC;font-weight:700;' }, s.title + (s.subtitle ? ' · ' + s.subtitle : '')));
      s.gateway_pages.forEach(function (p) { box.appendChild(linkFor(p)); });
      panel.appendChild(box);
    });
    var foot = el('div', { style: 'border-top:1px solid #1E3A5F;padding-top:8px;color:#64748B;' }, 'List generated from the Unreal station file (source ' + state.data.source_sha256.slice(0, 12) + '...).');
    panel.appendChild(foot);
    button.addEventListener('click', function () {
      var open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      if (!open) refreshStatus();
    });
    document.body.appendChild(panel); document.body.appendChild(button);
  }
  function refreshStatus() {
    probe().then(function (ok) {
      state.reachable = ok;
      statusLine.textContent = ok ? 'Gateway reachable at ' + gatewayBase() : 'Gateway NOT reachable at ' + gatewayBase() + ' (the gateway may not be running, or gatewayBase is not set in hq-config.local.js).';
      statusLine.style.color = ok ? '#34D399' : '#FBBF24';
    });
  }

  // In the agent / owner drawer: add the same pages for the desk that is open.
  function matchStation(name) {
    var full = String(name || '').trim().toLowerCase();
    if (!full) return null;
    var first = full.split(/[\s.,]+/)[0];
    var hit = null;
    // exact desk name first, then the first word of a full name
    [full, first].forEach(function (n) {
      if (hit || !n) return;
      state.data.stations.forEach(function (s) {
        var t = String(s.title || '').toLowerCase();
        if (!hit && (s.id === n || t === n || t.indexOf(n + ' ') === 0)) hit = s;
      });
    });
    return hit;
  }
  function decorateDrawer() {
    var nameEl = document.getElementById('drawer-name'), content = document.querySelector('#owner-agent-drawer .drawer-content');
    if (!nameEl || !content) return;
    function refresh() {
      var old = document.getElementById('hq-drawer-pages'); if (old) old.remove();
      var s = matchStation(nameEl.textContent);
      if (!s || !s.gateway_pages.length) return;
      var card = el('div', { id: 'hq-drawer-pages', class: 'drawer-card' });
      card.appendChild(el('div', { class: 'drawer-card-title' }, 'Open this desk in Headquarters (same pages as the Unreal room)'));
      s.gateway_pages.forEach(function (p) { card.appendChild(linkFor(p)); });
      content.insertBefore(card, content.firstChild);
    }
    new MutationObserver(refresh).observe(nameEl, { childList: true, characterData: true, subtree: true });
    refresh();
  }

  // ---- HONEST LABELS (text, labels and links only; same layout). The room's desk drawers were built as a design preview: the status pill, model, reviewer
  // and "current assignment" are hard-coded sample text, and the assignment form says a task was "staged" although it files nothing. The panel below also
  // says how current each part of the room is. Everything is read from files and routes THIS ROOM ALREADY READS (the Mission Control route, the job list,
  // the briefing and engineer records, the event log); no new endpoint, no write, no storage. R3 data cannot be read by a page on this origin (the gateway
  // sends no cross-origin permission, correctly), so R3 is offered as clearly labelled links only.
  var mcData = null, mcPromise = null;
  function loadMission() {
    if (!mcPromise) mcPromise = fetch('/api/mission-control', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { mcData = d; return d; }, function () { return null; });
    return mcPromise;
  }
  function agoText(ts) {
    var t = Date.parse(ts); if (isNaN(t)) return 'age unknown';
    var h = Math.max(0, Math.round((Date.now() - t) / 3600000));
    return h < 48 ? h + ' hours ago' : Math.round(h / 24) + ' days ago';
  }
  function day(ts) { return String(ts || '').slice(0, 10) || 'date unknown'; }
  function currencyRows(box) {
    function row(title, text, link) {
      var r = el('div', { style: 'padding:4px 0;border-bottom:1px solid #12274A;' });
      r.appendChild(el('div', { style: 'color:#E2E8F0;font-weight:700;' }, title));
      var t = el('div', { style: 'color:#94A3B8;' }, text);
      if (link) { t.appendChild(document.createTextNode(' ')); t.appendChild(link); }
      r.appendChild(t); box.appendChild(r); return t;
    }
    var base = gatewayBase();
    row('Engineering board (authoritative, R3)', 'Requests, cases, owner reviews and handoffs live on the Headquarters gateway (sign-in required there).', el('a', { href: base + '/app/#board', target: '_blank', rel: 'noopener', style: 'color:#7DD3FC;' }, 'open Requests and progress ↗'));
    var jobs = row('Command Board in this room', 'reading...');
    fetch('/api/jobs', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!Array.isArray(j)) { jobs.textContent = 'Orchestrator legacy job queue: not available (could not be read). It is not the R3 board.'; return; }
      var c = {}, newest = ''; j.forEach(function (x) { c[x.status] = (c[x.status] || 0) + 1; var t = String(x.created_utc || x.created_at || ''); if (t > newest) newest = t; });
      jobs.textContent = 'Orchestrator legacy job queue (not R3 requests): ' + j.length + ' jobs (' + Object.keys(c).sort().map(function (k) { return c[k] + ' ' + k; }).join(', ') + '), newest ' + day(newest) + (newest ? ' (' + agoText(newest) + ')' : '') + '. The R3 board is the link above.';
    }, function () { jobs.textContent = 'Orchestrator legacy job queue: not available (could not be read). It is not the R3 board.'; });
    var brief = row('Briefing table', 'reading...');
    fetch('./briefing_table_records.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      brief.textContent = d && d.as_of ? 'Static record written ' + day(d.as_of) + ' (' + agoText(d.as_of) + '), not current. The current briefing is on the Headquarters pages.' : 'Static record: date not available.';
    }, function () { brief.textContent = 'Static record: not available (could not be read).'; });
    var cards = row('Claude and Gemini desk cards', 'reading...');
    fetch('./ai_engineers_records.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      cards.textContent = d && d.as_of ? 'Static record written ' + day(d.as_of) + ' (' + agoText(d.as_of) + '); this room has no live link to a Claude or Gemini session.' : 'Static record: date not available.';
    }, function () { cards.textContent = 'Static record: not available (could not be read).'; });
    var ev = row('Activity bubbles', 'reading...');
    fetch('./live_events/events.jsonl', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : null; }).then(function (t) {
      if (!t) { ev.textContent = 'Orchestrator event log: not available (could not be read).'; return; }
      var lines = t.split('\n').filter(function (l) { return l.trim(); }), last = '';
      try { last = JSON.parse(lines[lines.length - 1]).ts || ''; } catch (e) { /* unreadable last line */ }
      ev.textContent = 'Replay of the orchestrator’s event log (' + lines.length + ' events), last entry ' + day(last) + (last ? ' (' + agoText(last) + ')' : '') + '. Not live activity and not R3 activity.';
    }, function () { ev.textContent = 'Orchestrator event log: not available (could not be read).'; });
    var ag = row('Agent status', 'reading...');
    loadMission().then(function (d) {
      var hb = d && d.workforce && d.workforce.orchestrator_bridge_heartbeat;
      ag.textContent = hb ? 'Orchestrator worker heartbeat last seen ' + day(hb.last_heartbeat) + ' (' + agoText(hb.last_heartbeat) + '). A desk shows a roster label, not proof that an agent is running.' : 'Agent status: not available (Mission Control could not be read).';
    });
  }
  function honestDrawer() {
    var drawer = document.getElementById('owner-agent-drawer'), nameEl = document.getElementById('drawer-name');
    if (!drawer || !nameEl) return;
    function apply() {
      var id = String(nameEl.textContent || '').trim().toUpperCase();
      var pill = document.getElementById('drawer-status-pill');
      if (pill) {
        var a = null;
        if (mcData && mcData.workforce && Array.isArray(mcData.workforce.orchestrator_bridge_agents)) mcData.workforce.orchestrator_bridge_agents.forEach(function (x) { if (String(x.id).toUpperCase() === id) a = x; });
        var want = a ? String(a.status) + ' (' + String(a.basis || 'no basis recorded') + ')' : (mcData ? 'NOT CONNECTED (no roster record for this desk)' : 'NOT CONNECTED (Mission Control could not be read)');
        if (pill.textContent !== want) pill.textContent = want;        // only write when it differs, or the observer below would trigger itself forever
        pill.style.color = a ? '#FBBF24' : '#94A3B8';
      }
      var marks = { 'primary model:': 'Primary Model (design sample, not live):', 'independent reviewer:': 'Independent Reviewer (design sample, not live):', 'task id:': 'Task ID (design sample, not live):', 'domain:': 'Domain (design sample):', 'governance:': 'Governance (design sample):' };
      drawer.querySelectorAll('.drawer-meta-line > span:first-child').forEach(function (sp) {
        var t = (sp.textContent || '').trim().toLowerCase(); if (marks[t] && (sp.textContent || '').indexOf('sample') < 0) sp.textContent = marks[t];
      });
      drawer.querySelectorAll('.drawer-card-title').forEach(function (ti) {
        var t = (ti.textContent || '').trim();
        if (t === 'Current Assignment') ti.textContent = 'Current Assignment (design sample, not a live task)';
        if (t === 'Stage Local Assignment (Safe Preview)') ti.textContent = 'Stage Local Assignment (preview only: files nothing)';
      });
    }
    var OPTS = { childList: true, characterData: true, subtree: true };
    var notice = document.getElementById('task-dispatch-notice');
    if (notice) {
      var NOTE = 'Nothing was filed or staged: this form is a preview and records nothing. To file a real request use Request work in Headquarters: ';
      var noticeObs = new MutationObserver(function () {
        if ((notice.textContent || '').indexOf('Nothing was filed or staged') === 0) return;      // already corrected: do nothing (no loop)
        noticeObs.disconnect();                                                                      // pause while we edit, so our own edit is not seen as a new change
        notice.textContent = NOTE;
        notice.appendChild(el('a', { href: gatewayBase() + '/app/#assistant', target: '_blank', rel: 'noopener', style: 'color:#7DD3FC;' }, 'open Request work ↗'));
        notice.style.display = 'block';
        noticeObs.observe(notice, OPTS);
      });
      noticeObs.observe(notice, OPTS);
    }
    var drawerObs = new MutationObserver(function () { drawerObs.disconnect(); try { apply(); } finally { drawerObs.observe(drawer, OPTS); } });
    drawerObs.observe(drawer, OPTS);
    loadMission().then(function () { drawerObs.disconnect(); try { apply(); } finally { drawerObs.observe(drawer, OPTS); } });
    drawerObs.disconnect(); try { apply(); } finally { drawerObs.observe(drawer, OPTS); }
  }

  // ---- OWNER DESKS AND MISSION CONTROL KIOSK. Front end only; no new authentication, endpoint, storage or backend.
  // An owner desk or the kiosk opens an overlay. When this room is served by the Headquarters gateway (127.0.0.1:<port>/hq3d) the overlay shows the REAL
  // gateway page (same origin, so X-Frame-Options SAMEORIGIN allows it): the sign-in form on that page is the gateway's own, so this room never sees or
  // keeps a token, and the session cookie stays HttpOnly. The only calls made are GET /api/public/status, GET /api/me and POST /api/logout (the gateway's
  // own sign-out). Served from port 8765 a page cannot show the gateway at all (framing and cross-origin reads are blocked on purpose), so there the
  // overlay only offers clearly labelled links. One browser holds one owner session at a time; the other owner's desk says so.
  // ---- IDLE SIGN-OUT GUARD (gateway room only). On /hq3d the gateway counts every cookie-bearing request as activity (the room's own polls, nav3d.js), so a signed-in
  // owner would never idle out while the room is open. This guard ends the session after 10 minutes WITHOUT REAL INPUT (pointer press, key, wheel, touch; mouse movement
  // does not count), the same limit as the Unreal Headquarters session. It sends nothing while the owner is active; at the limit it asks /api/me once and, only if a
  // session exists, calls the gateway's own POST /api/logout. Nothing is stored. window.__hqIdleGuard is a read-only view for testing.
  var idle = { ms: 10 * 60 * 1000, last: Date.now(), handled: false };
  function noteInput() { idle.last = Date.now(); idle.handled = false; }
  function trackDoc(doc) {
    try { ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (t) { doc.addEventListener(t, noteInput, { capture: true, passive: true }); }); } catch (e) { /* not readable */ }
  }
  function idleNotice(text) {
    var old = document.getElementById('hq-idle-notice'); if (old) old.remove();
    var n = el('div', { id: 'hq-idle-notice', role: 'status', style: 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:10001;padding:12px 16px;border-radius:10px;border:1px solid #FBBF24;background:#0B1B3D;color:#FEF3C7;font:700 13px sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.6);' }, text + '  ');
    var b = el('button', { type: 'button', style: 'margin-left:8px;padding:4px 9px;border-radius:6px;border:1px solid #FBBF24;background:#08122B;color:#FEF3C7;font:700 12px sans-serif;cursor:pointer;' }, 'OK');
    b.addEventListener('click', function () { n.remove(); }); n.appendChild(b); document.body.appendChild(n);
  }
  function idleGuard() {
    if (!inGatewayRoom()) return;
    var m = /[?&]idle_test_ms=(\d+)/.exec(location.search);
    if (m && location.origin !== configuredGatewayOrigin() && +m[1] >= 1000) idle.ms = +m[1];   // test override: never honoured on the configured gateway itself
    Object.defineProperty(window, '__hqIdleGuard', { value: Object.freeze({ get idleMs() { return idle.ms; }, get lastInput() { return idle.last; } }), writable: false, configurable: false });
    trackDoc(document);
    setInterval(function () {
      if (idle.handled || Date.now() - idle.last < idle.ms) return;
      idle.handled = true;                                                            // one check per idle period; any new input re-arms it
      fetch(location.origin + '/api/me', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (me) {
        if (!me || !me.signed_in) return;
        closeDesk();
        return fetch(location.origin + '/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(function () { idleNotice('Signed out after ' + Math.round(idle.ms / 60000 * 10) / 10 + ' minutes without use.'); });
      }).catch(function () { /* gateway not answering: nothing to sign out of */ });
    }, Math.min(5000, Math.max(500, Math.floor(idle.ms / 4))));
  }

  var deskUi = null;
  function inGatewayRoom() { return location.pathname.indexOf('/hq3d') === 0; }
  function gwBase() { return inGatewayRoom() ? location.origin : gatewayBase(); }
  function closeDesk() {
    if (!deskUi) return;
    clearInterval(deskUi.timer); document.removeEventListener('keydown', deskUi.onKey, true);
    try { deskUi.frame && (deskUi.frame.src = 'about:blank'); } catch (e) { /* closing anyway */ }
    deskUi.root.remove(); deskUi = null;
  }
  function gwJson(path, init) {
    var o = init || {}; o.credentials = 'same-origin'; o.cache = 'no-store';
    return fetch(gwBase() + path, o).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function openDesk(cfg) {
    // cfg: { title, accent, owner ('owner_a'|'owner_b'|null for the kiosk), pages: [{label, path}], start (path), fallbackBoard (function or null) }
    closeDesk();
    var accent = cfg.accent || '#38BDF8';
    var root = el('div', { id: 'hq-desk-overlay', style: 'position:fixed;inset:0;z-index:10000;background:rgba(3,8,20,.86);display:flex;align-items:center;justify-content:center;font:12px sans-serif;color:#CBD5E1;' });
    var card = el('div', { style: 'width:min(1280px,96vw);height:92vh;display:flex;flex-direction:column;background:#08122B;border:2px solid ' + accent + ';border-radius:10px;box-shadow:0 12px 50px rgba(0,0,0,.7);overflow:hidden;' });
    var head = el('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;background:#0B1B3D;border-bottom:1px solid #1E3A5F;' });
    head.appendChild(el('div', { style: 'font:800 14px sans-serif;color:#F8FAFC;margin-right:6px;' }, cfg.title));
    var ident = el('div', { style: 'font-weight:700;color:#94A3B8;' }, 'Checking...');
    head.appendChild(ident);
    head.appendChild(el('div', { style: 'flex:1;' }));
    var btnStyle = 'padding:6px 10px;border-radius:7px;border:1px solid ' + accent + ';background:#0A1733;color:#E0F2FE;font:700 12px sans-serif;cursor:pointer;';
    var tabs = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;' });
    head.appendChild(tabs);
    var signOutBtn = el('button', { type: 'button', style: btnStyle + 'display:none;' }, 'Sign out');
    var backBtn = el('button', { type: 'button', style: btnStyle + 'background:' + accent + ';color:#06101F;' }, 'Return to Headquarters room');
    head.appendChild(signOutBtn); head.appendChild(backBtn);
    var body = el('div', { style: 'flex:1;position:relative;background:#050B1C;' });
    card.appendChild(head); card.appendChild(body); root.appendChild(card);

    var ui = { root: root, frame: null, timer: null, me: null, onKey: null };
    deskUi = ui;
    ui.onKey = function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); closeDesk(); } };
    document.addEventListener('keydown', ui.onKey, true);
    backBtn.addEventListener('click', closeDesk);
    document.body.appendChild(root);

    function say(title, text, extra) {            // a message instead of the page (never a stand-in for data)
      body.textContent = ''; ui.frame = null;
      var m = el('div', { style: 'max-width:640px;margin:8vh auto 0;padding:18px;border:1px solid #1E3A5F;border-radius:10px;background:#0A1733;' });
      m.appendChild(el('div', { style: 'font:800 15px sans-serif;color:#F8FAFC;margin-bottom:8px;' }, title));
      m.appendChild(el('div', { style: 'line-height:1.5;color:#CBD5E1;margin-bottom:12px;' }, text));
      if (extra) extra(m);
      body.appendChild(m);
    }
    function button(label, fn) { var b = el('button', { type: 'button', style: btnStyle + 'margin-right:8px;' }, label); b.addEventListener('click', fn); return b; }
    function link(label, href) { return el('a', { href: href, target: '_blank', rel: 'noopener', style: 'display:inline-block;margin:0 8px 8px 0;padding:6px 10px;border-radius:7px;border:1px solid ' + accent + ';background:#0A1733;color:#7DD3FC;text-decoration:none;font:700 12px sans-serif;' }, label + '  ↗'); }
    function setIdent(me) {
      ui.me = me;
      if (me && me.signed_in) { ident.textContent = 'Signed in: ' + (me.name || me.owner) + ' (' + me.owner + ')'; ident.style.color = '#34D399'; signOutBtn.style.display = ''; }
      else if (me) { ident.textContent = 'Not signed in'; ident.style.color = '#FBBF24'; signOutBtn.style.display = 'none'; }
      else { ident.textContent = 'NOT CONNECTED'; ident.style.color = '#F87171'; signOutBtn.style.display = 'none'; }
    }

    // ---- served from 8765 (or any non-gateway page): no framing is possible; offer labelled links only
    if (!inGatewayRoom()) {
      setIdent(null); ident.textContent = 'Sign-in is shown on the gateway page';
      var base = gwBase();
      say(cfg.title, 'This room is served from ' + location.origin + ', and a page there cannot show the Headquarters gateway inside it (the gateway refuses to be framed by another address, and refuses cross-origin reads, on purpose). '
        + 'To sign in and work inside the room, open the signed-in Headquarters room below: it is this same room, served by the gateway. Or open the gateway page in its own window.', function (m) {
        m.appendChild(link('Open the signed-in Headquarters room', base + '/hq3d'));
        m.appendChild(link(cfg.owner ? 'Open sign-in in a new window' : 'Open the live dashboard in a new window', base + (cfg.owner ? '/app/#account' : '/app/')));
        if (cfg.fallbackBoard) m.appendChild(button('Open the Status Board', function () { cfg.fallbackBoard(); }));
        var st = el('div', { style: 'margin-top:8px;font-weight:700;' }, 'Checking the gateway...'); m.appendChild(st);
        fetch(base + '/api/public/status', { mode: 'no-cors', cache: 'no-store' }).then(function () { st.textContent = 'Gateway reachable at ' + base; st.style.color = '#34D399'; }, function () { st.textContent = 'NOT CONNECTED: the gateway did not answer at ' + base; st.style.color = '#F87171'; });
      });
      return;
    }

    // ---- served by the gateway: the real pages, same origin
    function presetOwner(f) {
      if (!cfg.owner) return;
      try {
        var d = f.contentDocument, sels = d.querySelectorAll('select');
        for (var i = 0; i < sels.length; i++) {
          var vals = [].map.call(sels[i].options, function (o) { return o.value; });
          if (vals.indexOf('owner_a') >= 0 && vals.indexOf('owner_b') >= 0 && sels[i].value !== cfg.owner) { sels[i].value = cfg.owner; sels[i].dispatchEvent(new Event('change', { bubbles: true })); }
        }
      } catch (e) { /* frame not ready */ }
    }
    function go(path) {
      body.textContent = '';
      var f = el('iframe', { title: cfg.title, src: gwBase() + path, style: 'width:100%;height:100%;border:0;background:#050B1C;' });
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');   // no top navigation: it cannot navigate this room away
      f.addEventListener('load', function () {
        if (deskUi !== ui) return;
        try { if (/^\/hq3d(\/|$)/.test(f.contentWindow.location.pathname)) { closeDesk(); return; } } catch (e) { /* not readable */ }
        refresh(); presetOwner(f); [400, 1200, 2400].forEach(function (ms) { setTimeout(function () { if (deskUi === ui && ui.frame === f) presetOwner(f); }, ms); });
        try {                                    // same origin: a hash change or a click inside the page is a user action, so the identity is re-read then (and only then)
          var w = f.contentWindow; trackDoc(w.document);
          // The dashboard has its own "3D Headquarters" link (href /hq3d). Inside this frame it would load a SECOND copy of the room. This room IS that room, so the link
          // just closes the overlay (the session cookie is untouched and nothing is reloaded).
          w.document.addEventListener('click', function (ev) {
            var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
            if (!a) return;
            var u; try { u = new URL(a.getAttribute('href'), w.location.href); } catch (e) { return; }
            if (u.origin === location.origin && /^\/hq3d\/?$/.test(u.pathname)) { ev.preventDefault(); ev.stopPropagation(); closeDesk(); }
          }, true);
          w.addEventListener('hashchange', function () { refresh(); presetOwner(f); });
          w.document.addEventListener('click', function () { clearTimeout(ui.clickTimer); ui.clickTimer = setTimeout(function () { if (deskUi === ui) { refresh(); presetOwner(f); } }, 1200); }, true);
        } catch (e) { /* not readable: the identity updates on the next load */ }
      });
      body.appendChild(f); ui.frame = f;
    }
    function show(me) {
      setIdent(me);
      if (cfg.owner && me.signed_in && me.owner !== cfg.owner) {
        var other = me.name || me.owner;
        say('Another owner is signed in in this room', other + ' is signed in in this room. One owner at a time in a room: ' + other + ' signs out first, then this desk can sign in. Nothing from ' + other + '\'s workspace is shown here.', function (m) {
          m.appendChild(button('Sign out ' + other, doSignOut));
        });
        return true;
      }
      return false;
    }
    function refresh() {
      if (deskUi !== ui) return;
      gwJson('/api/me').then(function (me) {
        if (deskUi !== ui) return;
        if (show(me)) return;
        if (!ui.frame) go(cfg.owner && !me.signed_in ? '/app/#account' : cfg.start);
      }, function () { if (deskUi === ui) { setIdent(null); say('NOT CONNECTED', 'The Headquarters gateway did not answer at ' + gwBase() + '. Nothing is shown because nothing could be read.', function (m) { m.appendChild(button('Try again', function () { ui.me = null; refresh(); })); }); } });
    }
    function doSignOut() {
      fetch(gwBase() + '/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(function () { ui.frame = null; ui.me = null; refresh(); }, function () { setIdent(null); });
    }
    signOutBtn.addEventListener('click', doSignOut);
    (cfg.pages || []).forEach(function (p) { tabs.appendChild(button(p.label, function () { if (ui.me && ui.me.signed_in && cfg.owner && ui.me.owner !== cfg.owner) return; go(p.path); })); });
    if (cfg.fallbackBoard) tabs.appendChild(button('Status Board', function () { cfg.fallbackBoard(); }));
    say('Connecting...', 'Checking the Headquarters gateway.');
    // Nothing here may touch the session in the background: /api/me counts as activity and would keep an owner signed in past the idle limit.
    function watchGateway() {
      fetch(gwBase() + '/api/public/status', { cache: 'no-store', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); }).catch(function () {
        if (deskUi !== ui) return;
        clearInterval(ui.timer); setIdent(null); say('NOT CONNECTED', 'The Headquarters gateway did not answer at ' + gwBase() + '. Nothing is shown because nothing could be read.', function (m) { m.appendChild(button('Try again', function () { openDesk(cfg); })); });
      });
    }
    head.addEventListener('click', function () { if (ui.frame) refresh(); });
    gwJson('/api/public/status').then(function () { refresh(); ui.timer = setInterval(watchGateway, 5000); },
      function () { setIdent(null); say('NOT CONNECTED', 'The Headquarters gateway did not answer at ' + gwBase() + '. Nothing is shown because nothing could be read.', function (m) { m.appendChild(button('Try again', function () { openDesk(cfg); })); }); });
  }
  function deskPages(id) {
    var out = [], seen = {};
    var s = state.data && state.data.stations.filter(function (x) { return x.id === id; })[0];
    ((s && s.gateway_pages) || []).forEach(function (p) {
      if (/^\/app\//.test(p.path) && !seen[p.path]) { seen[p.path] = 1; out.push({ label: p.label, path: p.path }); }
    });
    return out.length ? out : [{ label: 'Sign in / account', path: '/app/#account' }, { label: 'My assistant', path: '/app/#assistant' }];
  }
  window.hqDeskOpen = function (monitor, fallbackBoard) {
    var id = monitor && monitor.ownerId === 'owner_b' ? 'owner_b' : 'owner_a';
    openDesk({ title: (id === 'owner_b' ? 'Owner B' : 'Owner A') + ' · desk', accent: id === 'owner_b' ? '#38BDF8' : '#B7DCFF', owner: id, pages: deskPages(id), start: '/app/#assistant', fallbackBoard: fallbackBoard || null });
  };
  window.hqKioskOpen = function () {
    openDesk({ title: 'Mission Control · live Headquarters dashboard', accent: '#38BDF8', owner: null, pages: [], start: '/app/', fallbackBoard: null });
  };

  function start() {
    honestDrawer(); idleGuard();
    fetch(LIST_URL, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
      if (!d || !Array.isArray(d.stations)) throw new Error('unexpected list');
      state.data = d; build(); decorateDrawer();
    }).catch(function (e) { console.warn('hq_gateway_links: not shown (' + e.message + ')'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
