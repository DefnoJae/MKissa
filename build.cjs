const fs = require('node:fs');
const path = require('node:path');
const base = 'https://raw.githubusercontent.com/DefnoJae/MKissa/main/';
const manifest = {
    id: 'mkissa', name: 'MKissa', version: '0.1.1', author: 'DefnoJae',
    description: 'Experimental MKissa anime streaming provider. Windows Edge launcher available.',
    type: 'onlinestream-provider', language: 'javascript', lang: 'en',
    manifestURI: base + 'Manifest.json', readme: base + 'README.md',
    icon: base + 'icon.png', website: 'https://mkissa.to/anime',
    notes: 'Experimental. Requires ChromeDP. Windows users can use existing Edge via windows/Start-Seanime-With-Edge.cmd. Playback is not yet verified in Seanime.',
    payload: fs.readFileSync(path.join(__dirname, 'provider.js'), 'utf8')
};
fs.writeFileSync(path.join(__dirname, 'Manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
