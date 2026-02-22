/* =====================================================
   app.js — Dashboard logic (Fetch API, Render)
   ===================================================== */

const API = '';  // Same origin

// ——————————————————————————————————————————
// THEME TOGGLE
// ——————————————————————————————————————————
function syncToggleUI(theme) {
  const emoji = document.getElementById('theme-emoji');
  const label = document.getElementById('theme-label');
  if (!emoji || !label) return;
  if (theme === 'dark') {
    emoji.textContent = '☀️';
    label.textContent = 'Light';
  } else {
    emoji.textContent = '🌙';
    label.textContent = 'Dark';
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('swingEdgeTheme', next);
  syncToggleUI(next);
}

// ——————————————————————————————————————————
// UTILITY
// ——————————————————————————————————————————
function fmt(n) { return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pct(n) { return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'; }
function cls(n) { return n >= 0 ? 'positive' : 'negative'; }
function ago(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  return Math.floor(diff / 3600) + 'h ago';
}

function showSpinner(msg = 'Scanning Nifty 100…', sub = 'Fetching live data from Yahoo Finance…') {
  let el = document.getElementById('spinner-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'spinner-overlay';
    el.className = 'spinner-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="spinner"></div>
    <div class="spinner-text">${msg}</div>
    <div class="spinner-sub">${sub}</div>
  `;
  el.style.display = 'flex';
}

function hideSpinner() {
  const el = document.getElementById('spinner-overlay');
  if (el) el.style.display = 'none';
}

// ——————————————————————————————————————————
// RENDER MARKET BAR
// ——————————————————————————————————————————
function renderMarketBar(data) {
  const { marketStatus, timestamp } = data;
  const bar = document.getElementById('market-bar');
  bar.style.display = 'block';

  const nc = marketStatus.niftyChange;
  const vc = marketStatus.vixChange;

  document.getElementById('nifty-change').className = 'market-value ' + cls(nc);
  document.getElementById('nifty-change').textContent = pct(nc);

  document.getElementById('vix-change').className = 'market-value ' + (vc > 0 ? 'negative' : 'positive');
  document.getElementById('vix-change').textContent = pct(vc);

  document.getElementById('last-scan-time').textContent = ago(timestamp);
  document.getElementById('last-scan-time').className = 'market-value neutral';

  // Market warning bar
  const warnEl = document.getElementById('market-warning-text');
  if (!marketStatus.safeToTrade) {
    warnEl.style.background = 'rgba(239,68,68,0.1)';
    warnEl.style.color = '#ef4444';
    warnEl.textContent = marketStatus.warning;
  } else if (marketStatus.vixChange > 10) {
    warnEl.style.background = 'rgba(245,158,11,0.1)';
    warnEl.style.color = '#f59e0b';
    warnEl.textContent = marketStatus.warning;
  } else {
    warnEl.style.background = 'rgba(16,185,129,0.06)';
    warnEl.style.color = '#10b981';
    warnEl.textContent = marketStatus.warning;
  }

  // Header badge
  const badge = document.getElementById('market-status-badge');
  const badgeText = document.getElementById('market-status-text');
  if (!marketStatus.safeToTrade) {
    badge.className = 'status-badge status-danger';
    badgeText.textContent = 'Market At Risk';
  } else if (marketStatus.vixChange > 10) {
    badge.className = 'status-badge status-warn';
    badgeText.textContent = 'Caution Mode';
  } else {
    badge.className = 'status-badge status-safe';
    badgeText.textContent = 'Market Healthy';
  }
}

// ——————————————————————————————————————————
// RENDER KILL SWITCH
// ——————————————————————————————————————————
function renderKillSwitch(marketStatus) {
  const ks = document.getElementById('kill-switch');
  if (!marketStatus.safeToTrade) {
    ks.style.display = 'flex';
    document.getElementById('kill-message').textContent = marketStatus.warning;
  } else {
    ks.style.display = 'none';
  }
}

// ——————————————————————————————————————————
// RENDER SETUP CARDS
// ——————————————————————————————————————————
function setupTypeBadge(type) {
  if (type === 'Pullback Continuation') return `<span class="setup-type-badge badge-pull">📉 Pullback</span>`;
  if (type === 'Volatility Contraction (VCP)') return `<span class="setup-type-badge badge-vcp">🌀 VCP</span>`;
  if (type === 'Breakout Base') return `<span class="setup-type-badge badge-break">🚀 Breakout Base</span>`;
  return '';
}

function confidenceClass(score) {
  if (score >= 7) return 'bar-high';
  if (score >= 5) return 'bar-medium';
  return 'bar-low';
}

function renderSetups(setups) {
  const section = document.getElementById('setups-section');
  const grid = document.getElementById('setups-grid');
  const count = document.getElementById('setups-count');

  document.getElementById('empty-state').style.display = 'none';

  if (!setups || setups.length === 0) {
    section.style.display = 'block';
    grid.innerHTML = `<div class="no-trades">No setups found matching all filters. Market may need more pullback time.</div>`;
    count.textContent = '0 Found';
    return;
  }

  section.style.display = 'block';
  count.textContent = setups.length + ' Found';

  grid.innerHTML = setups.map((s, i) => `
    <div class="trade-card" id="card-${s.ticker}" style="animation-delay:${i * 0.1}s">
      <div class="card-header">
        <div class="card-ticker-group">
          <div class="card-ticker">${s.ticker}</div>
          <div class="card-sector">${s.sector}</div>
          ${setupTypeBadge(s.setupType)}
        </div>
        <div class="card-header-right">
          <div class="card-ltp">${fmt(s.ltp)}</div>
          <div class="card-rank">Rank #${s.momentumRank} by Momentum</div>
          <span class="fund-grade-badge" id="grade-${s.ticker}" title="Loading fundamental grade…">⏳</span>
        </div>
      </div>
      <div class="card-body">
        <div class="card-metrics">
          <div class="metric-box">
            <div class="metric-label">Buy Zone</div>
            <div class="metric-value blue">${fmt(s.buyZone)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Target (+${s.targetPct}%)</div>
            <div class="metric-value green">${fmt(s.target)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Stop Loss (-${s.slPct}%)</div>
            <div class="metric-value red">${fmt(s.stopLoss)}</div>
          </div>
        </div>
        <div class="card-entry">
          <div class="entry-label">⚡ Entry Trigger</div>
          <div class="entry-text">${s.entryTrigger}</div>
        </div>
        <div class="card-info-row">
          <div class="info-item">
            <div class="info-label">Trend Status</div>
            <div class="info-value">${s.trendStatus}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Volume Spike</div>
            <div class="info-value">${s.volumeSpike}</div>
          </div>
        </div>
        <div class="card-info-row">
          <div class="info-item">
            <div class="info-label">Hit Probability</div>
            <div class="info-value ${s.volatilityHitProb >= 60 ? 'green' : 'amber'}">${s.volatilityHitProb}% (8% target)</div>
          </div>
          <div class="info-item">
            <div class="info-label">Setup Classification</div>
            <div class="info-value">${s.setupType}</div>
          </div>
        </div>
        <div class="confidence-bar-wrap">
          <div class="confidence-bar-top">
            <span class="confidence-label">Confidence Score</span>
            <span class="confidence-score ${s.confidenceScore >= 7 ? 'green' : s.confidenceScore >= 5 ? 'amber' : 'red'}">${s.confidenceScore}/10</span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill ${confidenceClass(s.confidenceScore)}" style="width:${s.confidenceScore * 10}%"></div>
          </div>
        </div>
      </div>
      <div class="card-footer">
        <div class="catalyst-text">💡 ${s.catalyst}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
          <div class="rr-badge">RR ${s.riskReward}:1</div>
          <a href="/screener.html#${s.ticker}" class="btn-analysis">📊 Analysis</a>
          <button class="btn-green" onclick="acceptTrade(${JSON.stringify(s).replace(/"/g, '&quot;')})">✅ Accept</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ——————————————————————————————————————————
// FUNDAMENTAL GRADE BADGES (async background)
// ——————————————————————————————————————————
async function loadFundamentalBadges(setups) {
  const gradeColors = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#ef4444', '—': '#64748b' };
  const gradeLabels = { A: 'Fundamentally Strong', B: 'Good Fundamentals', C: 'Average', D: 'Weak Fundamentals' };

  // Fetch all grades in parallel
  const results = await Promise.allSettled(
    setups.map(s => fetch(`/api/screener/grade/${s.ticker}`).then(r => r.json()))
  );

  results.forEach((res, i) => {
    const ticker = setups[i].ticker;
    const el = document.getElementById(`grade-${ticker}`);
    if (!el) return;

    if (res.status === 'fulfilled' && res.value?.success) {
      const g = res.value.data;
      const color = gradeColors[g.grade] ?? '#64748b';
      el.innerHTML = `<span style="background:${color}20;color:${color};border:1px solid ${color}40;padding:2px 8px;border-radius:99px;font-size:0.68rem;font-weight:800;cursor:default" title="${g.summary}">Grade ${g.grade}</span>`;
    } else {
      el.textContent = '';
    }
  });
}

// ——————————————————————————————————————————
// RENDER ACTIVE TRADES
// ——————————————————————————————————————————
function renderTrades(trades) {
  const section = document.getElementById('trades-section');
  const grid = document.getElementById('trades-grid');

  if (!trades || trades.length === 0) {
    section.style.display = 'none';
    updateTradeHealth([]);
    return;
  }

  section.style.display = 'block';

  // ── Portfolio P&L Summary ──
  const avgPnl = (trades.reduce((s, t) => s + (t.pnlPct || 0), 0) / trades.length).toFixed(2);
  const winners = trades.filter(t => t.pnlPct >= 0).length;
  const exits = trades.filter(t => t.status === 'exit_signal').length;
  const pnlClr = avgPnl >= 0 ? 'pnl-pos' : 'pnl-neg';

  const summaryBar = `
    <div class="trades-summary-bar">
      <div class="trades-summary-item">
        <div class="ts-label">Open Positions</div>
        <div class="ts-val">${trades.length}</div>
      </div>
      <div class="trades-summary-item">
        <div class="ts-label">Avg P&L</div>
        <div class="ts-val ${pnlClr}">${avgPnl >= 0 ? '+' : ''}${avgPnl}%</div>
      </div>
      <div class="trades-summary-item">
        <div class="ts-label">In Profit</div>
        <div class="ts-val green">${winners} / ${trades.length}</div>
      </div>
      <div class="trades-summary-item">
        <div class="ts-label">Exit Signals</div>
        <div class="ts-val ${exits > 0 ? 'red' : 'green'}">${exits > 0 ? '🚨 ' + exits : '✅ None'}</div>
      </div>
    </div>`;

  // ── Individual Trade Cards ──
  const cards = trades.map(t => {
    const isExit = t.status === 'exit_signal';

    // Days in trade
    const daysIn = t.entryDate
      ? Math.floor((Date.now() - new Date(t.entryDate)) / 86400000)
      : '—';

    // Progress toward target (0–100%)
    const range = t.target - t.entryPrice;
    const moved = (t.currentPrice || t.entryPrice) - t.entryPrice;
    const progress = range > 0 ? Math.min(100, Math.max(0, (moved / range) * 100)).toFixed(0) : 0;

    // SL distance  
    const slDistPct = (((t.currentPrice || t.entryPrice) - t.stopLoss) / t.entryPrice * 100).toFixed(1);

    // Copy order text for Groww
    const orderText = `${t.ticker} | BUY | Entry: ${t.entryPrice} | SL: ${t.stopLoss} | Target: ${t.target}`;

    return `
    <div class="active-card ${isExit ? 'active-card-exit' : ''}">
      <!-- Card Header -->
      <div class="active-header">
        <div class="active-ticker-group">
          <div class="active-ticker">${t.ticker}</div>
          <div class="active-days">📅 Day ${daysIn}</div>
        </div>
        <div class="active-header-right">
          <div class="active-pnl ${t.pnlPct >= 0 ? 'pnl-pos' : 'pnl-neg'}">${pct(t.pnlPct)}</div>
          ${isExit ? '<div class="active-exit-flag">🚨 EXIT</div>' : '<div class="active-status-ok">✅ Active</div>'}
        </div>
      </div>

      <!-- Exit reason -->
      ${isExit && t.exitReason ? `<div class="active-exit-reason">⚠️ ${t.exitReason}</div>` : ''}

      <!-- Progress bar: Entry → Target -->
      <div class="active-progress-label">
        <span>Entry ₹${t.entryPrice.toFixed(0)}</span>
        <span style="color:var(--accent-blue);font-weight:700">Now ₹${(t.currentPrice || t.entryPrice).toFixed(0)} (${progress}% to target)</span>
        <span>Target ₹${t.target.toFixed(0)}</span>
      </div>
      <div class="active-progress-bg">
        <div class="active-progress-fill ${isExit ? 'active-progress-red' : 'active-progress-green'}"
             style="width:${progress}%"></div>
      </div>

      <!-- Metrics Grid -->
      <div class="active-metrics">
        <div class="active-metric">
          <div class="active-metric-label">Entry</div>
          <div class="active-metric-val cyan">${fmt(t.entryPrice)}</div>
        </div>
        <div class="active-metric">
          <div class="active-metric-label">Live Price</div>
          <div class="active-metric-val">${fmt(t.currentPrice)}</div>
        </div>
        <div class="active-metric">
          <div class="active-metric-label">Stop Loss</div>
          <div class="active-metric-val red">${fmt(t.stopLoss)}</div>
        </div>
        <div class="active-metric">
          <div class="active-metric-label">Buffer to SL</div>
          <div class="active-metric-val ${parseFloat(slDistPct) < 1.5 ? 'red' : 'amber'}">${slDistPct}%</div>
        </div>
      </div>

      <!-- Status badges -->
      <div class="active-badges-row">
        ${t.breakEvenSet ? '<span class="trade-be-badge">🛡️ Break-Even SL</span>' : ''}
        ${t.trailReference ? `<span class="trade-trail-badge">📉 Trailing: 20-EMA ₹${t.trailReference}</span>` : ''}
      </div>

      <!-- Action buttons -->
      <div class="active-actions">
        <button class="copy-order-btn" onclick="copyOrder('${orderText}')" title="Copy for Groww/broker">📋 Copy Order</button>
        <button class="remove-btn" onclick="removeTrade('${t.ticker}')">❌ Close Trade</button>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = summaryBar + '<div class="active-cards-grid">' + cards + '</div>';
  updateTradeHealth(trades);
}

function copyOrder(text) {
  navigator.clipboard.writeText(text).then(() => {
    // Show brief toast
    let toast = document.getElementById('copy-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'copy-toast';
      toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:10px 20px;border-radius:99px;font-size:0.82rem;font-weight:700;z-index:9999;opacity:0;transition:opacity 0.3s';
      document.body.appendChild(toast);
    }
    toast.textContent = '✅ Order details copied to clipboard!';
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }).catch(() => prompt('Copy this to Groww:', text));
}

// ——————————————————————————————————————————
// API CALLS
// ——————————————————————————————————————————
async function runScan() {
  const btn = document.getElementById('scan-btn');
  btn.disabled = true;
  document.getElementById('scan-btn-text').textContent = '⏳ Scanning…';
  showSpinner('Scanning Nifty 100 Stocks…', 'Fetching 200-day OHLCV data. This may take 30–90 seconds…');

  try {
    const res = await fetch(`${API}/api/scan`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    const data = json.data;
    renderMarketBar(data);
    renderKillSwitch(data.marketStatus);
    renderSetups(data.setups);
    renderTrades(data.activeTrades);
    // Load fundamental grade badges in background (non-blocking)
    if (data.setups?.length) loadFundamentalBadges(data.setups);
    // Update Risk Command Center with live scan data
    refreshRCC(data.marketStatus, data.setups, data.activeTrades);
  } catch (err) {
    alert('Scan error: ' + err.message + '\n\nMake sure the backend server is running on port 3000.');
  } finally {
    hideSpinner();
    btn.disabled = false;
    document.getElementById('scan-btn-text').textContent = '🔍 Run Scanner';
  }
}

async function watchTrades() {
  showSpinner('Refreshing Trades…', 'Fetching latest prices for active positions…');
  try {
    const res = await fetch(`${API}/api/watch`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    renderTrades(json.data);
  } catch (err) {
    alert('Watch error: ' + err.message);
  } finally {
    hideSpinner();
  }
}

async function acceptTrade(setup) {
  try {
    const res = await fetch(`${API}/api/trades/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setup),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    alert(`✅ Trade accepted for ${setup.ticker}!\nEntry: ₹${setup.buyZone} | Target: ₹${setup.target} | SL: ₹${setup.stopLoss}`);
    // Refresh trades panel
    const tradesRes = await fetch(`${API}/api/trades`);
    const tradesJson = await tradesRes.json();
    if (tradesJson.success) renderTrades(tradesJson.data);
  } catch (err) {
    alert('Error adding trade: ' + err.message);
  }
}

async function removeTrade(ticker) {
  if (!confirm(`Close trade for ${ticker}?`)) return;
  try {
    await fetch(`${API}/api/trades/${ticker}`, { method: 'DELETE' });
    const res = await fetch(`${API}/api/trades`);
    const json = await res.json();
    renderTrades(json.data);
  } catch (err) {
    alert('Error removing trade: ' + err.message);
  }
}

// ——————————————————————————————————————————
// INIT — Load active trades on page load
// ——————————————————————————————————————————
window.addEventListener('DOMContentLoaded', async () => {
  // Sync toggle button to saved theme on load
  const savedTheme = localStorage.getItem('swingEdgeTheme') || 'dark';
  syncToggleUI(savedTheme);

  try {
    // Try to load last scan from cache
    const lastRes = await fetch(`${API}/api/last`);
    const lastJson = await lastRes.json();
    if (lastJson.success) {
      const data = lastJson.data;
      renderMarketBar(data);
      renderKillSwitch(data.marketStatus);
      renderSetups(data.setups);
    }

    // Load active trades
    const tradeRes = await fetch(`${API}/api/trades`);
    const tradeJson = await tradeRes.json();
    if (tradeJson.success) renderTrades(tradeJson.data);
  } catch {
    // Backend not ready yet — that's fine, empty state shows
  }

  // Load news on startup
  loadNewsEtMarkets();
  // Auto-refresh news every 10 minutes
  setInterval(loadNewsEtMarkets, 10 * 60 * 1000);
});

// ——————————————————————————————————————————
// RISK COMMAND CENTER
// ——————————————————————————————————————————

// Widget 1: Market Risk Meter
function updateRiskMeter(marketStatus) {
  if (!marketStatus) return;
  const nc = marketStatus.niftyChange;
  const vc = marketStatus.vixChange;

  document.getElementById('rcc-nifty').textContent = (nc >= 0 ? '+' : '') + nc.toFixed(2) + '%';
  document.getElementById('rcc-nifty').className = 'rcc-stat-val ' + (nc >= 0 ? 'green' : 'red');

  document.getElementById('rcc-vix').textContent = (vc >= 0 ? '+' : '') + vc.toFixed(2) + '%';
  document.getElementById('rcc-vix').className = 'rcc-stat-val ' + (vc > 0 ? 'red' : 'green');

  const badge = document.getElementById('rcc-risk-badge');
  const gauge = document.getElementById('rcc-risk-gauge');
  const action = document.getElementById('rcc-action');

  if (!marketStatus.safeToTrade) {
    badge.textContent = '🚨 HIGH RISK — HALT';
    badge.className = 'rcc-risk-badge rcc-risk-halt';
    gauge.style.cssText = 'width:95%;background:linear-gradient(90deg,#ef4444,#b91c1c)';
    action.textContent = 'No new trades. Review open positions.';
    action.className = 'rcc-stat-val red';
  } else if (vc > 10 || nc < -0.8) {
    badge.textContent = '⚠️ CAUTION MODE';
    badge.className = 'rcc-risk-badge rcc-risk-caution';
    gauge.style.cssText = 'width:55%;background:linear-gradient(90deg,#f59e0b,#d97706)';
    action.textContent = 'Reduce position size by 50%.';
    action.className = 'rcc-stat-val amber';
  } else {
    badge.textContent = '✅ SAFE TO TRADE';
    badge.className = 'rcc-risk-badge rcc-risk-safe';
    const pct = Math.max(5, Math.min(30, Math.abs(nc) * 10));
    gauge.style.cssText = `width:${pct}%;background:linear-gradient(90deg,#10b981,#059669)`;
    action.textContent = 'Normal position sizing. Execute plan.';
    action.className = 'rcc-stat-val green';
  }
}

// Widget 2: Protocol Checklist
function updateProtocolChecklist(marketStatus, setups) {
  const checks = [
    {
      label: 'Kill Switch',
      sub: marketStatus?.safeToTrade
        ? `✅ Nifty ${(marketStatus.niftyChange >= 0 ? '+' : '') + marketStatus.niftyChange?.toFixed(2)}% | VIX ${(marketStatus.vixChange >= 0 ? '+' : '') + marketStatus.vixChange?.toFixed(2)}% — market normal`
        : `❌ ${marketStatus?.warning ?? 'Market at risk'}`,
      pass: marketStatus?.safeToTrade ?? null,
    },
    {
      label: 'Profit Trailer Rule',
      sub: '+5% hit → SL auto-moves to break-even (check active trades)',
      pass: true, // rule is always active
    },
    {
      label: 'Trailing Exit Rule',
      sub: 'Exit if stock closes below 50-EMA — enforced on Watch',
      pass: true,
    },
    {
      label: 'Volume Quality',
      sub: setups?.length
        ? `${setups.filter(s => parseFloat(s.volumeSpike) >= 1.5).length} / ${setups.length} setups have ≥1.5× volume`
        : 'Run scanner to evaluate volume quality',
      pass: setups?.length
        ? setups.some(s => parseFloat(s.volumeSpike) >= 1.5)
        : null,
    },
    {
      label: 'Fundamental Grade',
      sub: setups?.length
        ? `Prefer Grade A/B — check badges on each setup card`
        : 'Fundamentals load after scan completes',
      pass: setups?.length ? true : null,
    },
  ];

  const statusIcon = p => p === true ? '✅' : p === false ? '❌' : '⏳';
  const statusClass = p => p === true ? 'rcc-check-pass' : p === false ? 'rcc-check-fail' : 'rcc-check-pending';

  document.getElementById('rcc-checklist').innerHTML = checks.map(c => `
    <div class="rcc-check-item ${statusClass(c.pass)}">
      <span class="rcc-check-icon">${statusIcon(c.pass)}</span>
      <div class="rcc-check-text">
        <div class="rcc-check-label">${c.label}</div>
        <div class="rcc-check-sub">${c.sub}</div>
      </div>
    </div>
  `).join('');
}

// Widget 3: Trade Health Monitor
function updateTradeHealth(trades) {
  const body = document.getElementById('rcc-health-body');
  if (!trades || !trades.length) {
    body.innerHTML = '<div class="rcc-no-trades">No active trades. Accept a setup to start monitoring.</div>';
    return;
  }
  body.innerHTML = trades.map(t => {
    const pnlClr = t.pnlPct >= 5 ? 'green' : t.pnlPct >= 0 ? 'amber' : 'red';
    const healthIcon = t.pnlPct >= 5 ? '🟢' : t.pnlPct >= 0 ? '🟡' : '🔴';
    const trailAlert = t.pnlPct >= 5 && !t.breakEvenSet ? '⚠️ Move SL to break-even!' : '';
    const exitAlert = t.status === 'exit_signal' ? '🚨 EXIT SIGNAL — Check 50-EMA' : '';
    const alert = exitAlert || trailAlert;
    const progressPct = Math.min(100, Math.max(0,
      ((t.currentPrice - t.entryPrice) / (t.target - t.entryPrice)) * 100
    )).toFixed(0);

    return `
      <div class="rcc-health-row">
        <div class="rcc-health-top">
          <span class="rcc-health-ticker">${healthIcon} ${t.ticker}</span>
          <span class="rcc-health-pnl ${pnlClr}">${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct?.toFixed(2)}%</span>
        </div>
        <div class="rcc-health-progress-bg">
          <div class="rcc-health-progress" style="width:${progressPct}%"></div>
        </div>
        <div class="rcc-health-meta">
          <span>Entry ₹${t.entryPrice.toFixed(0)}</span>
          <span class="rcc-health-now">Now ₹${t.currentPrice?.toFixed(0) ?? '—'}</span>
          <span>Target ₹${t.target.toFixed(0)}</span>
        </div>
        ${alert ? `<div class="rcc-health-alert">${alert}</div>` : ''}
        ${t.breakEvenSet ? '<div class="rcc-health-be">🛡️ Break-even SL active</div>' : ''}
      </div>`;
  }).join('');
}

// Widget 4: Live ET Markets News
async function loadNewsEtMarkets() {
  const el = document.getElementById('rcc-news-list');
  if (!el) return;
  try {
    const RSS_URL = 'https://economictimes.indiatimes.com/markets/stocks/rss.xml';
    const API_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}&count=6`;
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const items = json.items ?? [];
    if (!items.length) throw new Error('No items');

    const timeAgo = pub => {
      const s = Math.floor((Date.now() - new Date(pub)) / 1000);
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    };

    el.innerHTML = items.map(item => `
      <a class="rcc-news-item" href="${item.link}" target="_blank" rel="noopener">
        <div class="rcc-news-headline">${item.title}</div>
        <div class="rcc-news-time">${timeAgo(item.pubDate)}</div>
      </a>`).join('');
  } catch {
    el.innerHTML = '<div class="rcc-news-loading">Unable to load news — check network connection.</div>';
  }
}

// Master refresh — updates all 4 widgets
function refreshRCC(marketStatus, setups, trades) {
  if (marketStatus) updateRiskMeter(marketStatus);
  if (marketStatus || setups) updateProtocolChecklist(marketStatus, setups);
  if (trades !== undefined) updateTradeHealth(trades);
  loadNewsEtMarkets();
}

