// STUB: stands in for a private owner security gate (security_gate.cjs) that is not in this repository.
// It never authorizes anything: every protected action is refused with a clear message.
let counter = 0;

function evaluateAction(actionType, details = {}) {
  counter += 1;
  return {
    action_type: actionType || 'UNKNOWN',
    requires_owner_approval: true,
    challenge_id: `AUTH-STUB-${counter}`,
    details,
    note: 'Stub security gate: a challenge id is issued for display only. It cannot be signed in the public copy.'
  };
}

function signChallenge({ challenge_id }) {
  return { success: false, challenge_id, error: 'Stub security gate: owner signing is not available in the public copy.' };
}

function consumeApproval({ challenge_id }) {
  return { success: false, challenge_id, error: 'Stub security gate: protected actions are never executed in the public copy.' };
}

function loadAuthData() {
  return {};
}

module.exports = { evaluateAction, signChallenge, consumeApproval, loadAuthData };
