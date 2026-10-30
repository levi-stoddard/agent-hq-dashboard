/**
 * Agent HQ — 2D dashboard controller
 * Connects the web UI to the local API, the 2.5D floor plan, Web Speech, and telemetry polling.
 */

document.addEventListener('DOMContentLoaded', () => {
  let virtualOffice = null;
  let allAgents = [];
  let speechRecognition = null;
  let isHandsFree = false;

  // Initialize Tab Navigation
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetId = `tab-${btn.dataset.tab}`;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');

      if (btn.dataset.tab === 'virtual-hq' && virtualOffice) {
        virtualOffice.resize();
      }
    });
  });

  // Initialize Virtual 3D Office
  const officeCanvas = document.getElementById('office-canvas');
  if (officeCanvas) {
    virtualOffice = new window.AgentHqVirtualOffice('office-canvas', {
      onAgentSelected: (agentId) => openAgentDrawer(agentId),
      onRoomSelected: (roomId) => console.log('Room selected:', roomId),
      onCommandBoardSelected: () => openCommandBoard()
    });
  }

  // View Toggle (3D vs 2D)
  const btn3d = document.getElementById('btn-toggle-3d');
  const btn2d = document.getElementById('btn-toggle-2d');
  const blueprintGrid = document.getElementById('blueprint-grid');

  btn3d.addEventListener('click', () => {
    btn3d.classList.add('active');
    btn2d.classList.remove('active');
    officeCanvas.style.display = 'block';
    blueprintGrid.style.display = 'none';
  });

  btn2d.addEventListener('click', () => {
    btn2d.classList.add('active');
    btn3d.classList.remove('active');
    officeCanvas.style.display = 'none';
    blueprintGrid.style.display = 'grid';
    render2DBlueprint();
  });

  // Agent Drawer Controls
  const drawer = document.getElementById('agent-drawer');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      drawer.style.display = 'none';
    });
  }

  function openAgentDrawer(agentId) {
    const agent = allAgents.find(a => a.id === agentId);
    if (!agent) return;

    document.getElementById('drawer-agent-name').textContent = agent.name;
    document.getElementById('drawer-agent-role').textContent = agent.role;
    document.getElementById('drawer-agent-summary').textContent = agent.summary;
    
    const eesDisplay = agent.effectiveness ? agent.effectiveness.display_score : 'INSUFFICIENT DATA';
    document.getElementById('drawer-agent-ees').textContent = eesDisplay;
    document.getElementById('drawer-agent-ohs').textContent = agent.operational_health || 'ONLINE_IDLE';
    document.getElementById('drawer-agent-model').textContent = agent.default_model;
    document.getElementById('drawer-agent-reviewer').textContent = agent.reviewer_id || 'REVIEWER';
    document.getElementById('drawer-agent-room').textContent = agent.room;

    drawer.style.display = 'block';
  }

  function render2DBlueprint() {
    blueprintGrid.innerHTML = '';
    if (!virtualOffice) return;

    virtualOffice.rooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'blueprint-room-card';
      const assignedAgent = allAgents.find(a => a.room === room.name);
      card.innerHTML = `
        <h4>${escapeHtml(room.name)}</h4>
        <div style="font-size: 12px; color: #E2E8F0; margin-bottom: 6px;">
          <strong>Workstation:</strong> ${assignedAgent ? escapeHtml(assignedAgent.name) + ' (' + escapeHtml(assignedAgent.id) + ')' : 'Multi-Agent Assembly'}
        </div>
        <div style="font-size: 11px; color: #94A3B8;">
          ${assignedAgent ? escapeHtml(assignedAgent.domain) : 'General Coordination & Synthesis'}
        </div>
      `;
      blueprintGrid.appendChild(card);
    });
  }

  // --- API Pollers ---

  async function fetchAgents() {
    try {
      const res = await fetch('/api/agents');
      allAgents = await res.json();
      renderTeamCards();
      if (virtualOffice) virtualOffice.updateTelemetry(null, allAgents);
    } catch (e) {
      console.error('Error fetching agents:', e);
    }
  }

  function renderTeamCards() {
    const container = document.getElementById('team-cards-container');
    if (!container) return;
    container.innerHTML = '';

    allAgents.forEach(a => {
      const card = document.createElement('div');
      card.className = 'telemetry-strip';
      const accent = (a.avatar && a.avatar.accent_color) ? a.avatar.accent_color : '#38BDF8';
      card.style.borderLeft = `4px solid ${escapeHtml(accent)}`;
      const opHealth = a.operational_health || 'UNKNOWN';
      const effScore = (a.effectiveness && a.effectiveness.display_score) ? a.effectiveness.display_score : 'INSUFFICIENT DATA';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <strong style="color: #F8FAFC; font-size: 15px;">${escapeHtml(a.name)} (${escapeHtml(a.id)})</strong>
            <span style="display: block; font-size: 11px; color: ${escapeHtml(accent)}; font-weight: 600;">${escapeHtml(a.role)}</span>
          </div>
          <span class="badge ${opHealth.includes('ACTIVE') ? 'running' : 'badge-idle'}">${escapeHtml(opHealth)}</span>
        </div>
        <p style="font-size: 11px; color: #CBD5E1; line-height: 1.4; margin-bottom: 10px;">${escapeHtml(a.summary)}</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; background: #1F2937; padding: 8px; border-radius: 4px;">
          <div><span style="color: #94A3B8;">Effectiveness:</span> <strong style="color: #F8FAFC;">${escapeHtml(effScore)}</strong></div>
          <div><span style="color: #94A3B8;">Model:</span> <strong style="color: #F8FAFC;">${escapeHtml(a.default_model)}</strong></div>
          <div><span style="color: #94A3B8;">Reviewer:</span> <strong style="color: #F8FAFC;">${escapeHtml(a.reviewer_id)}</strong></div>
          <div><span style="color: #94A3B8;">Room:</span> <strong style="color: #F8FAFC;">${escapeHtml(a.room)}</strong></div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  async function fetchWorkerTelemetry() {
    try {
      const res = await fetch('/api/worker');
      const data = await res.json();
      
      const healthBadge = document.getElementById('hq-health-badge');
      if (healthBadge) {
        healthBadge.textContent = data.operational_health ? data.operational_health.display_score : 'HEALTHY (100%)';
        healthBadge.className = data.worker_running ? 'badge badge-healthy' : 'badge badge-idle';
      }

      if (virtualOffice) {
        virtualOffice.updateTelemetry(data, allAgents);
      }
    } catch (e) {}
  }

  // --- Interactive Meetings ---
  const meetingInput = document.getElementById('meeting-input-field');
  const btnSendMeeting = document.getElementById('btn-send-meeting');
  const meetingSelect = document.getElementById('meeting-agent-select');
  const meetingBox = document.getElementById('meeting-history-box');

  async function sendMeetingMessage(text) {
    const question = text || meetingInput.value.trim();
    if (!question) return;

    const agentId = meetingSelect.value;

    // Append Owner Message
    const ownerMsg = document.createElement('div');
    ownerMsg.className = 'chat-msg owner';
    ownerMsg.innerHTML = `<div class="sender-tag" style="color: #93C5FD;">OWNER</div>${escapeHtml(question)}`;
    meetingBox.appendChild(ownerMsg);
    meetingInput.value = '';
    meetingBox.scrollTop = meetingBox.scrollHeight;

    try {
      const res = await fetch('/api/meetings/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, question })
      });
      const data = await res.json();

      // Append Agent Response
      const agentMsg = document.createElement('div');
      agentMsg.className = 'chat-msg agent';
      agentMsg.innerHTML = `
        <div class="sender-tag">${data.agent_id}</div>
        ${escapeHtml(data.text)}
        <div style="font-size: 10px; color: #94A3B8; margin-top: 6px;">
          <em>Evidence: ${data.evidence} &bull; ${data.reviewer}</em>
        </div>
      `;
      meetingBox.appendChild(agentMsg);
      meetingBox.scrollTop = meetingBox.scrollHeight;

      // Speak response if hands-free active
      if (isHandsFree && window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance(data.text);
        window.speechSynthesis.speak(utter);
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (btnSendMeeting) {
    btnSendMeeting.addEventListener('click', () => sendMeetingMessage());
  }
  if (meetingInput) {
    meetingInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMeetingMessage();
    });
  }

  // --- Web Speech API (PTT & Hands-Free) ---
  const micBadge = document.getElementById('mic-status-indicator');
  const btnPtt = document.getElementById('btn-ptt-mic');
  const btnHandsFree = document.getElementById('btn-handsfree-toggle');
  const btnMute = document.getElementById('btn-mute-emergency');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = false;

    speechRecognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      sendMeetingMessage(transcript);
    };

    speechRecognition.onerror = (e) => {
      micBadge.textContent = 'MIC ERROR: ' + e.error;
      micBadge.className = 'mic-status-badge';
    };

    speechRecognition.onend = () => {
      if (isHandsFree) {
        try { speechRecognition.start(); } catch(e) {}
      } else {
        micBadge.textContent = 'MIC OFF (READY)';
        micBadge.className = 'mic-status-badge';
      }
    };
  }

  if (btnPtt && speechRecognition) {
    btnPtt.addEventListener('mousedown', () => {
      micBadge.textContent = 'RECORDING AUDIO...';
      micBadge.className = 'mic-status-badge mic-live';
      try { speechRecognition.start(); } catch(e) {}
    });
    btnPtt.addEventListener('mouseup', () => {
      micBadge.textContent = 'TRANSCRIBING...';
      try { speechRecognition.stop(); } catch(e) {}
    });
  }

  if (btnHandsFree && speechRecognition) {
    btnHandsFree.addEventListener('click', () => {
      isHandsFree = !isHandsFree;
      if (isHandsFree) {
        btnHandsFree.classList.add('active');
        micBadge.textContent = 'MIC ACTIVE: LISTENING';
        micBadge.className = 'mic-status-badge mic-live';
        try { speechRecognition.start(); } catch(e) {}
      } else {
        btnHandsFree.classList.remove('active');
        micBadge.textContent = 'MIC OFF (READY)';
        micBadge.className = 'mic-status-badge';
        try { speechRecognition.stop(); } catch(e) {}
      }
    });
  }

  if (btnMute) {
    btnMute.addEventListener('click', emergencyMute);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') emergencyMute();
    });
  }

  function emergencyMute() {
    isHandsFree = false;
    if (btnHandsFree) btnHandsFree.classList.remove('active');
    if (speechRecognition) {
      try { speechRecognition.abort(); } catch(e) {}
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (micBadge) {
      micBadge.textContent = 'MIC MUTED';
      micBadge.className = 'mic-status-badge';
    }
  }

  // --- Learning & Lessons ---
  async function fetchLessons() {
    try {
      const res = await fetch('/api/lessons');
      const lessons = await res.json();
      const tbody = document.getElementById('lessons-table-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      lessons.forEach(l => {
        const tr = document.createElement('tr');
        const isPending = l.status && l.status.includes('PENDING');
        tr.innerHTML = `
          <td><code>${escapeHtml(l.lesson_id)}</code></td>
          <td><strong>${escapeHtml(l.title)}</strong></td>
          <td><span class="badge ${isPending ? 'badge-stale' : 'badge-healthy'}">${escapeHtml(l.root_cause_type)}</span></td>
          <td>${escapeHtml(l.status)}</td>
          <td><code>${escapeHtml(l.regression_test_file)}</code></td>
          <td>
            <button class="view-toggle-btn" onclick="rollbackLesson('${escapeHtml(l.lesson_id)}')" style="padding: 2px 6px; font-size: 10px;">Rollback</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {}
  }

  window.rollbackLesson = async (lessonId) => {
    if (!confirm(`Rollback lesson ${lessonId}?`)) return;
    await fetch('/api/lessons/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_id: lessonId, reason: 'Manual operator rollback' })
    });
    fetchLessons();
  };

  const btnRunReg = document.getElementById('btn-run-regressions');
  if (btnRunReg) {
    btnRunReg.addEventListener('click', async () => {
      const res = await fetch('/api/regression/run');
      const data = await res.json();
      const card = document.getElementById('regression-summary-card');
      const txt = document.getElementById('reg-summary-text');
      card.style.display = 'block';
      txt.textContent = `Executed ${data.total} regression tests. Passed: ${data.passed} / Failed: ${data.failed}.`;
    });
  }

  // --- Owner Security Gate ---
  const btnSubmitAuth = document.getElementById('btn-submit-auth');
  if (btnSubmitAuth) {
    btnSubmitAuth.addEventListener('click', async () => {
      const challengeId = document.getElementById('auth-challenge-id').value.trim();
      const owner = document.getElementById('auth-owner-select').value;
      const feedback = document.getElementById('auth-feedback');

      if (!challengeId) {
        feedback.textContent = 'Please enter a valid challenge ID.';
        feedback.style.color = '#F87171';
        return;
      }

      const res = await fetch('/api/owner/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: challengeId, owner: owner })
      });
      const data = await res.json();
      if (data.success) {
        feedback.textContent = `Signature recorded for ${owner}. Status: ${data.status} (Authorized: ${data.authorized})`;
        feedback.style.color = '#34D399';
      } else {
        feedback.textContent = `Error: ${data.error}`;
        feedback.style.color = '#F87171';
      }
    });
  }

  // Owner Preferences
  async function fetchOwnerPreferences(owner = 'owner_a') {
    try {
      const res = await fetch('/api/owner/preferences');
      const data = await res.json();
      const box = document.getElementById('pref-details-box');
      const p = data[owner] || {};
      box.innerHTML = `
        <strong>${escapeHtml(p.name || owner)} Preferences:</strong><br>
        &bull; <strong>Topics:</strong> ${(p.topics || []).map(escapeHtml).join(', ')}<br>
        &bull; <strong>Alert Categories:</strong> ${(p.alert_categories || []).map(escapeHtml).join(', ')}<br>
        &bull; <strong>Delivery Channels:</strong> ${(p.delivery_methods || []).map(escapeHtml).join(', ')}<br>
        &bull; <strong>Quiet Hours:</strong> ${p.quiet_hours ? (p.quiet_hours.enabled ? escapeHtml(p.quiet_hours.start_local) + ' - ' + escapeHtml(p.quiet_hours.end_local) : 'Disabled') : 'N/A'}<br>
        &bull; <strong>Daily Briefing:</strong> ${p.daily_briefing ? 'Active at ' + escapeHtml(p.briefing_time_utc) + ' UTC' : 'Inactive'}
      `;
    } catch(e) {}
  }

  const btnPrefOwnerA = document.getElementById('btn-pref-owner_a');
  const btnPrefOwnerB = document.getElementById('btn-pref-owner_b');
  if (btnPrefOwnerA && btnPrefOwnerB) {
    btnPrefOwnerA.addEventListener('click', () => {
      btnPrefOwnerA.classList.add('active');
      btnPrefOwnerB.classList.remove('active');
      fetchOwnerPreferences('owner_a');
    });
    btnPrefOwnerB.addEventListener('click', () => {
      btnPrefOwnerB.classList.add('active');
      btnPrefOwnerA.classList.remove('active');
      fetchOwnerPreferences('owner_b');
    });
  }

  // --- Historical Events Timeline ---
  async function fetchTimeline() {
    try {
      const res = await fetch('/api/events');
      const events = await res.json();
      const container = document.getElementById('timeline-events-container');
      if (!container) return;
      container.innerHTML = '';

      events.forEach(e => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: #38BDF8;">[${escapeHtml(e.agent_id)}] ${escapeHtml(e.title)}</strong>
            <span style="color: #64748B; font-size: 11px;">${escapeHtml(e.timestamp)}</span>
          </div>
          <p style="color: #CBD5E1; margin: 0;">${escapeHtml(e.summary)}</p>
        `;
        container.appendChild(item);
      });
    } catch (e) {}
  }

  // --- Daily Briefing ---
  async function fetchBriefing() {
    try {
      const res = await fetch('/api/briefing');
      const data = await res.json();
      const box = document.getElementById('briefing-content-box');
      if (box) box.textContent = data.markdown;
    } catch (e) {}
  }

  const btnRefreshBriefing = document.getElementById('btn-refresh-briefing');
  if (btnRefreshBriefing) {
    btnRefreshBriefing.addEventListener('click', fetchBriefing);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Engineering Command Board (Physical Hotspot & Modal) ---
  const cmdBoardModal = document.getElementById('command-board-modal');
  const newTaskModal = document.getElementById('new-task-modal');
  const btnOpenCmdBoard = document.getElementById('btn-open-cmd-board');
  const btnCloseCmdBoard = document.getElementById('btn-close-cmd-board');
  const btnModalNewTask = document.getElementById('btn-modal-new-task');
  const btnCloseNewTaskModal = document.getElementById('btn-close-new-task-modal');
  const btnCancelCreateTask = document.getElementById('btn-cancel-create-task');
  const formCreateTask = document.getElementById('form-create-task');
  const btnModalSyncReconcile = document.getElementById('btn-modal-sync-reconcile');
  const btnModalEmergencyFreeze = document.getElementById('btn-modal-emergency-freeze');
  const btnRefreshJobs = document.getElementById('btn-refresh-jobs');

  const cmdSearchInput = document.getElementById('cmd-search-input');
  const cmdFilterAgent = document.getElementById('cmd-filter-agent');
  const cmdFilterPriority = document.getElementById('cmd-filter-priority');
  const cmdFilterSource = document.getElementById('cmd-filter-source');

  function openCommandBoard() {
    if (cmdBoardModal) {
      cmdBoardModal.style.display = 'block';
      loadCommandBoardJobs();
    }
  }

  function closeCommandBoard() {
    if (cmdBoardModal) cmdBoardModal.style.display = 'none';
    if (newTaskModal) newTaskModal.style.display = 'none';
  }

  function openNewTaskModal() {
    if (newTaskModal) newTaskModal.style.display = 'block';
  }

  function closeNewTaskModal() {
    if (newTaskModal) newTaskModal.style.display = 'none';
  }

  if (btnOpenCmdBoard) btnOpenCmdBoard.addEventListener('click', openCommandBoard);
  if (btnCloseCmdBoard) btnCloseCmdBoard.addEventListener('click', closeCommandBoard);
  if (btnModalNewTask) btnModalNewTask.addEventListener('click', openNewTaskModal);
  if (btnCloseNewTaskModal) btnCloseNewTaskModal.addEventListener('click', closeNewTaskModal);
  if (btnCancelCreateTask) btnCancelCreateTask.addEventListener('click', closeNewTaskModal);

  // Esc key closes modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (newTaskModal && newTaskModal.style.display === 'block') {
        closeNewTaskModal();
      } else if (cmdBoardModal && cmdBoardModal.style.display === 'block') {
        closeCommandBoard();
      }
    }
  });

  function debounce(fn, ms) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  if (cmdSearchInput) cmdSearchInput.addEventListener('input', debounce(loadCommandBoardJobs, 300));
  if (cmdFilterAgent) cmdFilterAgent.addEventListener('change', loadCommandBoardJobs);
  if (cmdFilterPriority) cmdFilterPriority.addEventListener('change', loadCommandBoardJobs);
  if (cmdFilterSource) cmdFilterSource.addEventListener('change', loadCommandBoardJobs);
  if (btnRefreshJobs) btnRefreshJobs.addEventListener('click', loadCommandBoardJobs);

  async function loadCommandBoardJobs() {
    try {
      const params = new URLSearchParams();
      if (cmdSearchInput && cmdSearchInput.value.trim()) params.set('search', cmdSearchInput.value.trim());
      if (cmdFilterAgent && cmdFilterAgent.value) params.set('agent', cmdFilterAgent.value);
      if (cmdFilterPriority && cmdFilterPriority.value) params.set('priority', cmdFilterPriority.value);
      if (cmdFilterSource && cmdFilterSource.value && cmdFilterSource.value !== 'ALL') params.set('source', cmdFilterSource.value);

      const res = await fetch(`/api/jobs?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const jobs = await res.json();
      renderKanbanColumns(jobs);
    } catch (e) {
      console.error('Failed to load Command Board jobs:', e);
    }
  }

  function renderKanbanColumns(jobs) {
    const colQueued = document.getElementById('col-queued');
    const colInProgress = document.getElementById('col-inprogress');
    const colBlocked = document.getElementById('col-blocked');
    const colCompleted = document.getElementById('col-completed');

    if (!colQueued || !colInProgress || !colBlocked || !colCompleted) return;

    colQueued.innerHTML = '';
    colInProgress.innerHTML = '';
    colBlocked.innerHTML = '';
    colCompleted.innerHTML = '';

    let countQueued = 0;
    let countInProgress = 0;
    let countBlocked = 0;
    let countCompleted = 0;

    jobs.forEach(job => {
      const card = createJobCardElement(job);
      const st = (job.status || 'QUEUED').toUpperCase();

      if (st === 'QUEUED' || st === 'TRIAGED' || st === 'BACKLOG') {
        colQueued.appendChild(card);
        countQueued++;
      } else if (st === 'IN_PROGRESS' || st === 'ACTIVE' || st === 'RUNNING' || st === 'IN_REVIEW') {
        colInProgress.appendChild(card);
        countInProgress++;
      } else if (st === 'BLOCKED' || st === 'APPROVAL_REQUIRED' || st === 'PENDING_APPROVAL') {
        colBlocked.appendChild(card);
        countBlocked++;
      } else if (st === 'COMPLETED' || st === 'VERIFIED' || st === 'RESOLVED' || st === 'CLOSED') {
        colCompleted.appendChild(card);
        countCompleted++;
      } else {
        colQueued.appendChild(card);
        countQueued++;
      }
    });

    const elCountQueued = document.getElementById('count-queued');
    const elCountInProg = document.getElementById('count-inprogress');
    const elCountBlocked = document.getElementById('count-blocked');
    const elCountComp = document.getElementById('count-completed');

    if (elCountQueued) elCountQueued.textContent = countQueued;
    if (elCountInProg) elCountInProg.textContent = countInProgress;
    if (elCountBlocked) elCountBlocked.textContent = countBlocked;
    if (elCountComp) elCountComp.textContent = countCompleted;
  }

  function createJobCardElement(job) {
    const el = document.createElement('div');
    el.className = 'job-card';
    el.style.background = '#1F2937';
    el.style.border = '1px solid #374151';
    el.style.borderRadius = '6px';
    el.style.padding = '10px';
    el.style.fontSize = '12px';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap = '6px';

    const priorityColors = {
      URGENT: '#EF4444',
      HIGH: '#F59E0B',
      MEDIUM: '#38BDF8',
      LOW: '#94A3B8'
    };
    const pColor = priorityColors[job.priority] || '#94A3B8';

    const linearBadge = (job.external_references && job.external_references.linear)
      ? `<span style="background: #4F46E5; color: #FFF; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px;">Linear: ${escapeHtml(job.external_references.linear.identifier || job.external_references.linear.issue_id)}</span>`
      : '';

    const githubBadge = (job.external_references && job.external_references.github)
      ? `<span style="background: #0284C7; color: #FFF; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px;">GH: PR #${escapeHtml(job.external_references.github.pr_number || 'Linked')}</span>`
      : '';

    const AGENT_COLORS = { ANALYST: '#40E0D0', PERFORMANCE: '#2ECC71', INTEGRATION: '#FFD700', IMPLEMENTER: '#FF4500', VERIFICATION: '#1E90FF',
      LINEAR_AGENT: '#A855F7', GITHUB_AGENT: '#EC4899', REVIEWER: '#BB86FC', QUALITY: '#20B2AA', REQUIREMENTS: '#FFA500' };
    const agentColor = AGENT_COLORS[job.assigned_agent] || '#D4AF37';

    el.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #64748B; font-size: 10px; font-family: monospace;">${escapeHtml(job.job_id)}</span>
        <span style="background: ${pColor}22; color: ${pColor}; font-weight: 700; font-size: 10px; padding: 1px 6px; border-radius: 3px; border: 1px solid ${pColor}44;">${escapeHtml(job.priority || 'MED')}</span>
      </div>
      <div style="color: #F8FAFC; font-weight: 600; line-height: 1.3;">
        ${escapeHtml(job.title)}
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 2px;">
        <span style="background: #111827; color: ${agentColor}; border: 1px solid ${agentColor}44; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px;">
          ${escapeHtml(job.assigned_agent || 'UNASSIGNED')}
        </span>
        <span style="background: #111827; color: #94A3B8; font-size: 10px; padding: 2px 5px; border-radius: 3px;">
          ${escapeHtml(job.domain || 'GENERAL')}
        </span>
        ${linearBadge}
        ${githubBadge}
      </div>
      <div style="color: #94A3B8; font-size: 11px; line-height: 1.3; margin-top: 2px; max-height: 40px; overflow: hidden; text-overflow: ellipsis;">
        ${escapeHtml(job.engineering_objective || job.description || '')}
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; border-top: 1px solid #374151; padding-top: 4px; font-size: 10px; color: #64748B;">
        <span>Gov: ${escapeHtml(job.governance_classification || 'ROUTINE')}</span>
        <span>${escapeHtml((job.execution_evidence && job.execution_evidence.reviewer_verdict) || 'READY')}</span>
      </div>
    `;

    return el;
  }

  // Handle New Task Form submission
  if (formCreateTask) {
    formCreateTask.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('input-task-title').value.trim();
      const objective = document.getElementById('input-task-objective').value.trim();
      const priority = document.getElementById('input-task-priority').value;
      const domain = document.getElementById('input-task-domain').value;

      try {
        const res = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title,
            engineering_objective: objective,
            description: objective,
            priority: priority,
            domain: domain,
            created_by: 'OWNER_UI'
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (errData.error === 'UNAUTHENTICATED_WRITE_DISABLED') {
            alert('SECURITY NOTICE (READ-ONLY PREVIEW):\n' + errData.message + '\n\nTask intake is currently operating in safe read-only preview mode.');
            closeNewTaskModal();
            return;
          }
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        formCreateTask.reset();
        closeNewTaskModal();
        await loadCommandBoardJobs();
        fetchTimeline();
      } catch (err) {
        alert('Task Creation Status: ' + err.message);
      }
    });
  }

  // Handle Sync Reconcile button
  if (btnModalSyncReconcile) {
    btnModalSyncReconcile.addEventListener('click', async () => {
      btnModalSyncReconcile.disabled = true;
      btnModalSyncReconcile.textContent = 'Syncing...';
      try {
        const res = await fetch('/api/sync/reconcile', { method: 'POST' });
        const data = await res.json();
        if (!res.ok && data.error === 'UNAUTHENTICATED_WRITE_DISABLED') {
          alert('SECURITY NOTICE (READ-ONLY PREVIEW):\n' + data.message + '\n\nOutbound write sync is locked pending verified owner authentication.');
          return;
        }
        alert(`Sync Reconciled: ${data.sync_event_id}\n\n• Linear imported: ${data.linear_imported}\n• GitHub linked: ${data.github_linked}\n• Conflicts detected: ${data.conflicts_detected}\n• Proposals staged: ${data.proposals_staged} (Awaiting Owner sign-off)\n\nLocal evidence remains controlling truth.`);
        await loadCommandBoardJobs();
        fetchTimeline();
      } catch (err) {
        alert('Sync Reconciliation Status: ' + err.message);
      } finally {
        btnModalSyncReconcile.disabled = false;
        btnModalSyncReconcile.innerHTML = '&#8635; Sync Reconcile';
      }
    });
  }

  // Handle Emergency Freeze button
  if (btnModalEmergencyFreeze) {
    btnModalEmergencyFreeze.addEventListener('click', async () => {
      const owner = prompt('Enter owner ID to trigger EMERGENCY FREEZE (OWNER_A or OWNER_B):', 'OWNER_B');
      if (!owner) return;
      const secret = prompt('Enter owner TOTP or authorization token:');
      if (!secret) return;

      try {
        const res = await fetch('/api/emergency/freeze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: owner.trim().toUpperCase(),
            totp_or_secret: secret.trim()
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert(`EMERGENCY SYSTEM FREEZE ENGAGED: ${data.details}\nAll agent operations and write pipelines halted.`);
        } else {
          alert(`Authorization Denied: ${data.reason || data.error || 'Failed'}`);
        }
      } catch (err) {
        alert('Emergency freeze request failed: ' + err.message);
      }
    });
  }

  // Initial Data Loads
  fetchAgents();
  fetchWorkerTelemetry();
  fetchLessons();
  fetchOwnerPreferences('owner_a');
  fetchTimeline();
  fetchBriefing();
  loadCommandBoardJobs();

  // Periodic Telemetry Polling (every 4 seconds)
  setInterval(() => {
    fetchWorkerTelemetry();
    fetchTimeline();
  }, 4000);
});
