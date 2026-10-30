/**
 * Agent HQ — 2.5D floor plan of the engineering headquarters
 * Self-contained canvas renderer (no external dependencies)
 * Renders the 8 headquarters zones, 9 agent workstations, and telemetry animations.
 */

class AgentHqVirtualOffice {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.onAgentSelected = options.onAgentSelected || function() {};
    this.onRoomSelected = options.onRoomSelected || function() {};
    this.onCommandBoardSelected = options.onCommandBoardSelected || function() {};

    // Camera parameters
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1.0,
      targetZoom: 1.0,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0
    };

    this.selectedAgent = 'ORCHESTRATOR';
    this.selectedRoom = null;
    this.hoveredRoom = null;
    this.hoveredAgent = null;

    // Room Layout (8 Required Zones in isometric coordinates)
    this.rooms = [
      { id: 'ROOM-CTO', name: 'CTO Command Office', agent: 'ORCHESTRATOR', x: -320, y: -220, w: 280, h: 180, color: '#1B365D', accent: '#D4AF37' },
      { id: 'ROOM-OWNER', name: 'Owner Command Center', agent: null, x: 0, y: -220, w: 280, h: 180, color: '#2B1B4D', accent: '#9B51E0' },
      { id: 'ROOM-REVIEW', name: 'Independent Review Room', agent: 'REVIEWER', x: 320, y: -220, w: 240, h: 180, color: '#3A1446', accent: '#BB86FC' },

      { id: 'ROOM-RESEARCH', name: 'Research & Analysis Lab', agent: 'ANALYST', x: -320, y: 0, w: 280, h: 200, color: '#004D40', accent: '#40E0D0' },
      { id: 'ROOM-CONF', name: 'Engineering Conference Room', agent: null, x: 0, y: 0, w: 280, h: 200, color: '#1C2833', accent: '#F1C40F' },
      { id: 'ROOM-LEARNING', name: 'Learning & Quality Center', agent: 'QUALITY', x: 320, y: 0, w: 240, h: 200, color: '#0E4B5B', accent: '#20B2AA' },

      { id: 'ROOM-FIRMWARE', name: 'Firmware & Performance Area', agent: 'PERFORMANCE', x: -320, y: 240, w: 420, h: 200, color: '#145A32', accent: '#2ECC71' },
      { id: 'ROOM-BUILD', name: 'Integration & Build Lab', agent: 'IMPLEMENTER', x: 140, y: 240, w: 420, h: 200, color: '#641E16', accent: '#E74C3C' }
    ];

    // Agent Workstation Coordinates inside rooms
    this.workstations = {
      'ORCHESTRATOR': { room: 'ROOM-CTO', x: -180, y: -130, color: '#D4AF37', title: 'Coordination console' },
      'REVIEWER': { room: 'ROOM-REVIEW', x: 440, y: -130, color: '#9370DB', title: 'Review desk' },
      'ANALYST': { room: 'ROOM-RESEARCH', x: -180, y: 100, color: '#40E0D0', title: 'Analysis bench' },
      'REQUIREMENTS': { room: 'ROOM-LEARNING', x: 380, y: 70, color: '#FFA500', title: 'Traceability console' },
      'QUALITY': { room: 'ROOM-LEARNING', x: 480, y: 130, color: '#20B2AA', title: 'Lessons ledger' },
      'PERFORMANCE': { room: 'ROOM-FIRMWARE', x: -220, y: 340, color: '#00FF7F', title: 'Power bench' },
      'VERIFICATION': { room: 'ROOM-FIRMWARE', x: -100, y: 340, color: '#1E90FF', title: 'HIL test rig' },
      'INTEGRATION': { room: 'ROOM-BUILD', x: 240, y: 340, color: '#FFD700', title: 'Connectivity bench' },
      'IMPLEMENTER': { room: 'ROOM-BUILD', x: 460, y: 340, color: '#FF4500', title: 'Firmware workstation' }
    };

    this.agentStatuses = {};
    this.activeWorkerData = null;
    this.animTime = 0;

    this.initEvents();
    this.resize();
    this.animate();
  }

  initEvents() {
    window.addEventListener('resize', () => this.resize());

    this.canvas.addEventListener('mousedown', (e) => {
      this.camera.isDragging = true;
      this.camera.lastMouseX = e.clientX;
      this.camera.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.camera.isDragging = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.camera.isDragging) {
        const dx = e.clientX - this.camera.lastMouseX;
        const dy = e.clientY - this.camera.lastMouseY;
        this.camera.x += dx;
        this.camera.y += dy;
        this.camera.lastMouseX = e.clientX;
        this.camera.lastMouseY = e.clientY;
      } else {
        this.checkHover(e);
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.camera.zoom = Math.max(0.5, Math.min(2.5, this.camera.zoom * zoomFactor));
    });

    this.canvas.addEventListener('click', (e) => {
      this.handleClick(e);
    });
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height || 540;
  }

  updateTelemetry(workerData, agentsData) {
    this.activeWorkerData = workerData;
    if (agentsData && Array.isArray(agentsData)) {
      agentsData.forEach(a => {
        this.agentStatuses[a.id] = a;
      });
    }
  }

  checkHover(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - this.canvas.width / 2 - this.camera.x) / this.camera.zoom;
    const my = (e.clientY - rect.top - this.canvas.height / 2 - this.camera.y) / this.camera.zoom;

    this.hoveredRoom = null;
    this.hoveredAgent = null;

    // Check agent workstations first
    for (const [id, ws] of Object.entries(this.workstations)) {
      const dist = Math.hypot(mx - ws.x, my - ws.y);
      if (dist < 32) {
        this.hoveredAgent = id;
        this.canvas.style.cursor = 'pointer';
        return;
      }
    }

    // Check rooms
    for (const r of this.rooms) {
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        this.hoveredRoom = r.id;
        this.canvas.style.cursor = 'pointer';
        return;
      }
    }

    this.canvas.style.cursor = 'default';
  }

  handleClick(e) {
    if (this.hoveredAgent) {
      this.selectedAgent = this.hoveredAgent;
      this.onAgentSelected(this.hoveredAgent);
    } else if (this.hoveredRoom) {
      this.selectedRoom = this.hoveredRoom;
      const room = this.rooms.find(r => r.id === this.hoveredRoom);
      if (room && room.id === 'ROOM-CONF' && this.onCommandBoardSelected) {
        this.onCommandBoardSelected();
      } else if (room && room.agent) {
        this.selectedAgent = room.agent;
        this.onAgentSelected(room.agent);
      }
      this.onRoomSelected(this.hoveredRoom);
    }
  }

  animate() {
    this.animTime += 0.03;
    this.render();
    requestAnimationFrame(() => this.animate());
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear background
    ctx.fillStyle = '#0B1118';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + this.camera.x, h / 2 + this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // Draw grid lines
    this.drawFloorGrid(ctx);

    // Draw rooms
    this.rooms.forEach(r => this.drawRoom(ctx, r));

    // Draw workstations & animated avatars
    for (const [id, ws] of Object.entries(this.workstations)) {
      this.drawWorkstation(ctx, id, ws);
    }

    ctx.restore();
  }

  drawFloorGrid(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const step = 40;
    const size = 600;
    for (let x = -size; x <= size; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, -size);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = -size; y <= size; y += step) {
      ctx.beginPath();
      ctx.moveTo(-size, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  }

  drawRoom(ctx, room) {
    const isHovered = this.hoveredRoom === room.id;
    const isSelected = this.selectedRoom === room.id;

    // Room base fill
    ctx.fillStyle = room.color;
    ctx.fillRect(room.x, room.y, room.w, room.h);

    // Room border
    ctx.strokeStyle = isSelected ? '#FFFFFF' : (isHovered ? room.accent : 'rgba(255, 255, 255, 0.15)');
    ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 1);
    ctx.strokeRect(room.x, room.y, room.w, room.h);

    // Room Label
    ctx.fillStyle = isHovered ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(room.name.toUpperCase(), room.x + 12, room.y + 20);

    // Ambient glow if active
    if (this.activeWorkerData && this.activeWorkerData.worker_running) {
      ctx.strokeStyle = room.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(room.x + 2, room.y + 2, room.w - 4, room.h - 4);
    }

    // Physical Command Board display on Conference Room wall
    if (room.id === 'ROOM-CONF') {
      const bx = room.x + 60;
      const by = room.y + 40;
      const bw = 160;
      const bh = 56;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('[ COMMAND BOARD ]', bx + 16, by + 22);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '9px sans-serif';
      ctx.fillText('CLICK TO OPEN BOARD', bx + 22, by + 40);
    }
  }

  drawWorkstation(ctx, id, ws) {
    const isHovered = this.hoveredAgent === id;
    const isSelected = this.selectedAgent === id;
    const isWorking = this.activeWorkerData && this.activeWorkerData.operational_health && this.activeWorkerData.operational_health.current_agent === id;

    // Desk shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(ws.x, ws.y + 16, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Desk surface
    ctx.fillStyle = '#1A232F';
    ctx.strokeStyle = isSelected ? '#00E5FF' : (isHovered ? ws.color : 'rgba(255, 255, 255, 0.2)');
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(ws.x - 22, ws.y - 10, 44, 24, 4);
    ctx.fill();
    ctx.stroke();

    // Computer screen glow
    const screenColor = isWorking ? '#00FF7F' : ws.color;
    ctx.fillStyle = screenColor;
    ctx.fillRect(ws.x - 12, ws.y - 8, 24, 4);

    // Agent Avatar Body
    const bob = Math.sin(this.animTime + (ws.x * 0.1)) * (isWorking ? 3 : 1);
    ctx.fillStyle = ws.color;
    ctx.beginPath();
    ctx.arc(ws.x, ws.y - 18 + bob, 8, 0, Math.PI * 2);
    ctx.fill();

    // Agent Hologram Aura if Working
    if (isWorking) {
      const pulse = (Math.sin(this.animTime * 3) + 1) * 6;
      ctx.strokeStyle = 'rgba(0, 255, 127, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ws.x, ws.y - 18 + bob, 12 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = isSelected ? '#00E5FF' : '#FFFFFF';
    ctx.font = isSelected ? 'bold 10px monospace' : '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(id, ws.x, ws.y + 28);
    ctx.textAlign = 'left';
  }
}

window.AgentHqVirtualOffice = AgentHqVirtualOffice;
