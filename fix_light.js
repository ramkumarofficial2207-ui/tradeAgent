const fs = require('fs');
let css = fs.readFileSync('frontend/src/index.css', 'utf-8');

const rootVars = `    --shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    --glow-shadow: 0 0 20px rgba(59, 130, 246, 0.15);
    --header-bg: rgba(18, 18, 23, 0.7);
    --card-bg: linear-gradient(180deg, rgba(24, 24, 31, 0.6) 0%, rgba(18, 18, 23, 0.9) 100%);
    --card-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    --card-hover-border: rgba(255, 255, 255, 0.15);
    --logo-fill: linear-gradient(135deg, #ffffff, #94a3b8);
    --btn-primary-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 12px rgba(0, 0, 0, 0.4);
    --btn-primary-hover: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 6px 16px rgba(37, 99, 235, 0.4);
    --btn-accept-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 8px rgba(0, 0, 0, 0.2);
    --btn-accept-hover: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 12px rgba(16, 185, 129, 0.4);`;
css = css.replace(/    --shadow: 0 8px 32px rgba\(0, 0, 0, 0\.5\);\r?\n    --glow-shadow: 0 0 20px rgba\(59, 130, 246, 0\.15\);/, rootVars);


const lightVars = `    --shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    --glow-shadow: 0 0 15px rgba(37, 99, 235, 0.1);
    --header-bg: rgba(255, 255, 255, 0.85);
    --card-bg: #ffffff;
    --card-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    --card-hover-border: var(--blue);
    --logo-fill: linear-gradient(135deg, #0f172a, #475569);
    --btn-primary-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
    --btn-primary-hover: 0 6px 14px rgba(37, 99, 235, 0.3);
    --btn-accept-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
    --btn-accept-hover: 0 4px 12px rgba(16, 185, 129, 0.3);`;
css = css.replace(/    --shadow: 0 4px 20px rgba\(0, 0, 0, 0\.08\);\r?\n    --glow-shadow: 0 0 15px rgba\(37, 99, 235, 0\.1\);/, lightVars);

css = css.replace(/background: linear-gradient\(135deg, #ffffff, #94a3b8\);/g, `background: var(--logo-fill);`);

css = css.replace(/background: rgba\(18, 18, 23, 0\.7\);/g, `background: var(--header-bg);`);

css = css.replace(/box-shadow: inset 0 1px 0 rgba\(255, 255, 255, 0\.2\), 0 4px 12px rgba\(0, 0, 0, 0\.4\);/g, `box-shadow: var(--btn-primary-shadow);`);
css = css.replace(/box-shadow: inset 0 1px 0 rgba\(255, 255, 255, 0\.2\), 0 6px 16px rgba\(37, 99, 235, 0\.4\);/g, `box-shadow: var(--btn-primary-hover);`);

css = css.replace(/background: linear-gradient\(180deg, rgba\(24, 24, 31, 0\.6\) 0%, rgba\(18, 18, 23, 0\.9\) 100%\);/g, `background: var(--card-bg);`);
css = css.replace(/box-shadow: 0 4px 20px rgba\(0, 0, 0, 0\.2\);/g, `box-shadow: var(--card-shadow);`);
css = css.replace(/border-color: rgba\(255, 255, 255, 0\.15\);/g, `border-color: var(--card-hover-border);`);

css = css.replace(/box-shadow: inset 0 1px 0 rgba\(255, 255, 255, 0\.2\), 0 2px 8px rgba\(0, 0, 0, 0\.2\);/g, `box-shadow: var(--btn-accept-shadow);`);
css = css.replace(/box-shadow: inset 0 1px 0 rgba\(255, 255, 255, 0\.2\), 0 4px 12px rgba\(16, 185, 129, 0\.4\);/g, `box-shadow: var(--btn-accept-hover);`);

fs.writeFileSync('frontend/src/index.css', css);
console.log('Fixed Light Theme!');
