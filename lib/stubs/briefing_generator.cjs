// STUB: stands in for a private briefing generator (briefing_generator.cjs) that is not in this repository.
// It builds a short text briefing from the fictional sample backlog.
const { readSample } = require('./_sample.cjs');

function generateDailyBriefing() {
  const backlog = readSample('autonomous_backlog.json', []);
  const by = s => backlog.filter(t => t.status === s);
  const list = s => by(s).map(t => `- ${t.title} [${t.assigned_agent}]`);
  const lines = [
    '# Daily engineering briefing (sample data, stub generator)',
    '',
    'Team: Acme Widgets thermostat firmware (fictional).',
    '',
    `In progress (${by('IN_PROGRESS').length}):`, ...list('IN_PROGRESS'),
    '',
    `Queued (${by('QUEUED').length}):`, ...list('QUEUED'),
    '',
    `Completed (${by('COMPLETED').length}):`, ...list('COMPLETED'),
    '',
    'This briefing is generated from sample files. It is not a live report.'
  ];
  return { generated_at: new Date().toISOString(), markdown: lines.join('\n') };
}

module.exports = { generateDailyBriefing };
