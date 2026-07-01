// Repo discovery: enumerate every repo the user actually works in, from ground truth.
const fs=require('fs'), os=require('os'), path=require('path');
const { execFileSync }=require('child_process');
const HOME=os.homedir();
// GUI-launched editors (Cursor/VSCode) often start with a minimal PATH — ensure
// gh/git/curl/prd/issue-list resolve when this runs inside the extension host.
process.env.PATH=[...new Set([...(process.env.PATH||'').split(':'),path.join(HOME,'.local/bin'),path.join(HOME,'bin'),'/usr/local/bin','/opt/homebrew/bin','/usr/bin','/bin'])].filter(Boolean).join(':');
const sh=(c,a,o={})=>{try{return execFileSync(c,a,{maxBuffer:32*1024*1024,timeout:45000,...o}).toString();}catch(e){return '';}};
const bash=c=>{try{return execFileSync('bash',['-lc',c],{maxBuffer:32*1024*1024,timeout:15000}).toString();}catch(e){return '';}};
const norm=s=>String(s).toLowerCase().replace(/[-_ ]/g,'');
const DAY=86400000;

let CACHE=null, TS=0;
function discover(force){
  if(CACHE && !force && (Date.now()-TS)<600000) return CACHE;
  const reg={};
  const ensure=n=>{ if(!reg[n]) reg[n]={name:n,sources:new Set(),tracker:null,ownerRepo:null,localPath:null,
      giteaOpenIssues:0,prdCount:0,github:false,gitea:false,isArchived:false,pushedAt:0,sessionMtime:0,giteaUpdated:0}; return reg[n]; };

  // GITHUB (gyasis)
  try{ JSON.parse(sh('gh',['repo','list','gyasis','--limit','400','--json','name,pushedAt,isArchived'])||'[]')
    .forEach(r=>{const e=ensure(r.name);e.github=true;e.ghName=r.name;e.isArchived=!!r.isArchived;e.pushedAt=Date.parse(r.pushedAt)||0;e.sources.add('github');}); }catch(e){}
  // GITEA
  let tok=''; { const m=/password=(.+)/.exec(bash("printf 'protocol=http\\nhost=localhost:3939\\n\\n' | git credential fill")); if(m) tok=m[1].trim(); }
  if(tok){ try{ (JSON.parse(sh('curl',['-s','-m8','-H',`Authorization: token ${tok}`,'http://localhost:3939/api/v1/repos/search?limit=200'])||'{}').data||[])
    .forEach(r=>{const n=r.full_name.split('/').pop();const e=ensure(n);e.gitea=true;e.giteaFull=r.full_name;e.giteaOpenIssues=r.open_issues_count||0;e.giteaUpdated=Date.parse(r.updated_at)||0;e.sources.add('gitea');}); }catch(e){} }
  // PRD repo: tags
  try{ const cnt={}; JSON.parse(sh(path.join(HOME,'bin/prd'),['summary','--json'])||'[]')
    .forEach(p=>(p.tags||'').split(',').forEach(t=>{t=t.trim();if(t.startsWith('repo:')){const n=t.slice(5);cnt[n]=(cnt[n]||0)+1;}}));
    Object.entries(cnt).forEach(([n,c])=>{const e=ensure(n);e.prdCount=c;e.sources.add('prd');}); }catch(e){}

  // LOCAL git-repo path index (broadened: ~/Documents AND ~/Documents/code, +1 nested level)
  const pathIndex={};
  const addRepo=(name,p)=>{ if(!pathIndex[norm(name)]) pathIndex[norm(name)]=p; };
  for(const base of [path.join(HOME,'Documents'),path.join(HOME,'Documents/code')]){
    let names=[]; try{names=fs.readdirSync(base);}catch(e){continue;}
    for(const name of names){ const p=path.join(base,name); let st; try{st=fs.statSync(p);}catch(e){continue;} if(!st.isDirectory())continue;
      if(fs.existsSync(path.join(p,'.git'))) addRepo(name,p);
      else { try{ for(const sub of fs.readdirSync(p)) if(fs.existsSync(path.join(p,sub,'.git'))) addRepo(sub,path.join(p,sub)); }catch(e){} }
    }
  }
  Object.values(reg).forEach(e=>{ const p=pathIndex[norm(e.name)]; if(p){e.localPath=p;e.sources.add('local');} });
  // repos that exist ONLY locally (no gh/gitea/prd) — add them too
  for(const [nk,p] of Object.entries(pathIndex)){
    if(!Object.values(reg).some(e=>norm(e.name)===nk)){ const nm=path.basename(p); const e=ensure(nm); e.localPath=p; e.sources.add('local'); }
  }

  // SESSION cwd history (project folders) — mark recency, match to known repos
  try{ const pdir=path.join(HOME,'.claude/projects');
    for(const d of fs.readdirSync(pdir)){ const m=/Documents-code-(.+)$|Documents-(.+)$/.exec(d); if(!m) continue;
      const tail=(m[1]||m[2]); let st; try{st=fs.statSync(path.join(pdir,d));}catch(e){continue;}
      let key=Object.keys(reg).find(k=>norm(k)===norm(tail)) || Object.keys(reg).find(k=>norm(k)===norm(tail.split('-')[0]));
      const e=ensure(key||tail); e.sources.add('session'); e.sessionMtime=Math.max(e.sessionMtime,st.mtimeMs);
    } }catch(e){}

  // resolve tracker (github canonical when present, else gitea)
  Object.values(reg).forEach(e=>{
    if(e.github){e.tracker='github';e.ownerRepo='gyasis/'+(e.ghName||e.name);}
    else if(e.gitea){e.tracker='gitea';e.ownerRepo=e.giteaFull;}
  });

  const now=Date.now();
  const list=Object.values(reg).map(e=>{
    e.lastActivity=Math.max(e.pushedAt||0,e.sessionMtime||0,e.giteaUpdated||0);
    e.relevant=(e.prdCount>0)||(e.giteaOpenIssues>0)
      || (e.sessionMtime && (now-e.sessionMtime)<120*DAY)
      || (e.localPath && e.lastActivity && (now-e.lastActivity)<180*DAY)
      || (e.github && !e.isArchived && e.pushedAt && (now-e.pushedAt)<120*DAY);
    e.sources=[...e.sources];
    return e;
  });
  CACHE=list; TS=Date.now();
  return list;
}
module.exports={discover, norm};
