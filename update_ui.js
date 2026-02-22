const fs = require('fs');

let css = fs.readFileSync('frontend/src/index.css', 'utf-8');

const newRoot = `/* ── Google Fonts ─────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* ── CSS Variables ────────────────────────────────────────── */
:root {
    --bg: #09090b;
    --bg2: #121217;
    --bg3: #18181f;
    --bg4: #22222d;
    --border: #272732;
    --border-hl: rgba(255, 255, 255, 0.08);
    --text: #ffffff;
    --text2: #a1a1aa;
    --text3: #71717a;
    --green: #10b981;
    --green-glow: rgba(16, 185, 129, 0.4);
    --red: #ef4444;
    --red-glow: rgba(239, 68, 68, 0.4);
    --blue: #3b82f6;
    --blue-glow: rgba(59, 130, 246, 0.4);
    --amber: #f59e0b;
    --cyan: #06b6d4;
    --purple: #8b5cf6;
    --accent: #3b82f6;
    --shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    --glow-shadow: 0 0 20px rgba(59, 130, 246, 0.15);
    --radius: 16px;
    --radius-sm: 10px;
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    background: var(--bg);
    background-image: 
        radial-gradient(circle at 15% 50%, rgba(59, 130, 246, 0.04), transparent 30%),
        radial-gradient(circle at 85% 30%, rgba(139, 92, 246, 0.04), transparent 30%);
    color: var(--text);
    min-height: 100vh;
}
`;

css = css.replace(/\/\* ── Google Fonts [\s\S]*?min-height: 100vh;\r?\n\}/m, newRoot);


const newLogo = `.logo-title {
    font-family: 'Outfit', sans-serif;
    font-size: 1.5rem;
    font-weight: 900;
    background: linear-gradient(135deg, #ffffff, #94a3b8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1.2;
    letter-spacing: -0.02em;
}`;

css = css.replace(/\.logo-title\s*\{[\s\S]*?\}/, newLogo);

const newDashHeader = `.dash-header {
    background: rgba(18, 18, 23, 0.7);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border-hl);
    position: sticky;
    top: 0;
    z-index: 100;
}`;

css = css.replace(/\.dash-header\s*\{[\s\S]*?\}/, newDashHeader);

const newBtnPrimary = `.btn-primary {
    background: linear-gradient(135deg, #2563eb, #4f46e5);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 12px rgba(0, 0, 0, 0.4);
    padding: 10px 22px;
    border-radius: var(--radius-sm);
    font-family: 'Outfit', sans-serif;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 6px 16px rgba(37, 99, 235, 0.4);
    transform: translateY(-2px);
}`;

css = css.replace(/\.btn-primary\s*\{[\s\S]*?\.btn-primary:disabled/m, newBtnPrimary + "\n\n.btn-primary:disabled");

const newCard = `.trade-card {
    background: linear-gradient(180deg, rgba(24, 24, 31, 0.6) 0%, rgba(18, 18, 23, 0.9) 100%);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border-hl);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    border-radius: var(--radius);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    animation: fadeUp 0.4s ease both;
}

.trade-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow), var(--glow-shadow);
    border-color: rgba(255, 255, 255, 0.15);
}`;

css = css.replace(/\.trade-card\s*\{[\s\S]*?\.trade-card:hover\s*\{[\s\S]*?\}/, newCard);

const newCardTicker = `.card-ticker {
    font-family: 'Outfit', sans-serif;
    font-size: 1.35rem;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.02em;
}`;

css = css.replace(/\.card-ticker\s*\{[\s\S]*?\}/, newCardTicker);

const newBtnAccept = `.btn-accept {
    background: linear-gradient(135deg, #059669, #10b981);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 8px rgba(0, 0, 0, 0.2);
    padding: 8px 18px;
    border-radius: var(--radius-sm);
    font-family: 'Outfit', sans-serif;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-accept:hover {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 12px rgba(16, 185, 129, 0.4);
    transform: translateY(-1px);
}`;

css = css.replace(/\.btn-accept\s*\{[\s\S]*?\.btn-accept:hover\s*\{[\s\S]*?\}/, newBtnAccept);

fs.writeFileSync('frontend/src/index.css', css);
console.log('Premium UI Upgrade Script Executed');
