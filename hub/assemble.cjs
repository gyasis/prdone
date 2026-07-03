// Express-free hub data layer, shared by the standalone server (hub-server.cjs)
// AND the VSCode extension's bundled kanban server (src/kanban/server.ts, via
// a runtime require of this file). Uses only node builtins + shelling to
// gh/git/curl/prd/issue-list — NO npm deps, so it runs inside the extension host.
const path = require('path'), fs = require('fs'), os = require('os');
const { execFileSync } = require('child_process');
const { discover, norm } = require('./discover.cjs');
const { connectionsFor } = require('./connections.cjs');
const HOME = os.homedir();
const ISSUE_LIST = path.join(HOME, '.local/bin/issue-list');
const PRD = path.join(HOME, 'bin/prd');
const CODE_ROOT = path.join(HOME, 'Documents/code');
const HANDOFF = path.join(HOME, 'handoff');
const TRACKERS = path.join(HOME, '.claude/skills/issue-king/trackers.json');
const overrides = (()=>{ try { return JSON.parse(fs.readFileSync(TRACKERS,'utf8')).repos; } catch(e){ return {}; } })();
const sh = (c,a,o={})=>{ try { return execFileSync(c,a,{maxBuffer:32*1024*1024,timeout:45000,...o}).toString(); } catch(e){ return ''; } };

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
// Which repo(s) a PRD belongs to. Association is by what the PRD is ABOUT, not
// the folder it was created in: PRIMARY = the declared `**Repo:**` frontmatter
// line; FALLBACK = a `repo:<name>` tag. (The old creation-folder signal —
// each repo's .memory/active-prds.json — is intentionally dropped.)
const _repoCache = new Map(); // path -> { mtime, repos:[...] }
function reposForPrd(p){
  const tagRepos = () => (p.tags||'').split(',').map(t=>t.trim()).filter(t=>t.startsWith('repo:')).map(t=>t.slice(5));
  try {
    const st = fs.statSync(p.path);
    const hit = _repoCache.get(p.path);
    if (hit && hit.mtime === st.mtimeMs) return hit.repos;
    const head = fs.readFileSync(p.path,'utf8').slice(0, 4000);
    let repos = [];
    const m = head.match(/^\s*\*\*Repo:\*\*\s*`?([A-Za-z0-9._\/-]+?)`?\s*$/m);
    if (m && m[1] && m[1].toLowerCase() !== 'none') repos = [m[1].trim()]; // PRIMARY
    if (!repos.length) repos = tagRepos();                                // FALLBACK
    _repoCache.set(p.path, { mtime: st.mtimeMs, repos });
    return repos;
  } catch(e){ return tagRepos(); }
}
function prdsForRepo(key){
  let all=[]; try { all = JSON.parse(sh(PRD,['summary','--json','--with-tree'])); } catch(e){}
  return all.filter(p => reposForPrd(p).includes(key))
            .map(p => ({ id:p.id, title:p.title, tier:p.tier, status:p.status, age_days:p.age_days, significance:p.significance, tags:p.tags }));
}
function issuesForRepo(entry){
  if (!entry.tracker || !entry.ownerRepo) return [];
  try { const j=JSON.parse(sh(ISSUE_LIST,['--tracker',entry.tracker,'--repo',entry.ownerRepo,'--state','open','--limit','60'])); return Array.isArray(j)?j:[]; }
  catch(e){ return []; }
}
function handoffsForRepo(key, prds){
  if (!fs.existsSync(HANDOFF)) return [];
  const prdIds = (prds||[]).map(p=>p.id);
  const slug = /([a-z0-9_]{6,}_\d{4}-\d{2}-\d{2})/g;
  const out=[];
  for (const f of fs.readdirSync(HANDOFF)){ if(!f.endsWith('.md')) continue;
    let body=''; try{ body=fs.readFileSync(path.join(HANDOFF,f),'utf8'); }catch(e){}
    if (norm(f).includes(norm(key)) || body.toLowerCase().includes(key.toLowerCase())){
      // link handoff -> PRDs by scanning file+body for PRD slugs (mirrors issues)
      const refs=new Set();
      for (const m of (f+'\n'+body).matchAll(slug)) if (prdIds.includes(m[1])) refs.add(m[1]);
      out.push({ file:f, mtime: fs.statSync(path.join(HANDOFF,f)).mtimeMs, prdRefs:[...refs] });
    }
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

// Not every PRD is about a repo — some are machine tasks, calendar reads,
// one-off processes. Those live in an "(unassigned)" bucket, first-class.
const UNASSIGNED = '(unassigned)';
function unassignedPrds(){
  let all=[]; try { all = JSON.parse(sh(PRD,['summary','--json','--with-tree'])); } catch(e){}
  return all.filter(p => reposForPrd(p).length === 0)
            .map(p => ({ id:p.id, title:p.title, tier:p.tier, status:p.status, age_days:p.age_days, significance:p.significance, tags:p.tags }));
}

function assembleHub(key){
  key = key || 'twicedata_intra';
  if (key === UNASSIGNED) {
    const prds = unassignedPrds();
    return { ok:true, repo:UNASSIGNED, ownerRepo:'— not tied to a repo —', tracker:'none', localPath:null,
             work:{ branch:null, worktrees:0, dirty:0, recent:[] }, prds, issues:[], handoffs:[],
             links:{ byPrd:{}, orphans:[] }, connections:{ uses:[], usedBy:[], references:[] } };
  }
  const entry = resolveRepo(key);
  if (!entry) return { ok:false, error:'unknown repo '+key };
  const work = gitWork(entry.localPath);
  const prds = prdsForRepo(entry.key, entry.localPath);
  const issues = issuesForRepo(entry);
  const handoffs = handoffsForRepo(entry.key, prds);
  const links = linkIssuesToPrds(issues, prds);
  const connections = connectionsFor(entry.key, discover().filter(e=>e.relevant && (e.tracker || e.prdCount>0)), { issues });
  return { ok:true, repo:entry.key, ownerRepo:entry.ownerRepo||'(no tracker)', tracker:entry.tracker||'none', localPath:entry.localPath, work, prds, issues, handoffs, links, connections };
}
function listRepos(showAll, refresh){
  const all = discover(refresh);
  const list = all.filter(e=>showAll || e.relevant)
    .sort((a,b)=> (b.lastActivity||0)-(a.lastActivity||0))
    .map(e=>({ name:e.name, tracker:e.tracker, ownerRepo:e.ownerRepo, hasLocal:!!e.localPath, prdCount:e.prdCount, giteaOpenIssues:e.giteaOpenIssues, sources:e.sources }));
  // First-class "(unassigned)" bucket for PRDs not tied to any repo.
  let unassignedCount = 0; try { unassignedCount = unassignedPrds().length; } catch(e){}
  if (unassignedCount) list.push({ name:UNASSIGNED, tracker:'none', ownerRepo:'—', hasLocal:false, prdCount:unassignedCount, giteaOpenIssues:0, sources:['prd'] });
  return { total:all.length, shown:list.length, repos:list };
}
module.exports = { assembleHub, listRepos, resolveRepo };
