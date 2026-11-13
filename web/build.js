'use strict';
// Builds the single self-contained page: dist/index.html
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const pol = JSON.parse(fs.readFileSync(path.join(root, 'results/shipped_policies.json')));
const clips = {};
for (const f of fs.readdirSync(path.join(__dirname, 'audio'))) if (f.endsWith('.wav')) clips[f.replace('.wav', '')] = fs.readFileSync(path.join(__dirname, 'audio', f)).toString('base64');
let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
html = html.replace('/*ENGINE*/', () => fs.readFileSync(path.join(root, 'src/engine.js'), 'utf8'))
  .replace('/*POLICIES*/', () => JSON.stringify(pol)).replace('/*CLIPS*/', () => JSON.stringify(clips));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
fs.writeFileSync(path.join(root, 'docs/index.html'), html); // the GitHub Pages copy
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
