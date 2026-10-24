'use strict';
/**
 * MASTER: Git'dan tiklash + async konvertatsiya (barcha bosqichlar).
 * Ishlatish: node scripts/master-asyncify.js
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;

function run(script) {
  console.log(`\n>>> ${script}`);
  try {
    const out = execFileSync(NODE, [path.join(__dirname, script)], { cwd: ROOT, stdio: 'pipe' });
    console.log(String(out).split('\n').filter((l) => /XATO|JAMI|SINTAKSIS|OK /.test(l)).slice(-12).join('\n'));
  } catch (e) {
    console.log(String(e.stdout || '').split('\n').slice(-8).join('\n'));
  }
}

console.log('1) Git\'dan tiklash...');
execFileSync(NODE, [path.join(__dirname, 'git-restore.js'), '--checkout'], { cwd: ROOT, stdio: 'pipe' });

// dual-driver db/index.js va async app/server (zaxiradan)
const BK = 'C:/Users/User/AppData/Local/Temp/opencode/crs-backup/src';
if (fs.existsSync(BK)) {
  for (const f of ['db/index.js', 'app.js', 'server.js']) {
    const s = path.join(BK, f);
    const d = path.join(ROOT, 'src', f);
    if (fs.existsSync(s)) { fs.copyFileSync(s, d); console.log('   zaxir: ' + f); }
  }
}

run('asyncify.js');
run('asyncify-fix.js');
run('asyncify-fix2.js');
run('asyncify-fix3.js');
run('asyncify-fix4.js');
