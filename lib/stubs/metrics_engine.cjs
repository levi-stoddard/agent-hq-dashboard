// STUB: stands in for a private metrics module (metrics_engine.cjs) that is not in this repository.
// It returns fixed, clearly labelled sample values so the dashboard renders. Nothing is measured.
const { readSample } = require('./_sample.cjs');

function calculateOperationalHealth() {
  const worker = readSample('worker.json', {});
  return {
    is_alive: worker.is_alive === true,
    status: worker.status || 'SAMPLE_DATA',
    pid: null,
    heartbeat_age_sec: null,
    current_task: worker.current_task || null,
    current_agent: worker.current_agent || null,
    display_score: 'SAMPLE DATA (stub)'
  };
}

function calculateEffectivenessScores() {
  const agents = readSample('agents.json', []);
  const scores = {};
  agents.forEach(a => { scores[a.id] = { status: 'INSUFFICIENT_DATA', display_score: 'INSUFFICIENT DATA (stub)' }; });
  return scores;
}

module.exports = { calculateOperationalHealth, calculateEffectivenessScores };
