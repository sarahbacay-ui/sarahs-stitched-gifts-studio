// IndexedDB persistence. A single atomic snapshot avoids partial cross-store updates.
const StudioDB=(()=>{const DB='sarah-stitched-studio',STORE='snapshots';let dbPromise;
function open(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(Error('IndexedDB is unavailable'));const req=indexedDB.open(DB,2);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return dbPromise}
async function get(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function put(data){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(data,'current');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
return {get,put}})();
