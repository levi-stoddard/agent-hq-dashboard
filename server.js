/**
 * Agent HQ dashboard server
 * Local loopback HTTP server (127.0.0.1:8765), no npm dependencies.
 *
 * Security controls:
 * 1. Path traversal protection on static serving (strict resolution within PUBLIC_DIR).
 * 2. Origin and Referer validation on state-changing requests.
 * 3. Structured secret redaction on JSON endpoints that pass state through.
 * 4. HTML entity escaping on user-supplied strings that are stored or echoed.
 * 5. Owner authorization is delegated to the security-gate module (a stub in this public copy).
 *
 * The helper modules in lib/stubs/ stand in for private modules that are not part of this
 * repository. They return small fictional Acme Widgets sample data so the server starts on its own.
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const HOST = '127.0.0.1';
// Folder with the JSON state files. Defaults to the fictional sample data shipped in this repository.
const STATE_DIR = path.resolve(__dirname, process.env.AHQ_STATE_DIR || 'sample-state');
const STATE_FILE = path.join(STATE_DIR, 'mission_state.json');
const BACKLOG_FILE = path.join(STATE_DIR, 'autonomous_backlog.json');
const AGENTS_FILE = path.join(STATE_DIR, 'agents.json');
const PREFS_FILE = path.join(STATE_DIR, 'owner_preferences.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MISSION_CONTROL_CONFIG_FILE = path.join(STATE_DIR, 'mission_control_v01.json');
// Optional supervisor state file (not shipped). Set AHQ_SUPERVISOR_STATE_FILE to point at your own.
const LAUNCHER_STATE_FILE = path.resolve(__dirname, process.env.AHQ_SUPERVISOR_STATE_FILE || path.join('sample-state', 'launcher_state.json'));
// Loopback ports of the optional companion services that Mission Control probes.
const portFromEnv = (name, fallback) => { const n = Number(process.env[name]); return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback; };
const SIM_VAULT_PORT = portFromEnv('AHQ_SIM_VAULT_PORT', 8780);
const CALIBRATION_PORT = portFromEnv('AHQ_CALIBRATION_PORT', 8770);
const VAULT_RUNTIME_PORT = portFromEnv('AHQ_VAULT_RUNTIME_PORT', 8771);
const LIVE_EVENTS_FILE = path.join(PUBLIC_DIR, 'live_events', 'events.jsonl');       // optional; gitignored
const ORCHESTRATOR_BRIDGE_HEARTBEAT_FILE = path.join(STATE_DIR, 'hq_worker.lock');   // optional; not shipped
// Write-session token for the gated Command Board write routes. Read from the environment;
// when unset, POST /api/jobs and POST /api/sync/reconcile stay locked (403).
const WRITE_SESSION_TOKEN = process.env.HQ_WRITE_SESSION_TOKEN || '';

// Helper modules. Each file in lib/stubs/ stands in for a private module of the same name.
const { calculateEffectivenessScores, calculateOperationalHealth } = require('./lib/stubs/metrics_engine.cjs');
const { queryEvents, appendEvent } = require('./lib/stubs/event_store.cjs');
const { loadLessons, rollbackLesson, runRegressionSuite } = require('./lib/stubs/learning_engine.cjs');
const { getActiveDebates } = require('./lib/stubs/debate_engine.cjs');
const { generateDailyBriefing } = require('./lib/stubs/briefing_generator.cjs');
const { evaluateAction, signChallenge, consumeApproval } = require('./lib/stubs/security_gate.cjs');
const { createJob, listJobs, reconcileExternalSync, evaluateGatewayAuthorization } = require('./lib/stubs/command_board.cjs');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

// Optional, gitignored files under public/. When they are missing they are served as empty.
const OPTIONAL_FILES = {
  '/hq-config.local.js': '/* No hq-config.local.js: defaults are used (see hq-config.example.js). */\nwindow.HQ_CONFIG = window.HQ_CONFIG || {};\n',
  '/live_events/events.jsonl': ''
};

const ROLE_IDS = ['ORCHESTRATOR', 'ANALYST', 'PERFORMANCE', 'VERIFICATION', 'INTEGRATION', 'IMPLEMENTER', 'REQUIREMENTS', 'REVIEWER', 'QUALITY'];

function readJsonFile(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`Error reading ${path.basename(filePath)}:`, err.message);
  }
  return fallback;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${path.basename(filePath)}:`, err.message);
    return false;
  }
}

function readJsonLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  } catch (err) {
    return [];
  }
}

function ageSeconds(timestamp) {
  const parsed = Date.parse(timestamp || '');
  return Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now() - parsed) / 1000)) : null;
}

function probeHttp(port, requestPath, marker) {
  const checkedAt = new Date().toISOString();
  return new Promise(resolve => {
    const request = http.get({ hostname: '127.0.0.1', port, path: requestPath, timeout: 1200,
      headers: { Host: `127.0.0.1:${port}`, 'User-Agent': 'AgentHQMissionControl/0.1' } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { if (body.length < 300000) body += chunk; });
      response.on('end', () => {
        const identityOk = !marker || body.includes(marker);
        if (response.statusCode === 200 && identityOk) {
          resolve({ status: 'RUNNING', checked_at: checkedAt, last_successful_check: checkedAt, detail: `HTTP 200 identity verified on 127.0.0.1:${port}` });
        } else {
          resolve({ status: 'UNAVAILABLE', checked_at: checkedAt, last_successful_check: null,
            detail: `HTTP ${response.statusCode || 'unknown'}${identityOk ? '' : '; identity marker missing'}` });
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('probe timeout')));
    request.on('error', err => {
      const stopped = err.code === 'ECONNREFUSED';
      resolve({ status: stopped ? 'STOPPED' : 'UNAVAILABLE', checked_at: checkedAt, last_successful_check: null,
        detail: stopped ? `No listener on 127.0.0.1:${port}` : `${err.code || err.name}: ${err.message}` });
    });
  });
}

function probeTcp(port) {
  const checkedAt = new Date().toISOString();
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = result => { if (settled) return; settled = true; socket.destroy(); resolve(result); };
    socket.setTimeout(900);
    socket.on('connect', () => finish({ status: 'RUNNING', checked_at: checkedAt, last_successful_check: checkedAt,
      detail: `Loopback listener detected on 127.0.0.1:${port}; Vault-managed runtime identity is not revalidated by the dashboard` }));
    socket.on('timeout', () => finish({ status: 'UNAVAILABLE', checked_at: checkedAt, last_successful_check: null, detail: 'Loopback probe timed out' }));
    socket.on('error', err => finish({ status: err.code === 'ECONNREFUSED' ? 'STOPPED' : 'UNKNOWN', checked_at: checkedAt,
      last_successful_check: null, detail: err.code === 'ECONNREFUSED' ? `On-demand runtime is not running on 127.0.0.1:${port}` : `${err.code || err.name}: ${err.message}` }));
  });
}

async function buildMissionControlSnapshot() {
  const checkedAt = new Date().toISOString();
  const launcher = readJsonFile(LAUNCHER_STATE_FILE, null);
  const config = readJsonFile(MISSION_CONTROL_CONFIG_FILE, { priorities: [], decisions: [] });
  const events = readJsonLines(LIVE_EVENTS_FILE);
  const latestFor = predicate => events.filter(predicate).sort((a, b) => Date.parse(b.ts || 0) - Date.parse(a.ts || 0))[0] || null;
  const roleSummary = (id, label, predicate) => {
    const event = latestFor(predicate);
    const age = event ? ageSeconds(event.ts) : null;
    return { id, label, status: age !== null && age <= 120 ? 'ACTIVE' : (event ? 'LAST_RECORDED' : 'UNKNOWN'),
      last_event: event ? { ts: event.ts, task_id: event.task_id, kind: event.kind, text: event.text, source: event.source } : null,
      evidence: 'public/live_events/events.jsonl' };
  };
  const heartbeat = readJsonFile(ORCHESTRATOR_BRIDGE_HEARTBEAT_FILE, null);
  const heartbeatAge = heartbeat ? ageSeconds(heartbeat.last_heartbeat) : null;
  const bridgeOnline = heartbeatAge !== null && heartbeatAge <= 90;
  const [vault, calibration, runtime] = await Promise.all([
    probeHttp(SIM_VAULT_PORT, '/api/health', 'Agent HQ Simulation Vault'),
    probeHttp(CALIBRATION_PORT, '/api/state', 'SYNTHETIC'),
    probeTcp(VAULT_RUNTIME_PORT)
  ]);
  const launcherHq = launcher && launcher.services && launcher.services.headquarters;
  const hq = { status: 'RUNNING', checked_at: checkedAt, last_successful_check: checkedAt,
    detail: launcherHq && launcherHq.health_ok ? `This endpoint is responding; supervisor reports healthy PID ${launcherHq.pid}` : 'This Mission Control endpoint is responding on loopback' };
  const services = [
    { id: 'headquarters', label: 'Agent HQ dashboard', port: 8765, endpoint: '/prototype3d.html', ...hq },
    { id: 'simulation_vault', label: 'Simulation Vault', port: SIM_VAULT_PORT, endpoint: '/api/health', ...vault },
    { id: 'calibration_demo', label: 'Calibration demonstrator', port: CALIBRATION_PORT, endpoint: '/api/state', ...calibration },
    { id: 'vault_runtime', label: 'Vault-managed preserved runtime', port: VAULT_RUNTIME_PORT, endpoint: 'on-demand', ...runtime }
  ];
  return {
    schema: 'ahq.mission_control.v0.1', checked_at: checkedAt, read_only: true, local_only: true,
    provenance_note: 'Service state is live loopback observation. Worker activity comes only from recorded local events or a fresh orchestrator heartbeat. Priorities and decisions are sample configuration (fictional Acme Widgets data).',
    supervisor: launcher ? { updated_local: launcher.updated_local, loopback_only: launcher.loopback_only, pid: launcher.supervisor_pid } : null,
    services,
    workforce: {
      claude_roles: [
        roleSummary('CLAUDE', 'Claude acting coordinator', e => e.station === 'CLAUDE'),
        roleSummary('IMPLEMENTER_ROLE', 'Implementer-role Claude Code worker', e => e.station === 'IMPLEMENTER' && /subagent/i.test(e.runtime || '')),
        roleSummary('REVIEWER_ROLE', 'Reviewer-role Claude Code worker', e => e.station === 'REVIEWER' && /subagent/i.test(e.runtime || ''))
      ],
      orchestrator_bridge_heartbeat: heartbeat ? { last_heartbeat: heartbeat.last_heartbeat, age_sec: heartbeatAge, source: 'hq_worker.lock in the state folder' } : null,
      orchestrator_bridge_agents: ROLE_IDS.map(id => ({ id, status: bridgeOnline ? (heartbeat.agent_id === id ? 'ACTIVE' : 'ONLINE_IDLE') : 'OFFLINE',
        basis: bridgeOnline ? 'fresh shared orchestrator supervisor heartbeat' : 'no fresh orchestrator heartbeat (none is shipped with the public copy)' }))
    },
    priorities: Array.isArray(config.priorities) ? config.priorities : [],
    decisions: Array.isArray(config.decisions) ? config.decisions : [],
    next_priority: config.next_priority || null,
    recent_events: events.slice(-8).reverse().map(e => ({ ts: e.ts, station: e.station, from: e.from, task_id: e.task_id, kind: e.kind, text: e.text, source: e.source }))
  };
}

/**
 * Escapes untrusted text to prevent HTML injection / XSS
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Recursively redacts sensitive keys using schema-aware structural inspection
 */
function redactSecretsStructured(obj, visited = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (visited.has(obj)) return obj;
  visited.add(obj);

  const sensitiveKeyPatterns = [
    /secret/i, /token/i, /password/i, /private_key/i,
    /api_key/i, /auth_key/i, /signature/i, /nonce/i
  ];

  if (Array.isArray(obj)) {
    return obj.map(item => redactSecretsStructured(item, visited));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = sensitiveKeyPatterns.some(p => p.test(key));
    if (isSensitive && typeof value === 'string') {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSecretsStructured(value, visited);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(payload));
}

function readBody(req, handler) {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => handler(body));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams);

  // Set CORS headers for local loopback
  res.setHeader('Access-Control-Allow-Origin', `http://127.0.0.1:${PORT}`);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Request Origin Protection for state-changing operations
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    const origin = req.headers['origin'];
    const referer = req.headers['referer'];
    const validHostPatterns = [
      `http://127.0.0.1:${PORT}`,
      `http://localhost:${PORT}`
    ];

    const isValidOrigin = !origin || validHostPatterns.some(h => origin.startsWith(h));
    const isValidReferer = !referer || validHostPatterns.some(h => referer.startsWith(h));

    if (!isValidOrigin || !isValidReferer) {
      sendJson(res, 403, { error: '403 Forbidden: Untrusted request origin or CSRF attempt rejected.' });
      return;
    }
  }

  // --- API: worker telemetry ---
  if (pathname === '/api/worker' && req.method === 'GET') {
    const health = calculateOperationalHealth();
    const effectiveness = calculateEffectivenessScores();

    const backlog = readJsonFile(BACKLOG_FILE, []);
    const completedTasks = backlog.filter(t => t.status === 'COMPLETED');
    const inProgressTask = backlog.find(t => t.status === 'IN_PROGRESS');
    const queuedTasks = backlog.filter(t => t.status === 'QUEUED');

    const state = readJsonFile(STATE_FILE, {});
    const checkpoints = state.checkpoints || [];
    const lastCheckpoint = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;

    sendJson(res, 200, {
      worker_running: health.is_alive,
      worker_condition: health.status,
      pid: health.pid,
      heartbeat_age_sec: health.heartbeat_age_sec,
      last_heartbeat: new Date().toISOString(),
      current_task_title: health.current_task,
      active_wave: 'Agent HQ dashboard (public sample data)',
      mission_envelope: {
        stage: 'AGENT_HQ_v1.0',
        system_name: 'AGENT HQ v1.0',
        orchestrator: 'ORCHESTRATOR',
        permanent_agents: ROLE_IDS.length,
        operational_health: health.display_score,
        governance_status: 'TWO_OWNER_APPROVAL'
      },
      operational_health: health,
      effectiveness_scores: effectiveness,
      backlog_summary: {
        total: backlog.length,
        completed: completedTasks.length,
        in_progress: inProgressTask ? 1 : 0,
        queued: queuedTasks.length
      },
      last_checkpoint: lastCheckpoint
    });
    return;
  }

  // --- API: agent registry with metrics ---
  if (pathname === '/api/agents' && req.method === 'GET') {
    const agents = readJsonFile(AGENTS_FILE, []);
    const effectiveness = calculateEffectivenessScores();
    const health = calculateOperationalHealth();

    const enriched = agents.map(agent => ({
      ...agent,
      operational_health: health.is_alive ? (agent.id === health.current_agent ? 'ACTIVE_WORKING' : 'ONLINE_IDLE') : 'OFFLINE',
      effectiveness: effectiveness[agent.id] || { status: 'INSUFFICIENT_DATA', display_score: 'INSUFFICIENT DATA' }
    }));

    sendJson(res, 200, enriched);
    return;
  }

  // --- API: events and search (structured secret redaction) ---
  if (pathname === '/api/events' && req.method === 'GET') {
    sendJson(res, 200, redactSecretsStructured(queryEvents(query)));
    return;
  }

  // --- API: debates ---
  if (pathname === '/api/debates' && req.method === 'GET') {
    sendJson(res, 200, getActiveDebates());
    return;
  }

  // --- API: lessons registry ---
  if (pathname === '/api/lessons' && req.method === 'GET') {
    sendJson(res, 200, redactSecretsStructured(loadLessons()));
    return;
  }

  // --- API: regression suite ---
  if (pathname === '/api/regression/run' && req.method === 'GET') {
    sendJson(res, 200, runRegressionSuite());
    return;
  }

  // --- API: daily engineering briefing ---
  if (pathname === '/api/briefing' && req.method === 'GET') {
    sendJson(res, 200, generateDailyBriefing());
    return;
  }

  // --- API: Command Board jobs ---
  if (pathname === '/api/jobs' && req.method === 'GET') {
    sendJson(res, 200, listJobs(query));
    return;
  }

  // --- API: Mission Control v0.1 read-only local briefing ---
  if (pathname === '/api/mission-control' && req.method === 'GET') {
    try {
      const snapshot = await buildMissionControlSnapshot();
      sendJson(res, 200, snapshot, { 'Cache-Control': 'no-store' });
    } catch (err) {
      sendJson(res, 503, { schema: 'ahq.mission_control.v0.1', checked_at: new Date().toISOString(), read_only: true,
        error: 'MISSION_CONTROL_UNAVAILABLE', detail: err.message }, { 'Cache-Control': 'no-store' });
    }
    return;
  }

  if ((pathname === '/api/jobs' || pathname === '/api/sync/reconcile') && req.method === 'POST') {
    readBody(req, body => {
      try {
        const payload = JSON.parse(body || '{}');
        const authToken = payload.owner_auth_token || req.headers['x-owner-auth'];

        // Write endpoints stay locked unless the request carries the configured write-session token.
        if (!WRITE_SESSION_TOKEN || !authToken || authToken !== WRITE_SESSION_TOKEN) {
          sendJson(res, 403, {
            error: 'UNAUTHENTICATED_WRITE_DISABLED',
            message: pathname === '/api/jobs'
              ? 'Command Board write endpoints are locked in read-only preview mode until owner authentication is verified.'
              : 'Outbound sync reconciliation is locked in read-only preview mode until owner authentication is verified.',
            read_only_mode: true
          });
          return;
        }

        if (pathname === '/api/jobs') sendJson(res, 201, createJob(payload));
        else sendJson(res, 200, reconcileExternalSync());
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  // --- API: emergency freeze and recovery ---
  if ((pathname === '/api/emergency/freeze' || pathname === '/api/emergency/unfreeze') && req.method === 'POST') {
    readBody(req, body => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = evaluateGatewayAuthorization({
          action_type: pathname.endsWith('/freeze') ? 'EMERGENCY_SYSTEM_FREEZE' : 'LIFT_EMERGENCY_FREEZE',
          owner: payload.owner,
          totp_or_secret: payload.totp_or_secret
        });
        sendJson(res, result.success ? 200 : 403, result);
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  // --- API: owner preferences ---
  if (pathname === '/api/owner/preferences' && req.method === 'GET') {
    sendJson(res, 200, readJsonFile(PREFS_FILE, {}));
    return;
  }

  if (pathname === '/api/owner/preferences' && req.method === 'POST') {
    readBody(req, body => {
      try {
        const payload = JSON.parse(body);
        const prefs = readJsonFile(PREFS_FILE, {});
        const key = typeof payload.owner === 'string' ? payload.owner.toLowerCase() : '';
        if (key && prefs[key]) {
          // Escape string inputs to prevent stored XSS
          if (payload.settings) {
            for (const [k, v] of Object.entries(payload.settings)) {
              if (typeof v === 'string') payload.settings[k] = escapeHtml(v);
            }
          }
          Object.assign(prefs[key], payload.settings);
          writeJsonFile(PREFS_FILE, prefs);
        }
        sendJson(res, 200, { success: true, prefs });
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  // --- API: owner protected-action challenge request ---
  if (pathname === '/api/owner/action/request' && req.method === 'POST') {
    readBody(req, body => {
      try {
        const payload = JSON.parse(body || '{}');
        sendJson(res, 200, evaluateAction(payload.action_type, payload.details || {}));
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  // --- API: owner action authorization ---
  if (pathname === '/api/owner/authorize' && req.method === 'POST') {
    readBody(req, body => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.owner) {
          sendJson(res, 403, { success: false, error: 'Anonymous access rejected. Owner identity required.' });
          return;
        }
        const resAuth = signChallenge({
          challenge_id: payload.challenge_id,
          owner: payload.owner,
          signature: payload.signature,
          owner_secret: payload.owner_secret
        });
        sendJson(res, resAuth.success ? 200 : 403, resAuth);
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  // --- API: owner protected-action execution (atomic consumption gate) ---
  if (pathname === '/api/owner/action/execute' && req.method === 'POST') {
    readBody(req, body => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.challenge_id) {
          sendJson(res, 403, {
            success: false,
            error: 'Direct API access rejected: Missing authorization challenge. Protected actions require verified owner authorization.'
          });
          return;
        }
        const canonicalTarget = payload.canonical_target || (payload.details && (payload.details.canonical_target || payload.details.baseline || payload.details.target)) || 'UNKNOWN_TARGET';
        const targetContent = payload.target_content || (payload.details && (payload.details.target_content || payload.details.content)) || (payload.details ? JSON.stringify(payload.details) : undefined);
        const execRes = consumeApproval({
          challenge_id: payload.challenge_id,
          action_type: payload.action_type,
          canonical_target: canonicalTarget,
          target_content: targetContent
        });
        sendJson(res, execRes.success ? 200 : 403, execRes);
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  // --- API: meetings and Q&A (explicitly labelled fixed templates) ---
  if (pathname === '/api/meetings/query' && req.method === 'POST') {
    readBody(req, body => {
      try {
        const payload = JSON.parse(body);
        const agentId = String(payload.agent_id || 'ORCHESTRATOR').toUpperCase();
        const question = escapeHtml(payload.question || '');

        const responseData = handleAgentQuery(agentId, question);

        appendEvent({
          category: 'MEETING_INTERACTION',
          agent_id: agentId,
          severity: 'INFO',
          title: `Owner Q&A with ${agentId}`,
          summary: `Question: "${question.substring(0, 80)}..."`,
          details: { question, response: responseData.text, evidence: responseData.evidence }
        });

        sendJson(res, 200, responseData);
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  // --- API: roll back a lesson ---
  if (pathname === '/api/lessons/rollback' && req.method === 'POST') {
    readBody(req, body => {
      try {
        const payload = JSON.parse(body);
        sendJson(res, 200, rollbackLesson(payload.lesson_id, escapeHtml(payload.reason)));
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  // --- API: mission state (sanitized) ---
  if (pathname === '/api/state' && req.method === 'GET') {
    const state = readJsonFile(STATE_FILE, { error: 'State file not found' });
    sendJson(res, 200, redactSecretsStructured(state));
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'Unknown API route' });
    return;
  }

  // --- Static file serving (hardened against path traversal) ---
  let safeRelativePath;
  try {
    safeRelativePath = decodeURIComponent(pathname);
  } catch (err) {
    sendJson(res, 400, { error: '400 Bad Request: Malformed URI encoding.' });
    return;
  }

  // Reject directory traversal attempts and null byte injections
  if (safeRelativePath.includes('..') || safeRelativePath.includes('\0') || safeRelativePath.toLowerCase().includes('%2e')) {
    sendJson(res, 403, { error: '403 Forbidden: Path traversal attempt rejected.' });
    return;
  }

  const requestedPath = path.resolve(PUBLIC_DIR, safeRelativePath === '/' ? 'index.html' : '.' + safeRelativePath);

  // Path must be strictly within PUBLIC_DIR
  if (requestedPath !== PUBLIC_DIR && !requestedPath.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(res, 403, { error: '403 Forbidden: Requested path is out of public bounds.' });
    return;
  }

  const ext = path.extname(requestedPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(requestedPath, (err, content) => {
    if (err) {
      // Optional local files (gitignored) answer with an empty body instead of a 404, so the pages log no errors without them.
      if (err.code === 'ENOENT' && OPTIONAL_FILES[safeRelativePath] !== undefined) {
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        res.end(OPTIONAL_FILES[safeRelativePath]);
        return;
      }
      if (err.code === 'ENOENT' || err.code === 'EISDIR') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Not Found - Agent HQ</h1>');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

/**
 * Fixed, labelled template answers for the meetings panel. They are not model output.
 * The content is fictional (Acme Widgets thermostat firmware).
 */
function handleAgentQuery(agentId, question) {
  const q = question.toLowerCase();

  const base = {
    delivery_mode: 'DETERMINISTIC_EXPERT_TEMPLATE',
    disclaimer: 'Fixed template answer with fictional sample content; not a live model or multi-agent session.'
  };
  const answer = (agent, text, evidence, reviewer = 'REVIEWER') => ({ ...base, agent_id: agent, text, evidence, reviewer });

  switch (agentId) {
    case 'ANALYST':
      if (q.includes('sensor') || q.includes('drift') || q.includes('calibrat')) {
        return answer('ANALYST', 'The two candidate temperature sensors drift by less than 0.1 C per year in the vendor data. We still plan a 30-day soak test before choosing one; the data sheet alone is not evidence.', 'research/sensor_comparison.md');
      }
      return answer('ANALYST', 'Analyst standing by. Current topic: comparing temperature and humidity sensors for the next thermostat board.', 'research/README.md');
    case 'PERFORMANCE':
      if (q.includes('battery') || q.includes('power') || q.includes('sleep')) {
        return answer('PERFORMANCE', 'Measured sleep current is 18 uA on the bench board, against a 25 uA budget. The radio wake-up interval is the largest remaining cost.', 'bench/power_profile_rev_c.csv');
      }
      return answer('PERFORMANCE', 'Performance agent reporting. Tracking firmware size, boot time and battery budget for each build.', 'bench/README.md');
    case 'VERIFICATION':
      return answer('VERIFICATION', 'The hardware-in-the-loop rig ran 412 schedule-change cases overnight with no failures. Two flaky cases are quarantined and listed on the board.', 'tests/hil/report_latest.json');
    case 'INTEGRATION':
      return answer('INTEGRATION', 'Wi-Fi setup works end to end on the sample board. Pairing with the mobile app is the open item; it waits on the app team.', 'integration/setup_notes.md');
    case 'IMPLEMENTER':
      if (q.includes('schedule') || q.includes('setpoint')) {
        return answer('IMPLEMENTER', 'The schedule engine now stores setpoints in 15-minute slots. The change is behind a feature flag until review signs it off.', 'firmware/src/schedule.c');
      }
      return answer('IMPLEMENTER', 'Implementer reporting. Working on the schedule engine refactor in the thermostat firmware.', 'firmware/CHANGELOG.md');
    case 'REQUIREMENTS':
      return answer('REQUIREMENTS', 'Requirements are traced from the product brief to test cases. Three requirements still have no test and are marked open.', 'requirements/trace_matrix.csv');
    case 'REVIEWER':
      return answer('REVIEWER', 'Reviewer active. I check claims against evidence and re-run tests myself. Agreement between agents is not proof.', 'reviews/README.md', 'SELF_INDEPENDENT');
    case 'QUALITY':
      return answer('QUALITY', 'Two lessons were recorded this week, each with a regression test. One older lesson was rolled back after its test proved too strict.', 'quality/lessons.json');
    default:
      return answer('ORCHESTRATOR', `Orchestrator standing by. Coordinating ${ROLE_IDS.length} agents for both owners. Ask about any workstream, or open the Command Board.`, 'docs/ROLES.md');
  }
}

server.on('error', err => {
  console.error(`[Agent HQ] Server error: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[Agent HQ] Server live on http://${HOST}:${PORT}`);
  console.log('[Security] Local loopback only. Protected operations are gated (stub security gate in this public copy).');
});
