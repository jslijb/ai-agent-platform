const fs = require('fs');
const path = require('path');
const configPath = path.join(process.cwd(), 'next.config.js');
let config = fs.readFileSync(configPath, 'utf-8');
config = config.replace("output: 'export'", "output: 'standalone'");
fs.writeFileSync(configPath, config, 'utf-8');
console.log('Restored to standalone mode');