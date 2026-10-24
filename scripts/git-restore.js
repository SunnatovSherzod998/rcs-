'use strict';
/**
 * .git dan asl faylni tiklash (git CLI o'rniga).
 * Loose obyektlar zlib bilan siqilgan: objects/xx/yyyy...  ->  "<sha> <type> <size>\0<content>"
 *
 * Ishlatish:
 *   node scripts/git-restore.js --list                 # ro'yxat
 *   node scripts/git-restore.js src/api/plan.js        # tiklash
 *   node scripts/git-restore.js --checkout             # barcha src/*.js tiklash
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const OBJ = path.join(ROOT, '.git', 'objects');

function readObject(sha) {
  const f = path.join(OBJ, sha.slice(0, 2), sha.slice(2));
  if (!fs.existsSync(f)) return null;
  const raw = zlib.inflateSync(fs.readFileSync(f));
  const nul = raw.indexOf(0);
  const header = raw.slice(0, nul).toString('utf8');
  const body = raw.slice(nul + 1);
  const [type, size] = header.split(' ');
  return { type, size: Number(size), body };
}

function commitTree(sha) {
  const c = readObject(sha);
  if (!c || c.type !== 'commit') return null;
  const m = c.body.toString('utf8').match(/^tree ([0-9a-f]{40})/m);
  return m ? m[1] : null;
}

/** Tree obyektini flat ro'yxatga (path -> blobSha) */
function flatten(treeSha, prefix = '', out = {}) {
  const t = readObject(treeSha);
  if (!t || t.type !== 'tree') return out;
  let i = 0;
  const buf = t.body;
  while (i < buf.length) {
    const sp = buf.indexOf(0x20, i);         // ' '
    if (sp < 0) break;
    const mode = buf.slice(i, sp).toString('utf8');
    const nul = buf.indexOf(0x00, sp);
    if (nul < 0) break;
    const name = buf.slice(sp + 1, nul).toString('utf8');
    const sha = buf.slice(nul + 1, nul + 21).toString('hex');
    const full = prefix ? `${prefix}/${name}` : name;
    if (mode === '40000') flatten(sha, full, out);
    else out[full] = sha;
    i = nul + 21;
  }
  return out;
}

function headCommit() {
  const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
  const ref = head.replace('ref: ', '');
  const refFile = path.join(ROOT, '.git', ref);
  if (fs.existsSync(refFile)) return fs.readFileSync(refFile, 'utf8').trim();
  return head;   // detached
}

const args = process.argv.slice(2);
const treeSha = commitTree(headCommit());
if (!treeSha) { console.error('HEAD topilmadi'); process.exit(1); }
const files = flatten(treeSha);
const names = Object.keys(files).filter((p) => p.startsWith('src/') && p.endsWith('.js'));

if (args[0] === '--list') {
  console.log(`HEAD tree: ${treeSha}`);
  console.log(`src/*.js fayllar: ${names.length}`);
  names.forEach((n) => console.log('  ' + n));
  process.exit(0);
}

function restore(rel) {
  const sha = files[rel];
  if (!sha) { console.error(`Gitda yo'q: ${rel}`); return false; }
  const b = readObject(sha);
  if (!b || b.type !== 'blob') { console.error(`Blob emas: ${rel}`); return false; }
  const dest = path.join(ROOT, rel);
  fs.writeFileSync(dest, b.body);   // xom blob — kodlash buzilmaydi
  console.log(`+ ${rel}  (${b.body.length} bayt)`);
  return true;
}

if (args[0] === '--checkout') {
  let n = 0;
  for (const f of names) if (restore(f)) n++;
  console.log(`\n${n} ta fayl tiklandi.`);
} else if (args[0]) {
  restore(args[0].replace(/\\/g, '/'));
} else {
  console.log('Foydalanish: --list | --checkout | <path>');
}