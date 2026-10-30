// Shared helper for the stubs in this folder: reads a JSON file from sample-state/.
// The stubs stand in for private modules that are not part of this public copy.
const fs = require('fs');
const path = require('path');

const SAMPLE_DIR = path.join(__dirname, '..', '..', 'sample-state');

function readSample(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, name), 'utf8'));
  } catch (err) {
    return fallback;
  }
}

module.exports = { readSample, SAMPLE_DIR };
