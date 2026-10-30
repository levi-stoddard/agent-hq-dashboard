// STUB: stands in for a private event store module (event_store.cjs) that is not in this repository.
// Events come from sample-state/events.json (fictional). Appended events are kept in memory only.
const { readSample } = require('./_sample.cjs');

const appended = [];

function queryEvents(query = {}) {
  let events = readSample('events.json', []).concat(appended);
  if (query.agent_id) events = events.filter(e => e.agent_id === String(query.agent_id).toUpperCase());
  if (query.search) {
    const s = String(query.search).toLowerCase();
    events = events.filter(e => `${e.title} ${e.summary}`.toLowerCase().includes(s));
  }
  return events.slice().sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, 100);
}

function appendEvent(event) {
  const record = { event_id: `EVT-STUB-${appended.length + 1}`, timestamp: new Date().toISOString(), ...event };
  appended.push(record);
  if (appended.length > 200) appended.shift();
  return record;
}

module.exports = { queryEvents, appendEvent };
