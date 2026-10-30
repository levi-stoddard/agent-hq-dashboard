// STUB: stands in for a private Command Board module (command_board.cjs) that is not in this repository.
// Jobs come from sample-state/jobs.json (fictional Acme Widgets work items). Writes are not persisted.
const { readSample } = require('./_sample.cjs');

function listJobs(query = {}) {
  let jobs = readSample('jobs.json', []);
  const refs = j => j.external_references || {};
  if (query.agent) jobs = jobs.filter(j => j.assigned_agent === query.agent);
  if (query.priority) jobs = jobs.filter(j => j.priority === query.priority);
  if (query.source === 'LINEAR') jobs = jobs.filter(j => refs(j).linear);
  if (query.source === 'GITHUB') jobs = jobs.filter(j => refs(j).github);
  if (query.source === 'LOCAL') jobs = jobs.filter(j => !refs(j).linear && !refs(j).github);
  if (query.search) {
    const s = String(query.search).toLowerCase();
    jobs = jobs.filter(j => `${j.job_id} ${j.title} ${j.engineering_objective || ''}`.toLowerCase().includes(s));
  }
  return jobs;
}

function createJob(payload = {}) {
  return { job_id: `JOB-STUB-${Date.now()}`, status: 'QUEUED', persisted: false, ...payload, note: 'Stub Command Board: the job was not saved.' };
}

function reconcileExternalSync() {
  return { sync_event_id: 'SYNC-STUB', linear_imported: 0, github_linked: 0, conflicts_detected: 0, proposals_staged: 0, note: 'Stub: no external system was contacted.' };
}

function evaluateGatewayAuthorization({ action_type }) {
  return { success: false, action_type, reason: 'Stub Command Board: owner authorization is not available in the public copy.' };
}

module.exports = { listJobs, createJob, reconcileExternalSync, evaluateGatewayAuthorization };
