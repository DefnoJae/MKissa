const fs = require('node:fs');
const path = require('node:path');
const base = 'https://raw.githubusercontent.com/DefnoJae/MKissa/main/';
const payload = ['crypto.js', 'provider.core.js'].map(file => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n\n');
fs.writeFileSync(path.join(__dirname, 'provider.js'), payload);
const manifest = {
    id: 'mkissa', name: 'MKissa', version: '0.2.1', author: 'DefnoJae',
    description: 'MKissa anime streaming provider with direct API requests. No browser or launcher required.',
    type: 'onlinestream-provider', language: 'javascript', lang: 'en',
    manifestURI: base + 'Manifest.json', readme: base + 'README.md',
    icon: base + 'icon.png', website: 'https://mkissa.to/anime',
    payload
};
fs.writeFileSync(path.join(__dirname, 'Manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
