const axios = require('axios');

async function test() {
    let healthChecks = [];
    const interval = setInterval(async () => {
        const start = Date.now();
        try {
            await axios.get('https://swingedge-production-1080.up.railway.app/api/health', { timeout: 1000 });
            healthChecks.push({ time: Date.now() - start, ok: true });
        } catch (e) {
            healthChecks.push({ time: Date.now() - start, ok: false });
        }
    }, 100);

    setTimeout(async () => {
        try {
            console.log('Hitting login...');
            await axios.post('https://swingedge-production-1080.up.railway.app/api/auth/login', { email: 'a@b.com', password: '123' });
        } catch(e) { console.log('Login failed:', e.response?.status); }
    }, 500);

    setTimeout(() => {
        clearInterval(interval);
        console.log('Health checks:', healthChecks.map(h => h.ok ? 'O' : 'X').join(''));
    }, 2000);
}
test();
