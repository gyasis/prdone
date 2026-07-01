// Cross-repo connections, DISCOVERED from ground truth (not hand-tagged).
// A "uses" B when A's local tree references B: vendored dir, git submodule,
// package.json dep, or a python dep/editable path. Reverse gives "usedBy".
// "references" = other repo names that appear in this repo's issue bodies.
const fs = require('fs'), path = require('path');
const { norm } = require('./discover.cjs');

let GRAPH = null, TS = 0;
const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } };
// too-generic names that substring-match everywhere — never a real connection signal
const GENERIC = new Set(['code','working','twicedata','docs','doc','test','tests','app','src','main','lib','core','api','web','data','dataengineer','documents','vendor','node','python','util','utils']);

function buildGraph(repos){
  if (GRAPH && (Date.now()-TS) < 600000) return GRAPH;
  const withPath = repos.filter(r => r.localPath);
  const nkey = {}; repos.forEach(r => { nkey[norm(r.name)] = r.name; });
  const names = repos.map(r => r.name);
  const uses = {}; names.forEach(n => uses[n] = new Set());

  for (const r of withPath){
    const found = new Set();
    const add = raw => { const k = nkey[norm(raw)]; if (k && k !== r.name && !GENERIC.has(k.toLowerCase())) found.add(k); };
    // vendored dirs
    try { const vd = path.join(r.localPath,'vendor');
      if (fs.existsSync(vd)) for (const s of fs.readdirSync(vd)) add(s);
    } catch(e){}
    // git submodules
    for (const m of read(path.join(r.localPath,'.gitmodules')).matchAll(/(?:path|url)\s*=\s*(.+)/g))
      add(path.basename(m[1].trim().replace(/\.git$/,'')));
    // package.json deps (match by basename against known repo names)
    const pj = read(path.join(r.localPath,'package.json'));
    if (pj) try { const d = JSON.parse(pj);
      [...Object.keys(d.dependencies||{}), ...Object.keys(d.devDependencies||{})].forEach(dep=>add(path.basename(dep)));
    } catch(e){}
    // python deps / editable installs: match any known repo name token in these files
    const py = read(path.join(r.localPath,'requirements.txt')) + '\n' +
               read(path.join(r.localPath,'pyproject.toml')) + '\n' +
               read(path.join(r.localPath,'setup.py')) + '\n' +
               read(path.join(r.localPath,'setup.cfg'));
    if (py.trim()){
      for (const nm of names){
        if (nm === r.name || nm.length < 4 || GENERIC.has(nm.toLowerCase())) continue;
        const re = new RegExp('(?:^|[\\s/=\'"@\\-])' + nm.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '(?:[\\s/=\'".@]|$)','im');
        if (re.test(py)) found.add(nm);
      }
    }
    found.forEach(k => uses[r.name].add(k));
  }
  const usedBy = {}; names.forEach(n => usedBy[n] = new Set());
  for (const a of names) for (const b of uses[a]) usedBy[b].add(a);
  GRAPH = { uses, usedBy }; TS = Date.now();
  return GRAPH;
}

// connections for one repo. hubData is the assembled {issues} for reference scan.
function connectionsFor(name, repos, hubData){
  const g = buildGraph(repos);
  const uses = [...(g.uses[name] || [])];
  const usedBy = [...(g.usedBy[name] || [])];
  const seen = new Set([name, ...uses, ...usedBy]);
  const refs = new Set();
  const blob = ((hubData.issues||[]).map(i => i.body || '').join(' ')).toLowerCase();
  for (const r of repos){
    if (seen.has(r.name) || r.name.length < 4 || GENERIC.has(r.name.toLowerCase())) continue;
    const re = new RegExp('(?:^|[^a-z0-9])' + r.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '(?:[^a-z0-9]|$)');
    if (re.test(blob)) refs.add(r.name);
  }
  return { uses, usedBy, references: [...refs] };
}
module.exports = { connectionsFor, buildGraph };
