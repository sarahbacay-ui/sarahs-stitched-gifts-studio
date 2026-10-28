// Dropbox App Folder integration, explicit user actions only. OAuth PKCE, no app secret.
const StudioDropbox=(()=>{
 const API='https://api.dropboxapi.com/2', CONTENT='https://content.dropboxapi.com/2';
 const ROOT='/studio-current.json', PREFIX='/backups/';
 let token=null, revision=null, baseChecksum=null;
 const configKey='studio-dropbox-public-key';
 const redirect=()=>location.origin+location.pathname;
 const appKey=()=>localStorage.getItem(configKey)||'';
 const random=()=>{const a=new Uint8Array(32);crypto.getRandomValues(a);return b64(a)};
 const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 async function sha256(s){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))}
 function setKey(key){if(!/^[A-Za-z0-9]{8,80}$/.test(key))throw Error('Invalid Dropbox app key');localStorage.setItem(configKey,key)}
 async function connect(){if(!appKey())throw Error('Enter a Dropbox App Key first');const verifier=random(),state=random();sessionStorage.setItem('studio-db-pkce',JSON.stringify({verifier,state,at:Date.now()}));const url=new URL('https://www.dropbox.com/oauth2/authorize');url.search=new URLSearchParams({client_id:appKey(),response_type:'code',token_access_type:'online',redirect_uri:redirect(),code_challenge:await sha256(verifier),code_challenge_method:'S256',state}).toString();location.assign(url.href)}
 async function callback(){const u=new URL(location.href),code=u.searchParams.get('code'),error=u.searchParams.get('error');if(!code&&!error)return false;history.replaceState(null,'',redirect());if(error)throw Error('Dropbox authorization declined: '+error);const pending=JSON.parse(sessionStorage.getItem('studio-db-pkce')||'null');sessionStorage.removeItem('studio-db-pkce');if(!pending||pending.state!==u.searchParams.get('state')||Date.now()-pending.at>600000)throw Error('Invalid or expired Dropbox authorization');const form=new URLSearchParams({code,grant_type:'authorization_code',client_id:appKey(),redirect_uri:redirect(),code_verifier:pending.verifier});const r=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});const data=await r.json();if(!r.ok)throw Error(data.error_description||'Authorization failed');token=data.access_token;sessionStorage.setItem('studio-db-token',token);return true}
 function connected(){token=token||sessionStorage.getItem('studio-db-token');return !!token}
 function disconnect(){token=null;revision=null;baseChecksum=null;sessionStorage.removeItem('studio-db-token')}
 async function call(url,opts={}){if(!connected())throw Error('Connect Dropbox first');const r=await fetch(url,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers}});if(!r.ok){if(r.status===401)disconnect();const message=await r.text();const e=Error('Dropbox request failed ('+r.status+'): '+message.slice(0,240));e.status=r.status;throw e}return r}
 async function metadata(path){try{return await(await call(API+'/files/get_metadata',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})})).json()}catch(e){if(e.status===409)return null;throw e}}
 async function download(path){const r=await call(CONTENT+'/files/download',{method:'POST',headers:{'Dropbox-API-Arg':JSON.stringify({path})}});return await r.json()}
 async function upload(path,doc,rev){const mode=rev?{'.tag':'update',update:rev}:{'.tag':'add'};return await(await call(CONTENT+'/files/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','Dropbox-API-Arg':JSON.stringify({path,mode,autorename:false,mute:true})},body:JSON.stringify(doc)})).json()}
 async function backup(doc){const name=PREFIX+'backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+random().slice(0,8)+'.json';return upload(name,doc)}
 // Never silently replace remote or local data. Whole-snapshot conflict policy for prototype.
 async function synchronize(local,validate,ask){const localChecksum=await local.checksum();const meta=await metadata(ROOT);
  if(!meta){if(!confirm('No Dropbox studio file exists. Upload this device’s current data as the first cloud copy?'))return 'cancelled';const doc=await local.export();const saved=await upload(ROOT,doc);revision=saved.rev;baseChecksum=localChecksum;await backup(doc);return 'uploaded';}
  const remote=await download(ROOT);await validate(remote);const remoteChecksum=remote.checksum;
  if(baseChecksum===null){const choice=prompt('Dropbox contains a Studio backup. Type DOWNLOAD to replace this device’s data, UPLOAD to replace the Dropbox copy, or CANCEL. Export a local backup first if needed.','CANCEL');if(choice==='DOWNLOAD'){await ask(remote.data);revision=meta.rev;baseChecksum=remoteChecksum;return 'downloaded'}if(choice==='UPLOAD'){const doc=await local.export();const saved=await upload(ROOT,doc,meta.rev);revision=saved.rev;baseChecksum=localChecksum;await backup(doc);return 'uploaded'}return 'cancelled'}
  const localChanged=localChecksum!==baseChecksum,remoteChanged=remoteChecksum!==baseChecksum;
  if(!localChanged&&!remoteChanged){revision=meta.rev;return 'already up to date'}
  if(remoteChanged&&localChanged){const choice=prompt('Sync conflict: both devices changed data. Type DOWNLOAD to keep Dropbox, UPLOAD to keep this device, or CANCEL. Neither copy is overwritten automatically.','CANCEL');if(choice==='DOWNLOAD'){await ask(remote.data);revision=meta.rev;baseChecksum=remoteChecksum;return 'downloaded'}if(choice==='UPLOAD'){const doc=await local.export();await backup(remote);const saved=await upload(ROOT,doc,meta.rev);revision=saved.rev;baseChecksum=localChecksum;await backup(doc);return 'uploaded'}return 'conflict postponed'}
  if(remoteChanged){await ask(remote.data);revision=meta.rev;baseChecksum=remoteChecksum;return 'downloaded'}
  const doc=await local.export();const saved=await upload(ROOT,doc,meta.rev);revision=saved.rev;baseChecksum=localChecksum;await backup(doc);return 'uploaded';
 }
 return {setKey,appKey,connect,callback,connected,disconnect,synchronize};
})();
