// STUB: stands in for a private debate module (debate_engine.cjs) that is not in this repository.
const { readSample } = require('./_sample.cjs');

function getActiveDebates() {
  return readSample('debates.json', []);
}

function startDebate() {
  return { success: false, error: 'Stub debate engine: not available in the public copy.' };
}

module.exports = { getActiveDebates, startDebate };
