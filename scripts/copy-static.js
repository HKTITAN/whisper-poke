// Copy HTML/CSS for each renderer window into dist/renderer/<name>/.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src', 'renderer');
const dst = path.join(root, 'dist', 'renderer');

const windows = ['overlay', 'settings', 'login'];

for (const name of windows) {
  const from = path.join(src, name);
  const to = path.join(dst, name);
  fs.mkdirSync(to, { recursive: true });
  for (const file of fs.readdirSync(from)) {
    if (file.endsWith('.html') || file.endsWith('.css')) {
      fs.copyFileSync(path.join(from, file), path.join(to, file));
    }
  }
}
console.log('[copy-static] copied HTML/CSS for:', windows.join(', '));
