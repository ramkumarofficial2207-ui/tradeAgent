const { execSync } = require('child_process');
try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    console.log("No errors.");
} catch (e) {
    console.log(e.stdout.toString('utf8'));
}
