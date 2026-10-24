'use strict';
/** find-missing-await ro'yxatiga asoslanib `await` qo'shadi. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SRC = path.join(__dirname, '..', 'src');
const NODE = process.execPath;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(SRC);
let total = 0;

for (let pass = 0; pass < 4; pass++) {
  // topamiz
  const targets = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');
    lines.forEach((ln, i) => {
      if (/^\s*(\/\/|\*)/.test(ln)) return;
      // `name(` yoki `mod.name(` — module obyekti bilan
      const rx = /(?<![\w.$])(?<!await\s)((?:[A-Za-z_$][\w$]*\.)?[A-Za-z_$][\w$]*)\s*\(/g;
      let m;
      while ((m = rx.exec(ln))) {
        const name = m[1];
        if (['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'function', 'await',
          'Math', 'JSON', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Date', 'parseInt', 'parseFloat',
          'isNaN', 'setTimeout', 'console'].includes(name)) continue;
        if (name.includes('.')) {
          const [mod, fn] = name.split('.');
          if (!['stock', 'salary', 'db', 'api', 'http'].includes(mod)) continue;
        }
        // funksiya async mi? (shu faylda)
        const isAsync = new RegExp(`(?:async\\s+function\\s+${name.split('.').pop()}\\s*\\(|(?:const|let|var)\\s+${name.split('.').pop()}\\s*=\\s*async)`).test(src);
        if (!isAsync) continue;
        // allaqachon await bilan?
        if (new RegExp(`await\\s+${name.replace('.', '\\.')}\\s*\\(`).test(ln)) continue;
        // definition qatorimi?
        if (new RegExp(`(?:async\\s+function\\s+${name.split('.').pop()}\\s*\\(|(?:const|let|var)\\s+${name.split('.').pop()}\\s*=)`).test(ln)) continue;
        targets.push({ file, line: i, name, col: m.index });
        break;
      }
    });
  }

  if (!targets.length) break;

  // har fayl uchun qatorlarni teskari tartibda tahrirlaymiz
  const byFile = new Map();
  for (const t of targets) {
    if (!byFile.has(t.file)) byFile.set(t.file, []);
    byFile.get(t.file).push(t);
  }
  for (const [file, list] of byFile) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    list.sort((a, b) => b.line - a.line || b.col - a.col);
    for (const t of list) {
      const ln = lines[t.line];
      const pos = ln.search(new RegExp(`(?<![\\w.$])(?<!await\\s)${t.name.replace('.', '\\.')}\\s*\\(`));
      if (pos < 0) continue;
      lines[t.line] = ln.slice(0, pos) + 'await ' + ln.slice(pos);
      total++;
    }
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
  }
  console.log(`iteratsiya ${pass + 1}: ${targets.length} ta await qo'shildi`);
}

console.log(`\nJami: ${total}`);

let bad = 0;
for (const file of files) {
  try { execFileSync(NODE, ['--check', file], { stdio: 'pipe' }); }
  catch (e) {
    bad++;
    const msg = String(e.stderr || '');
    const m = msg.match(/[\w\\.\/]+\.js:(\d+)/);
    const ln = (msg.split('\n').find((l) => l.trim().startsWith('await') || l.includes('SyntaxError')) || '').trim();
    console.log(`XATO ${path.relative(SRC, file)}${m ? ':' + m[1] : ''}  ${ln.slice(0, 74)}`);
  }
}
console.log(bad === 0 ? 'SINTAKSIS TOGRI' : `XATO: ${bad}`);