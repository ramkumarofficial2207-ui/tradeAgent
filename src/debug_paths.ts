import path from 'path';
import fs from 'fs';

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
console.log('__dirname:', __dirname);
console.log('FRONTEND_DIST:', frontendDist);
console.log('Exists:', fs.existsSync(frontendDist));
if (fs.existsSync(frontendDist)) {
    console.log('Contents:', fs.readdirSync(frontendDist));
}
