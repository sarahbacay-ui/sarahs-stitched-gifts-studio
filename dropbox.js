// Dropbox App Folder integration, explicit user actions only. OAuth PKCE, no app secret.
const StudioDropbox=(()=>{
 const API='https://api.dropboxapi.com/2', CONTENT='https://content.dropboxapi.com/2';
 const ROOT='/studio-current.json', PREFIX='/backups/';
 let token=null, revision=null, baseChecksum=null, expiresAt=0, refreshing=null;
 const refreshKey='studio-db-refresh-token';
 const tokenKey='studio-db-token';
 const expiryKey='studio-db-token-expiry';
 const hasRefresh=()=>!!localStorage.getItem(refreshKey);
 const statusKey='studio-db-connection-status';
 const setStatus=(value)=>sessionStorage.setItem(statusKey,value);
 const status=()=>{
  const suffix=hasRefresh()?' · Automatic renewal enabled':' · Reconnect once to enable automatic renewal';
  if(!connected())return sessionStorage.getItem(statusKey)==='expired'?'Connection expired':hasRefresh()?'Connected (renewal available)':'Not connected';
  return (sessionStorage.getItem(statusKey)==='verified'?'Connected (verified)':'Connected (not yet verified)')+suffix;
 };
 async function testConnection(){if(!connected())throw Error('Connect Dropbox first');try{await call(API+'/files/list_folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'',limit:1})});setStatus('verified');return true}catch(e){if(e.status===401)setStatus('expired');throw e}}

 // Public OAuth client identifier. Set once when the user provides their App Key.
 // It is safe to publish the App Key; never include the App Secret or OAuth tokens.
 const SHARED_APP_KEY='phqesvo0v3jix2w';
 const configKey='studio-dropbox-public-key';
 const EXPECTED_REDIRECT='https://sarahbacay-ui.github.io/sarahs-stitched-gifts-studio/';
 const redirect=()=>EXPECTED_REDIRECT;
 function verifyHost(){if(location.href.split(/[?#]/)[0]!==EXPECTED_REDIRECT)throw Error('Dropbox login requires the approved HTTPS website address. Current page: '+location.origin+location.pathname+'. Do not attempt login from a local file or preview URL.')}
 const appKey=()=>SHARED_APP_KEY||localStorage.getItem(configKey)||'';
 const random=()=>{const a=new Uint8Array(32);crypto.getRandomValues(a);return b64(a)};
 const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 async function sha256(s){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))}
 function setKey(key){if(SHARED_APP_KEY)throw Error('App Key is managed by Sarah\'s Studio and does not need to be entered on this device');if(!/^[A-Za-z0-9]{8,80}$/.test(key))throw Error('Invalid Dropbox app key');if(appKey()&&appKey()!==key)disconnect();localStorage.setItem(configKey,key)}
 async function connect(){verifyHost();if(!appKey())throw Error('Enter a Dropbox App Key first');const verifier=random(),state=random();sessionStorage.setItem('studio-db-pkce',JSON.stringify({verifier,state,at:Date.now()}));const url=new URL('https://www.dropbox.com/oauth2/authorize');url.search=new URLSearchParams({client_id:appKey(),response_type:'code',token_access_type:'offline',redirect_uri:redirect(),code_challenge:await sha256(verifier),code_challenge_method:'S256',state}).toString();location.assign(url.href)}
 async function callback(){const u=new URL(location.href),code=u.searchParams.get('code'),error=u.searchParams.get('error');if(!code&&!error)return false;verifyHost();history.replaceState(null,'',redirect());if(error)throw Error('Dropbox authorization declined: '+error);const pending=JSON.parse(sessionStorage.getItem('studio-db-pkce')||'null');sessionStorage.removeItem('studio-db-pkce');if(!pending||pending.state!==u.searchParams.get('state')||Date.now()-pending.at>600000)throw Error('Invalid or expired Dropbox authorization');const form=new URLSearchParams({code,grant_type:'authorization_code',client_id:appKey(),redirect_uri:redirect(),code_verifier:pending.verifier});const r=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});const data=await r.json();if(!r.ok)throw Error(data.error_description||'Authorization failed');if(!data.access_token||!data.refresh_token)throw Error('Dropbox did not provide a refresh token. Reconnect and approve offline access.');
 token=data.access_token;expiresAt=Date.now()+Number(data.expires_in||14400)*1000;
 sessionStorage.setItem(tokenKey,token);sessionStorage.setItem(expiryKey,String(expiresAt));localStorage.setItem(refreshKey,data.refresh_token);
 setStatus('pending');sessionStorage.setItem('studio-db-login-notice','Dropbox authorization completed. Use Test Connection to verify access.');return true}
 function connected(){token=token||sessionStorage.getItem(tokenKey);expiresAt=expiresAt||Number(sessionStorage.getItem(expiryKey)||0);return !!(token||hasRefresh())}
 function disconnect(){token=null;expiresAt=0;refreshing=null;revision=null;baseChecksum=null;sessionStorage.removeItem(tokenKey);sessionStorage.removeItem(expiryKey);localStorage.removeItem(refreshKey);setStatus('disconnected')}
 async function refreshAccess(){
  if(refreshing)return refreshing;
  const stored=localStorage.getItem(refreshKey);
  if(!stored)throw Error('Dropbox authorization expired. Please connect again to enable automatic renewal.');
  refreshing=(async()=>{
   const form=new URLSearchParams({grant_type:'refresh_token',refresh_token:stored,client_id:appKey()});
   let response;
   try{response=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form})}catch(e){throw Error('Cannot reach Dropbox to renew authorization. Check your internet connection.')}
   const data=await response.json();
   if(!response.ok){
    if(response.status===400||response.status===401){disconnect();setStatus('expired');throw Error('Dropbox authorization expired or was revoked. Please connect again.')}
    throw Error(data.error_description||data.error||'Dropbox renewal failed');
   }
   if(!data.access_token)throw Error('Dropbox renewal response did not contain an access token');
   token=data.access_token;expiresAt=Date.now()+Number(data.expires_in||14400)*1000;
   sessionStorage.setItem(tokenKey,token);sessionStorage.setItem(expiryKey,String(expiresAt));
   if(data.refresh_token)localStorage.setItem(refreshKey,data.refresh_token);
   return token;
  })();
  try{return await refreshing}finally{refreshing=null}
 }
 async function accessToken(force=false){
  if(!connected())throw Error('Connect Dropbox first');
  if(force||!token||(expiresAt>0&&Date.now()>=expiresAt-60000)){
   if(hasRefresh())return refreshAccess();
   if(!token)throw Error('Dropbox authorization expired. Please connect again.');
  }
  return token;
 }
 async function call(url,opts={}){
  let access=await accessToken();
  let response=await fetch(url,{...opts,headers:{Authorization:'Bearer '+access,...opts.headers}});
  if(response.status===401&&hasRefresh()){
   access=await accessToken(true);
   response=await fetch(url,{...opts,headers:{Authorization:'Bearer '+access,...opts.headers}});
  }
  if(!response.ok){
   if(response.status===401){disconnect();setStatus('expired')}
   const message=await response.text();const err=Error('Dropbox request failed ('+response.status+'): '+message.slice(0,240));err.status=response.status;throw err;
  }
  return response;
 }
 async function metadata(path){try{return await(await call(API+'/files/get_metadata',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})})).json()}catch(e){if(e.status===409)return null;throw e}}
 async function download(path){const r=await call(CONTENT+'/files/download',{method:'POST',headers:{'Dropbox-API-Arg':JSON.stringify({path})}});return await r.json()}
 async function upload(path,doc,rev){const mode=rev?{'.tag':'update',update:rev}:{'.tag':'add'};return await(await call(CONTENT+'/files/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','Dropbox-API-Arg':JSON.stringify({path,mode,autorename:false,mute:true})},body:JSON.stringify(doc)})).json()}
 async function downloadSharedLink(url){
  if(!connected())throw Error('Dropbox connection is not active in this browser.');
  const u=new URL(url);
  if(u.protocol!=='https:'||!(u.hostname==='dropbox.com'||u.hostname.endsWith('.dropbox.com')))throw Error('Invalid Dropbox file link');
  const response=await call(CONTENT+'/sharing/get_shared_link_file',{method:'POST',headers:{'Dropbox-API-Arg':JSON.stringify({url})}});
  return new Uint8Array(await response.arrayBuffer());
 }
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
 return {setKey,appKey,connect,callback,connected,disconnect,synchronize,downloadSharedLink,status,testConnection};
})();
