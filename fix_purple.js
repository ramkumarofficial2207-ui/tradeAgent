const fs = require('fs');
let css = fs.readFileSync('frontend/src/index.css', 'utf-8');
css = css.replace(/color:\s*#c4b5fd;/g, 'color: var(--purple);');
css = css.replace(/background:\s*rgba\(139,\s*92,\s*246,\s*0\.1\);/g, 'background: var(--purple-glow, rgba(139, 92, 246, 0.1));');
fs.writeFileSync('frontend/src/index.css', css);
console.log('Fixed Purple!');
