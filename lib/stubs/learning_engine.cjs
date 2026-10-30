// STUB: stands in for a private learning/lessons module (learning_engine.cjs) that is not in this repository.
// Lessons come from sample-state/lessons.json (fictional). Rollback and the regression run change nothing.
const { readSample } = require('./_sample.cjs');

function loadLessons() {
  return readSample('lessons.json', []);
}

function rollbackLesson(lessonId, reason) {
  return { success: false, lesson_id: lessonId, reason, error: 'Stub learning engine: rollback is not available in the public copy.' };
}

function runRegressionSuite() {
  const lessons = loadLessons();
  return { total: lessons.length, passed: lessons.length, failed: 0, note: 'Stub result. No tests were run.' };
}

module.exports = { loadLessons, rollbackLesson, runRegressionSuite };
