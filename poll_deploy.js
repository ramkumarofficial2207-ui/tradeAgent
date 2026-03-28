const axios = require('axios');

async function checkHealth() {
    process.stdout.write('Polling /api/health... ');
    try {
        const res = await axios.get('https://swingedge-production-1080.up.railway.app/api/health', { timeout: 3000 });
        if (typeof res.data === 'object' && res.data.v === 'fix-6') {
            console.log('\n✅ NEW DEPLOYMENT IS LIVE! (v: fix-6 detected)');
            process.exit(0);
        } else {
            console.log('Still old deployment (Response: ' + JSON.stringify(res.data) + ')');
            setTimeout(checkHealth, 3000);
        }
    } catch (e) {
        console.log('Error hitting health:', e.message);
        setTimeout(checkHealth, 3000);
    }
}

checkHealth();
