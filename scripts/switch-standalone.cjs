const fs = require('fs');
const path = require('path');
const configPath = path.join(process.cwd(), 'next.config.js');
let config = fs.readFileSync(configPath, 'utf-8');
if (!config.includes("const OUTPUT_MODE = 'standalone'")) {
  config = config.replace("const OUTPUT_MODE = 'export'", "const OUTPUT_MODE = 'standalone'");
}
fs.writeFileSync(configPath, config, 'utf-8');
console.log('Restored to standalone mode');
