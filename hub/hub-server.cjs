// Standalone hub server (npm run hub). The extension uses the SAME data layer
// (assemble.cjs) via its own bundled express server — see src/kanban/server.ts.
const path = require('path');
const os = require('os');
const PRDONE = path.join(os.homedir(), 'Documents/code/prdone');
const express = require(path.join(PRDONE, 'node_modules', 'express'));
const { assembleHub, listRepos } = require('./assemble.cjs');

const app = express();
app.get('/api/repos', (req,res)=>{ try { res.set('Cache-Control','no-store').json(listRepos(req.query.all==='1', req.query.refresh==='1')); }
  catch(e){ res.status(500).json({ ok:false, error:String(e&&e.message||e) }); } });
app.get('/api/hub', (req,res)=>{ try { res.set('Cache-Control','no-store').json(assembleHub(String(req.query.repo||'twicedata_intra'))); }
  catch(e){ res.status(500).json({ ok:false, error:String(e&&e.message||e) }); } });
app.get('/sidebar', (_q,res)=> res.sendFile(path.join(__dirname,'sidebar.html')));
app.get('/', (_q,res)=> res.sendFile(path.join(__dirname,'hub.html')));
app.listen(8813,'127.0.0.1',()=>console.log('hub on http://127.0.0.1:8813/'));
