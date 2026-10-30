// Copy to hq-config.local.js (gitignored) and fill in your values.
// prototype3d.html loads it before its own scripts; when it is missing the page uses the defaults noted below.
window.HQ_CONFIG = {
  // Status Board (owner approvals board). Empty hides the link.
  statusBoardUrl: "",
  // Agent HQ gateway. Empty uses gateway_base from hq_shared_stations.json (http://127.0.0.1:8892).
  gatewayBase: "",
  // Simulation Vault service, for example "http://127.0.0.1:8780". Empty turns the Vault table off.
  simulationVaultUrl: "",
  // Optional remote host: when the page is opened from this host name, remoteStatusBoardUrl is used instead.
  remoteGatewayHost: "",
  remoteStatusBoardUrl: ""
};
