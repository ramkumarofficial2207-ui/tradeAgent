const API = "";
const AUTO_INTERVAL_MS = 120000;

const state = {
  auto: false,
  timer: null,
  broker: null,
  lastScanData: null,
};

function byId(id) {
  return document.getElementById(id);
}

function fmtRs(v) {
  const n = Number(v || 0);
  return "Rs " + n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function fmtPct(v) {
  const n = Number(v || 0);
  const p = n >= 0 ? "+" : "";
  return p + n.toFixed(2) + "%";
}

function ts() {
  return new Date().toLocaleTimeString("en-IN", { hour12: false });
}

function setText(id, text) {
  const el = byId(id);
  if (el) el.textContent = text;
}

function appendLog(message, tone = "blue") {
  const log = byId("agent-log");
  if (!log) return;
  const line = document.createElement("div");
  line.className = "log-line";
  line.innerHTML = `<span class="log-time">[${ts()}]</span><span class="text-${tone}">${message}</span>`;
  log.prepend(line);
  while (log.children.length > 80) {
    log.removeChild(log.lastChild);
  }
}

function updateClock() {
  setText("clock-pill", `Time ${ts()}`);
}

function setAutoUi() {
  setText("auto-pill", state.auto ? "Auto ON" : "Auto OFF");
  const btn = byId("auto-btn");
  if (btn) btn.textContent = state.auto ? "Disable Auto Loop" : "Enable Auto Loop";
}

function updateBrokerUi() {
  if (!state.broker) {
    setText("broker-pill", "Broker unknown");
    return;
  }
  const mode = state.broker.live ? "LIVE" : "PAPER";
  setText("broker-pill", `${String(state.broker.provider).toUpperCase()} ${mode}`);
}

function setScanBusy(on) {
  const btn = byId("scan-btn");
  if (!btn) return;
  btn.disabled = on;
  btn.textContent = on ? "Running..." : "Run Full Scan";
}

function metric(k, v) {
  return `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}

function renderSetups(setups) {
  const list = byId("setup-list");
  if (!list) return;
  if (!setups || setups.length === 0) {
    list.innerHTML = '<div class="empty">No setups passed strict filters.</div>';
    setText("setup-count", "0");
    setText("setup-hint", "No filtered candidates");
    return;
  }

  setText("setup-count", String(setups.length));
  setText("setup-hint", "Qualified by trend, pullback, volume, RS, risk-reward");

  const tpl = byId("setup-item-template");
  list.innerHTML = "";
  setups.forEach((s) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".ticker").textContent = s.ticker;
    node.querySelector(".meta").textContent = `${s.sector} | ${s.setupType}`;
    node.querySelector(".score").textContent = `Conf ${s.confidenceScore}/10`;
    node.querySelector(".metrics").innerHTML =
      metric("Entry", fmtRs(s.buyZone)) +
      metric("Target", `${fmtRs(s.target)} (${s.targetPct}%)`) +
      metric("Stop", `${fmtRs(s.stopLoss)} (${s.slPct}%)`);
    node.querySelector(".trigger").textContent = `${s.entryTrigger} | RR ${s.riskReward}:1 | ${s.newsSummary || "News clear"}`;

    node.querySelector(".accept-btn").addEventListener("click", () => acceptTrade(s));
    node.querySelector(".execute-btn").addEventListener("click", () => executeTrade(s.ticker));
    list.appendChild(node);
  });
}

function renderTrades(trades) {
  const list = byId("trade-list");
  if (!list) return;
  if (!trades || trades.length === 0) {
    list.innerHTML = '<div class="empty">No active trades.</div>';
    return;
  }

  const tpl = byId("trade-item-template");
  list.innerHTML = "";
  trades.forEach((t) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".ticker").textContent = t.ticker;
    node.querySelector(".meta").textContent = `Status: ${t.status || "active"} ${t.exitReason ? "| " + t.exitReason : ""}`;
    node.querySelector(".score").textContent = `PnL ${fmtPct(t.pnlPct)}`;
    node.querySelector(".metrics").innerHTML =
      metric("Entry", fmtRs(t.entryPrice)) +
      metric("LTP", fmtRs(t.currentPrice)) +
      metric("SL", fmtRs(t.stopLoss));
    node.querySelector(".trigger").textContent = `Target ${fmtRs(t.target)} | Break-even ${t.breakEvenSet ? "ON" : "OFF"}${t.trailReference ? " | EMA20 " + t.trailReference : ""}`;

    node.querySelector(".refresh-one-btn").addEventListener("click", refreshTrades);
    node.querySelector(".remove-btn").addEventListener("click", () => removeTrade(t.ticker));
    list.appendChild(node);
  });
}

function renderMarket(status, timestamp) {
  if (!status) return;
  setText("nifty-val", fmtPct(status.niftyChange));
  setText("vix-val", fmtPct(status.vixChange));
  setText("nifty-hint", status.niftyChange >= 0 ? "Index breadth supportive" : "Index weakness detected");
  setText("vix-hint", status.vixChange > 10 ? "Volatility spike: reduce size" : "Volatility stable");

  if (!status.safeToTrade) {
    setText("safety-val", "HALT");
    setText("safety-hint", status.warning || "Market safety protocol blocked scans");
  } else if (status.vixChange > 10) {
    setText("safety-val", "CAUTION");
    setText("safety-hint", status.warning || "Reduce position size");
  } else {
    setText("safety-val", "CLEAR");
    setText("safety-hint", status.warning || "Normal execution allowed");
  }

  if (timestamp) {
    const d = new Date(timestamp);
    setText("last-scan", d.toLocaleString("en-IN"));
  }
}

async function fetchJson(path, options) {
  const res = await fetch(`${API}${path}`, options);
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || `Request failed for ${path}`);
  }
  return json.data;
}

async function loadBrokerStatus() {
  try {
    state.broker = await fetchJson("/api/broker/status");
    updateBrokerUi();
    appendLog(`Broker mode ${state.broker.provider.toUpperCase()} (${state.broker.live ? "live" : "paper"})`, state.broker.live ? "green" : "amber");
  } catch (err) {
    appendLog(`Broker status unavailable: ${err.message}`, "red");
  }
}

async function loadLastSnapshot() {
  try {
    const data = await fetchJson("/api/last");
    state.lastScanData = data;
    renderMarket(data.marketStatus, data.timestamp);
    renderSetups(data.setups || []);
    renderTrades(data.activeTrades || []);
    appendLog("Loaded last scan snapshot from server cache", "blue");
  } catch {
    appendLog("No previous scan snapshot available", "amber");
  }
}

async function runScan() {
  setScanBusy(true);
  appendLog("Starting full scanner cycle...", "blue");
  try {
    const data = await fetchJson("/api/scan");
    state.lastScanData = data;
    renderMarket(data.marketStatus, data.timestamp);
    renderSetups(data.setups || []);
    renderTrades(data.activeTrades || []);
    appendLog(`Scan complete: ${data.setups?.length || 0} setups, ${data.activeTrades?.length || 0} active trades`, "green");
  } catch (err) {
    appendLog(`Scan failed: ${err.message}`, "red");
  } finally {
    setScanBusy(false);
  }
}

async function refreshTrades() {
  appendLog("Refreshing active trades...", "blue");
  try {
    const data = await fetchJson("/api/watch", { method: "POST" });
    renderTrades(data || []);
    appendLog("Trade monitor updated", "green");
  } catch (err) {
    appendLog(`Trade refresh failed: ${err.message}`, "red");
  }
}

async function acceptTrade(setup) {
  appendLog(`Adding ${setup.ticker} to active trade list`, "blue");
  try {
    await fetchJson("/api/trades/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setup),
    });
    appendLog(`Trade added: ${setup.ticker}`, "green");
    await refreshTrades();
  } catch (err) {
    appendLog(`Add trade failed (${setup.ticker}): ${err.message}`, "red");
  }
}

async function executeTrade(ticker) {
  appendLog(`Submitting GTT for ${ticker}`, "blue");
  try {
    const data = await fetchJson(`/api/execute/${ticker}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1 }),
    });
    appendLog(`Execution response ${ticker}: ${data.status} (${data.orderId})`, data.status === "accepted" ? "green" : "amber");
    await refreshTrades();
  } catch (err) {
    appendLog(`Execution failed (${ticker}): ${err.message}`, "red");
  }
}

async function removeTrade(ticker) {
  appendLog(`Closing trade ${ticker}`, "amber");
  try {
    await fetchJson(`/api/trades/${ticker}`, { method: "DELETE" });
    appendLog(`Trade closed: ${ticker}`, "green");
    await refreshTrades();
  } catch (err) {
    appendLog(`Close trade failed (${ticker}): ${err.message}`, "red");
  }
}

function loopTick() {
  runScan().then(refreshTrades);
}

function toggleAuto() {
  state.auto = !state.auto;
  if (state.auto) {
    state.timer = setInterval(loopTick, AUTO_INTERVAL_MS);
    appendLog("Auto loop enabled (scan + watch every 120s)", "green");
  } else {
    clearInterval(state.timer);
    state.timer = null;
    appendLog("Auto loop disabled", "amber");
  }
  setAutoUi();
}

window.runScan = runScan;
window.refreshTrades = refreshTrades;
window.toggleAuto = toggleAuto;

window.addEventListener("DOMContentLoaded", async () => {
  updateClock();
  setInterval(updateClock, 1000);
  setAutoUi();
  appendLog("Agent UI booting...", "blue");

  await loadBrokerStatus();
  await loadLastSnapshot();
  await refreshTrades();
});
