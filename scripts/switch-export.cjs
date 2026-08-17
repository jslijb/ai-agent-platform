const fs = require('fs');
const path = require('path');
const configPath = path.join(process.cwd(), 'next.config.js');
let config = fs.readFileSync(configPath, 'utf-8');
if (!config.includes("const OUTPUT_MODE = 'export'")) {
  config = config.replace("const OUTPUT_MODE = 'standalone'", "const OUTPUT_MODE = 'export'");
}
fs.writeFileSync(configPath, config, 'utf-8');
console.log('Switched to export mode (Capacitor SPA)');
