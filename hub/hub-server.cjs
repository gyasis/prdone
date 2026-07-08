// Standalone hub server (npm run hub). The extension uses the SAME data layer
// (assemble.cjs) via its own bundled express server — see src/kanban/server.ts.
// This standalone server mirrors that server's GET routes so `npm run hub` is a
// fully-working browser hub: repos, per-repo + (all) data, AND cross-tab search.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const { assembleHub, listRepos } = require('./assemble.cjs');

// Resolve express robustly: normal node resolution first (works when run from
// the repo root — `npm run hub`), then the repo's node_modules explicitly.
// (The old hardcoded ~/Documents/code/prdone path did not exist on this machine.)
function loadExpress(){
  const tries = [
    () => require('express'),
    () => require(path.join(__dirname, '..', 'node_modules', 'express')),
    () => require(path.join(os.homedir(), 'dev/projects/prdone/node_modules', 'express')),
  ];
  for (const t of tries){ try { return t(); } catch(_){} }
  throw new Error('express not found — run `npm install` in the prdone repo, then `npm run hub`');
}
const express = loadExpress();

const app = express();
const HOME = os.homedir();
const PRD_ROOT = process.env.PRD_ROOT || path.join(HOME, 'dev', 'prd');
const HANDOFF_ROOT = path.join(HOME, 'handoff');
const ALLOWED = [PRD_ROOT, HANDOFF_ROOT];
const classify = p => p.startsWith(HANDOFF_ROOT + path.sep) ? 'handoff' : p.startsWith(PRD_ROOT + path.sep) ? 'prd' : 'other';

app.get('/api/repos', (req,res)=>{ try { res.set('Cache-Control','no-store').json(listRepos(req.query.all==='1', req.query.refresh==='1')); }
  catch(e){ res.status(500).json({ ok:false, error:String(e&&e.message||e) }); } });
app.get('/api/hub', (req,res)=>{ try { res.set('Cache-Control','no-store').json(assembleHub(String(req.query.repo||'twicedata_intra'))); }
  catch(e){ res.status(500).json({ ok:false, error:String(e&&e.message||e) }); } });

// /api/search — cross-tab full-text over every PRD + handoff (mirrors server.ts).
app.get('/api/search', (req,res)=>{
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) { res.set('Cache-Control','no-store').json({ ok:true, q, results:[] }); return; }
  execFile('rg', ['--json','-i','--max-count','8','-g','*.md','-g','!node_modules','-e',q,...ALLOWED],
    { maxBuffer: 16*1024*1024, timeout: 10000 }, (err, stdout)=>{
      if (err && err.code === 'ENOENT') { res.status(500).json({ ok:false, error:'ripgrep (rg) not found on PATH' }); return; }
      const byFile = {};
      for (const line of String(stdout).split('\n')){
        if (!line) continue; let o; try { o = JSON.parse(line); } catch { continue; }
        if (o.type !== 'match' || !o.data || !o.data.path || !o.data.path.text) continue;
        const p = o.data.path.text; const e = (byFile[p] || (byFile[p] = { path:p, type:classify(p), count:0, matches:[] }));
        e.count++; if (e.matches.length < 3) e.matches.push({ line:(o.data.line_number||0), text:((o.data.lines&&o.data.lines.text)||'').trim().slice(0,200) });
      }
      const results = Object.values(byFile).sort((a,b)=> a.type===b.type ? b.count-a.count : a.type==='prd'?-1:b.type==='prd'?1:0).slice(0,60);
      res.set('Cache-Control','no-store').json({ ok:true, q, results });
    });
});

app.get('/sidebar', (_q,res)=> res.set('Cache-Control','no-store').sendFile(path.join(__dirname,'sidebar.html')));
app.get('/', (_q,res)=> res.set('Cache-Control','no-store').sendFile(path.join(__dirname,'hub.html')));

const PORT = Number(process.env.HUB_PORT || 8813);
app.listen(PORT,'127.0.0.1',()=>console.log('hub on http://127.0.0.1:'+PORT+'/'));
