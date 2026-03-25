const axios = require('axios');

async function test() {
    console.log('Sending GET /api/health...');
    try {
        const h1 = await axios.get('https://swingedge-production-1080.up.railway.app/api/health');
        console.log('Health 1:', h1.status);
    } catch(e) { console.log('Health 1 failed', e.message); }

    console.log('\nSending POST /api/auth/login...');
    try {
        const r1 = await axios.post('https://swingedge-production-1080.up.railway.app/api/auth/login', { email: 'test@example.com', password: 'password123' }, { timeout: 10000 });
        console.log('Login returned:', r1.status);
    } catch(e) {
        console.log('Login failed:', e.response?.status, e.message);
    }

    console.log('\nSending GET /api/health immediately after...');
    try {
        const h2 = await axios.get('https://swingedge-production-1080.up.railway.app/api/health');
        console.log('Health 2:', h2.status);
    } catch(e) { console.log('Health 2 failed', e.message); }
}

test();
