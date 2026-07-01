const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');
const { discover, norm } = require('./discover.cjs');
const HOME = os.homedir();
const PRDONE = path.join(HOME, 'Documents/code/prdone');
const express = require(path.join(PRDONE, 'node_modules', 'express'));
const ISSUE_LIST = path.join(HOME, '.local/bin/issue-list');
const PRD = path.join(HOME, 'bin/prd');
const CODE_ROOT = path.join(HOME, 'Documents/code');
const HANDOFF = path.join(HOME, 'handoff');
const TRACKERS = path.join(HOME, '.claude/skills/issue-king/trackers.json');
const overrides = (()=>{ try { return JSON.parse(fs.readFileSync(TRACKERS,'utf8')).repos; } catch(e){ return {}; } })();

const sh=(c,a,o={})=>{try{return execFileSync(c,a,{maxBuffer:32*1024*1024,timeout:45000,...o}).toString();}catch(e){return '';}};

function guessLocal(name){
  const e = discover().find(r=>norm(r.name)===norm(name));
  if (e && e.localPath) return e.localPath;
  const p = path.join(CODE_ROOT, name); return fs.existsSync(path.join(p,'.git')) ? p : null;
}
function resolveRepo(key){
  if (overrides[key]) return { key, tracker:overrides[key].tracker, ownerRepo:overrides[key].repo, localPath: guessLocal(key) };
  for (const [k,v] of Object.entries(overrides)) if ((v.aliases||[]).some(a=>norm(a)===norm(key))) return { key:k, tracker:v.tracker, ownerRepo:v.repo, localPath: guessLocal(k) };
  const e = discover().find(r => norm(r.name)===norm(key));
  if (e) return { key:e.name, tracker:e.tracker, ownerRepo:e.ownerRepo, localPath:e.localPath };
  return null;
}
function gitWork(repoDir){
  if (!repoDir || !fs.existsSync(path.join(repoDir,'.git'))) return { branch:null, worktrees:0, dirty:0, recent:[], exists:false };
  const branch = sh('git',['-C',repoDir,'branch','--show-current']).trim();
  const wt = sh('git',['-C',repoDir,'worktree','list']).trim().split('\n').filter(Boolean).length;
  const dirty = sh('git',['-C',repoDir,'status','--porcelain']).trim().split('\n').filter(Boolean).length;
  const recent = sh('git',['-C',repoDir,'log','--oneline','-3']).trim().split('\n').filter(Boolean);
  return { branch, worktrees:wt, dirty, recent, exists:true };
}
function prdsForRepo(key, repoDir){
  let all=[]; try { all = JSON.parse(sh(PRD,['summary','--json','--with-tree'])); } catch(e){}
  const ids = new Set();
  if (repoDir){ const ap=path.join(repoDir,'.memory','active-prds.json'); if (fs.existsSync(ap)){ try{ (JSON.parse(fs.readFileSync(ap,'utf8')).active||[]).forEach(e=>ids.add(e.id)); }catch(e){} } }
  return all.filter(p => ids.has(p.id) || (p.tags||'').split(',').some(t=>t.trim()==='repo:'+key))
            .map(p => ({ id:p.id, title:p.title, tier:p.tier, status:p.status, age_days:p.age_days, significance:p.significance, tags:p.tags }));
}
function issuesForRepo(entry){
  if (!entry.tracker || !entry.ownerRepo) return [];
  try { const j=JSON.parse(sh(ISSUE_LIST,['--tracker',entry.tracker,'--repo',entry.ownerRepo,'--state','open','--limit','60'])); return Array.isArray(j)?j:[]; }
  catch(e){ return []; }
}
function handoffsForRepo(key){
  if (!fs.existsSync(HANDOFF)) return [];
  const out=[];
  for (const f of fs.readdirSync(HANDOFF)){ if(!f.endsWith('.md')) continue;
    let body=''; try{ body=fs.readFileSync(path.join(HANDOFF,f),'utf8'); }catch(e){}
    if (norm(f).includes(norm(key)) || body.toLowerCase().includes(key.toLowerCase()))
      out.push({ file:f, mtime: fs.statSync(path.join(HANDOFF,f)).mtimeMs });
  }
  return out.sort((a,b)=>b.mtime-a.mtime).slice(0,6);
}
function linkIssuesToPrds(issues, prds){
  const prdIds = prds.map(p=>p.id);
  const slug = /([a-z0-9_]{6,}_\d{4}-\d{2}-\d{2})/g;
  for (const i of issues){ const refs=new Set();
    for (const m of String(i.body||'').matchAll(slug)) if (prdIds.includes(m[1])) refs.add(m[1]);
    i.prdRefs=[...refs];
  }
  const byPrd={}; for (const p of prds) byPrd[p.id]=[]; const orphans=[];
  for (const i of issues){ if(i.prdRefs.length) i.prdRefs.forEach(id=>byPrd[id].push(i.number)); else orphans.push(i.number); }
  return { byPrd, orphans };
}

const app = express();
app.get('/api/repos', (req,res)=>{
  const all = discover(req.query.refresh==='1');
  const showAll = req.query.all==='1';
  const list = all.filter(e=>showAll || e.relevant)
    .sort((a,b)=> (b.lastActivity||0)-(a.lastActivity||0))
    .map(e=>({ name:e.name, tracker:e.tracker, ownerRepo:e.ownerRepo, hasLocal:!!e.localPath,
               prdCount:e.prdCount, giteaOpenIssues:e.giteaOpenIssues, sources:e.sources }));
  res.set('Cache-Control','no-store').json({ total:all.length, shown:list.length, repos:list });
});
app.get('/api/hub', (req,res)=>{
  const key = req.query.repo || 'twicedata_intra';
  const entry = resolveRepo(key);
  if (!entry) return res.status(404).json({ ok:false, error:'unknown repo '+key });
  const work = gitWork(entry.localPath);
  const prds = prdsForRepo(entry.key, entry.localPath);
  const issues = issuesForRepo(entry);
  const handoffs = handoffsForRepo(entry.key);
  const links = linkIssuesToPrds(issues, prds);
  res.set('Cache-Control','no-store').json({ ok:true, repo:entry.key, ownerRepo:entry.ownerRepo||'(no tracker)', tracker:entry.tracker||'none', localPath:entry.localPath, work, prds, issues, handoffs, links });
});
app.get('/', (_q,res)=> res.sendFile(path.join(__dirname,'hub.html')));
app.listen(8813,'127.0.0.1',()=>console.log('hub on http://127.0.0.1:8813/'));
