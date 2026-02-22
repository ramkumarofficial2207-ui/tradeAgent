/* =====================================================
   screener.js — SwingEdge Stock Screener Frontend
   Independent product — no external source branding
   ===================================================== */

const API = '';
let allStocks = [];
let activeSector = 'All';
let currentTicker = null;

// ── Formatters ────────────────────────────────────────
const fmtINR = n => n == null || n === 0 ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n, dec = 2) => n == null ? '—' : Number(n).toFixed(dec);
const fmtPct = (n, showPlus = true) => n == null ? '—' : (showPlus && n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%';
const fmtCr = n => n == null || n === 0 ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtMcap = cr => {
    if (!cr) return '—';
    if (cr >= 1_00_000) return '₹' + (cr / 1_00_000).toFixed(1) + 'L Cr';
    if (cr >= 1_000) return '₹' + (cr / 1_000).toFixed(1) + 'K Cr';
    return '₹' + cr.toFixed(0) + ' Cr';
};
const fmtVol = n => {
    if (!n) return '—';
    if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
    return Number(n).toLocaleString('en-IN');
};
const pctAgo = iso => {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    return Math.floor(s / 3600) + 'h ago';
};
const clr = n => n == null ? '' : n >= 0 ? 'sc-green' : 'sc-red';

// ── Theme ─────────────────────────────────────────────
function toggleTheme() {
    const html = document.documentElement;
    const next = (html.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('swingEdgeTheme', next);
    document.getElementById('scThemeEmoji').textContent = next === 'dark' ? '☀️' : '🌙';
}

// ── Boot ──────────────────────────────────────────────
async function loadUniverse() {
    try {
        const res = await fetch(`${API}/api/screener/universe`);
        const json = await res.json();
        if (!json.success) throw new Error();
        allStocks = json.data;
        buildSectorTags();
        renderList(allStocks);
    } catch {
        document.getElementById('sc-stock-list').innerHTML =
            '<div class="sc-list-loading">⚠️ Server not reachable</div>';
    }
}

function buildSectorTags() {
    const sectors = ['All', ...new Set(allStocks.map(s => s.sector).filter(Boolean).sort())];
    document.getElementById('sc-sector-tabs').innerHTML = sectors.map(s =>
        `<button class="sc-sector-tag${s === 'All' ? ' active' : ''}" onclick="selectSector('${s}')">${s}</button>`
    ).join('');
}

function selectSector(sector) {
    activeSector = sector;
    document.querySelectorAll('.sc-sector-tag').forEach(el =>
        el.classList.toggle('active', el.textContent === sector)
    );
    filterStocks(document.getElementById('sc-search').value);
}

function filterStocks(query = '') {
    const q = query.toLowerCase().trim();
    renderList(allStocks.filter(s => {
        const ok1 = activeSector === 'All' || s.sector === activeSector;
        const ok2 = !q || s.ticker.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q);
        return ok1 && ok2;
    }));
}

function renderList(stocks) {
    const list = document.getElementById('sc-stock-list');
    if (!stocks.length) { list.innerHTML = '<div class="sc-list-loading">No stocks match.</div>'; return; }
    list.innerHTML = stocks.map(s => `
        <div class="sc-stock-row${s.ticker === currentTicker ? ' active' : ''}"
             id="row-${s.ticker}" onclick="loadStock('${s.ticker}')">
            <div class="sc-row-ticker">${s.ticker}</div>
            <div class="sc-row-sector">${s.sector}</div>
        </div>
    `).join('');
}

// ── Load & render stock ───────────────────────────────
let _retryTicker = null;

async function loadStock(ticker) {
    currentTicker = _retryTicker = ticker;
    document.querySelectorAll('.sc-stock-row').forEach(r =>
        r.classList.toggle('active', r.id === `row-${ticker}`)
    );
    setState('loading');
    try {
        const res = await fetch(`${API}/api/screener/stock/${ticker}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'No data');
        renderReport(json.data);
        setState('detail');
    } catch (err) {
        document.getElementById('sc-error-msg').textContent = `${ticker}: ${err.message}`;
        setState('error');
    }
}

function retryLoad() { if (_retryTicker) loadStock(_retryTicker); }

function setState(state) {
    const map = { welcome: 'block', loading: 'flex', detail: 'block', error: 'block' };
    ['welcome', 'loading', 'detail', 'error'].forEach(k => {
        const el = document.getElementById(`sc-${k}`);
        if (el) el.style.display = k === state ? (map[k]) : 'none';
    });
}

// ── Full report render ────────────────────────────────
function renderReport(d) {
    // Header
    document.getElementById('d-ticker-badge').textContent = `NSE: ${d.ticker}`;
    document.getElementById('d-sector').textContent = d.sector;
    document.getElementById('d-company-name').textContent = d.companyName;
    document.getElementById('d-price').textContent = fmtINR(d.currentPrice);
    document.getElementById('d-updated').textContent = `Data as of ${pctAgo(d.fetchedAt)}`;
    const chEl = document.getElementById('d-price-change');
    chEl.textContent = `${d.dayChange >= 0 ? '+' : ''}${fmtINR(d.dayChange)}  (${fmtPct(d.dayChangePct)}) today`;
    chEl.className = 'sc-price-change ' + clr(d.dayChangePct);

    // 52W range
    const lo = d.low52w, hi = d.high52w, cur = d.currentPrice;
    document.getElementById('d-52wl').textContent = fmtINR(lo);
    document.getElementById('d-52wh').textContent = fmtINR(hi);
    const pct = hi > lo ? Math.max(2, Math.min(98, ((cur - lo) / (hi - lo)) * 100)) : 50;
    document.getElementById('d-range-fill').style.width = pct + '%';
    document.getElementById('d-range-dot').style.left = pct + '%';

    // All sections
    renderValuation(d);
    renderTechnicals(d);
    renderQuarterly(d.quarterlyResults ?? []);
    renderAnnual(d.annualResults ?? []);
    renderSetupCard(d);
    renderMALevels(d);

    // Reset to first tab
    switchTab('valuation', document.querySelector('.sc-tab[data-tab="valuation"]'));
}

// ── Valuation & Quality grid ──────────────────────────
function renderValuation(d) {
    const items = [
        { label: 'Market Cap', val: fmtMcap(d.marketCapCr), sub: '', color: '' },
        { label: 'Stock P/E', val: fmtNum(d.peRatio, 1), sub: 'Trailing', color: d.peRatio > 50 ? 'sc-amber' : '' },
        { label: 'Industry P/E', val: fmtNum(d.industryPe, 1), sub: 'Sector avg', color: '' },
        { label: 'Price to Book', val: fmtNum(d.pbRatio, 2), sub: 'P/B Ratio', color: '' },
        { label: 'Dividend Yield', val: d.dividendYield ? fmtNum(d.dividendYield, 2) + '%' : '—', sub: 'Annual', color: d.dividendYield > 0 ? 'sc-green' : '' },
        { label: 'ROE', val: d.roe ? fmtNum(d.roe, 1) + '%' : '—', sub: 'Return on Equity', color: d.roe >= 15 ? 'sc-green' : d.roe > 0 ? '' : 'sc-red' },
        { label: 'ROCE', val: d.roce ? fmtNum(d.roce, 1) + '%' : '—', sub: 'Return on Capital', color: d.roce >= 15 ? 'sc-green' : '' },
        { label: 'Debt / Equity', val: fmtNum(d.debtToEquity, 2), sub: 'D/E Ratio', color: d.debtToEquity > 1 ? 'sc-red' : d.debtToEquity >= 0 ? 'sc-green' : '' },
        { label: 'Current Ratio', val: fmtNum(d.currentRatio, 2), sub: 'Liquidity', color: d.currentRatio >= 1.5 ? 'sc-green' : d.currentRatio >= 1 ? '' : 'sc-red' },
        { label: 'Book Value', val: d.bookValue ? '₹' + fmtNum(d.bookValue, 0) : '—', sub: 'Per share', color: '' },
        { label: 'EPS', val: d.eps ? '₹' + fmtNum(d.eps, 2) : '—', sub: 'Earnings/share', color: d.eps > 0 ? 'sc-green' : 'sc-red' },
        { label: 'Promoter Holding', val: d.promoterHolding ? fmtNum(d.promoterHolding, 1) + '%' : '—', sub: 'Latest disclosure', color: d.promoterHolding >= 50 ? 'sc-green' : d.promoterHolding >= 35 ? '' : 'sc-amber' },
    ];
    document.getElementById('d-valuation-grid').innerHTML = items.map(it => `
        <div class="sc-ratio-box">
            <div class="sc-ratio-label">${it.label}</div>
            <div class="sc-ratio-value ${it.color}">${it.val}</div>
            ${it.sub ? `<div class="sc-ratio-sub">${it.sub}</div>` : ''}
        </div>
    `).join('');
}

// ── Technical grid ────────────────────────────────────
function renderTechnicals(d) {
    const rsiClr = !d.rsi14 ? '' : d.rsi14 < 30 ? 'sc-red' : d.rsi14 <= 50 ? 'sc-green' : d.rsi14 <= 65 ? 'sc-blue' : 'sc-amber';
    const rsiLbl = !d.rsi14 ? '—' : d.rsi14 < 30 ? 'Oversold 🔴' : d.rsi14 <= 50 ? 'Pullback Zone 🟢' : d.rsi14 <= 65 ? 'Momentum 🔵' : 'Overbought 🟠';
    const volClr = !d.volumeRatio ? '' : d.volumeRatio >= 2 ? 'sc-green' : d.volumeRatio >= 1.2 ? 'sc-blue' : 'sc-red';

    const items = [
        {
            label: 'RSI (14)', val: fmtNum(d.rsi14, 1), sub: rsiLbl, color: rsiClr,
            bar: d.rsi14, barMax: 100
        },
        {
            label: '200 DMA', val: fmtINR(d.dma200),
            sub: d.aboveDma200
                ? `↑ ${Math.abs(d.distFromDma200Pct ?? 0).toFixed(1)}% above — Uptrend ✅`
                : `↓ ${Math.abs(d.distFromDma200Pct ?? 0).toFixed(1)}% below — Downtrend ❌`,
            color: d.aboveDma200 ? 'sc-green' : 'sc-red'
        },
        {
            label: '50 EMA', val: fmtINR(d.ema50),
            sub: d.aboveEma50 ? `↑ ${Math.abs(d.distFromEma50Pct ?? 0).toFixed(1)}% above` : `↓ ${Math.abs(d.distFromEma50Pct ?? 0).toFixed(1)}% below`,
            color: d.aboveEma50 ? 'sc-green' : 'sc-amber'
        },
        { label: '20 EMA', val: fmtINR(d.ema20), sub: 'Short-term MA', color: '' },
        {
            label: 'Volume Ratio', val: d.volumeRatio ? d.volumeRatio.toFixed(2) + '×' : '—',
            sub: (d.volumeRatio >= 2 ? 'High activity 🔥' : d.volumeRatio >= 1.2 ? 'Above avg' : 'Low activity'),
            color: volClr
        },
        { label: 'Avg Vol (20D)', val: fmtVol(d.avgVolume20d), sub: 'Daily avg shares', color: '' },
        { label: '3M Return', val: fmtPct(d.returns3m), sub: 'Absolute', color: clr(d.returns3m) },
        {
            label: 'vs Nifty 3M',
            val: d.returns3m != null && d.nifty3mReturn != null ? fmtPct(+(d.returns3m - d.nifty3mReturn).toFixed(2)) : '—',
            sub: d.outperformsNifty ? '✅ Outperforming Nifty' : '⚠️ Lagging Nifty',
            color: d.outperformsNifty ? 'sc-green' : 'sc-red'
        },
        { label: '1M Return', val: fmtPct(d.returns1m), sub: 'Short-term', color: clr(d.returns1m) },
    ];

    document.getElementById('d-tech-grid').innerHTML = items.map(it => `
        <div class="sc-ratio-box">
            <div class="sc-ratio-label">${it.label}</div>
            <div class="sc-ratio-value ${it.color}">${it.val}</div>
            <div class="sc-ratio-sub">${it.sub}</div>
            ${it.bar != null ? `<div class="sc-mini-progress-wrap"><div class="sc-mini-progress ${it.color}" style="width:${Math.min(100, (it.bar / it.barMax) * 100).toFixed(0)}%"></div></div>` : ''}
        </div>
    `).join('');
}

// ── MA Level Visualization ────────────────────────────
function renderMALevels(d) {
    const levels = [
        { label: '200 DMA', val: d.dma200, color: '#ef4444' },
        { label: '50 EMA', val: d.ema50, color: '#f59e0b' },
        { label: '20 EMA', val: d.ema20, color: '#3b82f6' },
        { label: 'Price', val: d.currentPrice, color: '#10b981', isPrice: true },
    ].filter(l => l.val > 0).sort((a, b) => a.val - b.val);

    const wrap = document.getElementById('d-ma-status');
    if (!levels.length) { wrap.innerHTML = ''; return; }
    const lo = levels[0].val, hi = levels[levels.length - 1].val, rng = hi - lo || 1;

    wrap.innerHTML = `
        <div class="sc-ma-title">Price vs Moving Averages</div>
        <div class="sc-ma-chart">
            ${levels.map(l => {
        const pct = ((l.val - lo) / rng) * 90 + 5;
        return `<div class="sc-ma-level" style="left:${pct.toFixed(1)}%">
                    <div class="sc-ma-dot" style="background:${l.color}${l.isPrice ? ';width:14px;height:14px' : ''}"></div>
                    <div class="sc-ma-lbl" style="color:${l.color}">${l.label}</div>
                    <div class="sc-ma-price">₹${Number(l.val).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>`;
    }).join('')}
            <div class="sc-ma-line"></div>
        </div>`;
}

// ── Quarterly table + mini charts ─────────────────────
function renderQuarterly(results) {
    const tbody = document.getElementById('quarterly-body');
    const nodata = document.getElementById('quarterly-nodata');
    const charts = document.getElementById('sc-mini-charts');
    if (!results.length) {
        tbody.innerHTML = '';
        nodata.style.display = 'block';
        if (charts) charts.innerHTML = '';
        return;
    }
    nodata.style.display = 'none';
    tbody.innerHTML = results.map((q, i) => `
        <tr>
            <td>${q.period}${i === 0 ? ' <span style="font-size:.65rem;color:var(--accent-blue);font-weight:700">Latest</span>' : ''}</td>
            <td class="num">${fmtCr(q.salesCr)}</td>
            <td class="num ${q.opmPct >= 15 ? 'sc-green' : q.opmPct >= 5 ? '' : 'sc-red'}">${q.opmPct != null ? fmtNum(q.opmPct, 1) + '%' : '—'}</td>
            <td class="num ${q.profitCr >= 0 ? 'sc-green' : 'sc-red'}">${fmtCr(q.profitCr)}</td>
        </tr>
    `).join('');

    // Mini bar charts
    if (!charts) return;
    const rev = [...results].reverse();
    const mkChart = (title, key, barClass) => {
        const vals = rev.map(r => r[key]).filter(v => v != null);
        if (!vals.length) return '';
        const mx = Math.max(...vals.map(Math.abs), 1);
        const bars = rev.map(r => {
            const v = r[key] ?? 0;
            const h = Math.max(4, (Math.abs(v) / mx) * 72);
            const bc = key === 'profitCr' ? (v >= 0 ? 'sc-bar-profit' : 'sc-bar-neg') : barClass;
            return `<div class="sc-bar-wrap">
                <div class="sc-bar-val">${Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'K' : v.toFixed(0)}</div>
                <div class="sc-bar ${bc}" style="height:${h}px"></div>
                <div class="sc-bar-label">${r.period}</div>
            </div>`;
        }).join('');
        return `<div class="sc-mini-chart"><div class="sc-mini-chart-title">${title} (₹Cr)</div><div class="sc-bars">${bars}</div></div>`;
    };
    charts.innerHTML = mkChart('Quarterly Sales', 'salesCr', 'sc-bar-sales') + mkChart('Quarterly Net Profit', 'profitCr', 'sc-bar-profit');
}

// ── Annual P&L table ──────────────────────────────────
function renderAnnual(results) {
    const tbody = document.getElementById('annual-body');
    const nodata = document.getElementById('annual-nodata');
    if (!results.length) { tbody.innerHTML = ''; nodata.style.display = 'block'; return; }
    nodata.style.display = 'none';
    tbody.innerHTML = results.map((a, i) => `
        <tr>
            <td>${a.year}${i === 0 ? ' <span style="font-size:.65rem;color:var(--accent-blue);font-weight:700">Latest</span>' : ''}</td>
            <td class="num">${fmtCr(a.salesCr)}</td>
            <td class="num ${a.profitCr >= 0 ? 'sc-green' : 'sc-red'}">${fmtCr(a.profitCr)}</td>
            <td class="num">${a.epsDiluted != null ? '₹' + fmtNum(a.epsDiluted, 1) : '—'}</td>
        </tr>
    `).join('');
}

// ── Trade Setup card ──────────────────────────────────
function renderSetupCard(d) {
    const card = document.getElementById('d-setup-card');
    if (!d.hasSetup || !d.buyZone) {
        card.innerHTML = `
            <div class="sc-no-setup">
                <div class="sc-no-setup-icon">🔍</div>
                <div class="sc-no-setup-title">No Active Setup Detected</div>
                <div class="sc-no-setup-sub">This stock hasn't qualified in the latest scanner run.<br>
                    Return to <a href="/" class="sc-link">the scanner</a> to run a fresh scan.</div>
            </div>`;
        return;
    }
    const rrClr = d.riskReward >= 2 ? 'sc-green' : d.riskReward >= 1.5 ? 'sc-blue' : 'sc-amber';
    const tgtPct = d.target && d.buyZone ? (((d.target - d.buyZone) / d.buyZone) * 100).toFixed(1) : null;
    const slPct = d.stopLoss && d.buyZone ? (((d.buyZone - d.stopLoss) / d.buyZone) * 100).toFixed(1) : null;
    card.innerHTML = `
        <div class="sc-setup-header">
            <div class="sc-setup-type-badge">${d.setupType ?? 'Swing Setup'}</div>
            <div class="sc-setup-confidence">${'★'.repeat(Math.min(10, Math.round(d.confidenceScore ?? 5)))} ${d.confidenceScore}/10</div>
        </div>
        <div class="sc-setup-levels">
            <div class="sc-level-item sc-level-entry">
                <div class="sc-level-label">Buy Zone</div>
                <div class="sc-level-val">${fmtINR(d.buyZone)}</div>
                <div class="sc-level-sub">${d.currentPrice < d.buyZone ? '▲ Not triggered yet' : '✅ In buy range'}</div>
            </div>
            <div class="sc-level-item sc-level-target">
                <div class="sc-level-label">Target</div>
                <div class="sc-level-val">${fmtINR(d.target)}</div>
                <div class="sc-level-sub">${tgtPct ? '+' + tgtPct + '%' : ''}</div>
            </div>
            <div class="sc-level-item sc-level-sl">
                <div class="sc-level-label">Stop Loss</div>
                <div class="sc-level-val">${fmtINR(d.stopLoss)}</div>
                <div class="sc-level-sub">${slPct ? '-' + slPct + '%' : ''}</div>
            </div>
            <div class="sc-level-item">
                <div class="sc-level-label">Risk : Reward</div>
                <div class="sc-level-val ${rrClr}">${fmtNum(d.riskReward, 2)} : 1</div>
                <div class="sc-level-sub">${d.riskReward >= 2 ? 'Excellent ✅' : d.riskReward >= 1.5 ? 'Good' : 'Marginal'}</div>
            </div>
        </div>`;
}

// ── Tab switching ─────────────────────────────────────
function switchTab(tabId, el) {
    document.querySelectorAll('.sc-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sc-tab-content').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    const content = document.getElementById(`tab-${tabId}`);
    if (content) content.classList.add('active');
}

// ── Init ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const theme = localStorage.getItem('swingEdgeTheme') || 'dark';
    document.getElementById('scThemeEmoji').textContent = theme === 'dark' ? '☀️' : '🌙';
    loadUniverse().then(() => {
        // Deep-link: /screener.html#RELIANCE — auto-load that stock
        const hash = window.location.hash?.slice(1).toUpperCase();
        if (hash) loadStock(hash);
    });
});
