import type { RentalCase } from "../../types/case";
import { db, now } from "./database";
import { requireSession } from "./core";
import { toRow } from "../db/mapping";
function readOldFiles():Promise<{key:string;blob:Blob}[]> {
  return new Promise((resolve,reject)=>{const request=indexedDB.open("tenant-shield-evidence");request.onerror=()=>reject(request.error);request.onsuccess=()=>{const old=request.result;if(!old.objectStoreNames.contains("files")){old.close();resolve([]);return;}const rows:{key:string;blob:Blob}[]=[];const transaction=old.transaction("files");const cursor=transaction.objectStore("files").openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(c.value instanceof Blob)rows.push({key:String(c.key),blob:c.value});c.continue();}};transaction.oncomplete=()=>{old.close();resolve(rows);};transaction.onerror=()=>{old.close();reject(transaction.error);};};});
}
export async function archiveLegacy(){
  const keys=Object.keys(localStorage).filter(k=>k.startsWith("tenant-shield:")&&!['tenant-shield:session','tenant-shield:current','tenant-shield:wizard'].includes(k));
  if(!keys.length)return;
  const originals=await readOldFiles();
  for(const key of keys){if(await db.legacy_archive.where("migration_key").equals(key).count())continue;try{const payload=JSON.parse(localStorage.getItem(key)??"null");if(!payload||!Array.isArray(payload.charges)||!Array.isArray(payload.evidence))continue;await db.legacy_archive.add({id:crypto.randomUUID(),migration_key:key,payload,original_blob_records:originals.filter(f=>f.key.startsWith(`${payload.id}:`)),imported_case_ids:[],created_at:now()});}catch(e){if(e instanceof SyntaxError)continue;throw e;}}
  // Keep every original key and blob intact. Explicit import never clears the old database.
}
export async function importLegacy(){
  return db.transaction("rw",db.users,db.sessions,db.cases,db.files,db.legacy_archive,async()=>{
    const {user}=await requireSession();let count=0;
    for(const archive of await db.legacy_archive.filter(a=>!a.owner_user_id).toArray()){
      const value=structuredClone(archive.payload) as RentalCase;const oldId=value.id;value.id=crypto.randomUUID();
      for(const evidence of value.evidence){delete evidence.url;const original=archive.original_blob_records.find(f=>f.key===`${oldId}:${evidence.id}`);if(!original)continue;const id=crypto.randomUUID(),bucket=evidence.kind==="before"||evidence.kind==="after"?"photos":"documents",path=`${user.id}/${value.id}/${id}-original`;await db.files.add({id,user_id:user.id,case_id:value.id,bucket,path,mime_type:original.blob.type,size:original.blob.size,blob:original.blob,original_name:evidence.name,created_at:now()});evidence.fileId=id;evidence.path=path;evidence.bucket=bucket;}
      const row=toRow(value);await db.cases.add({...row,user_id:user.id,created_at:now(),updated_at:now(),revision:1});await db.legacy_archive.update(archive.id,{owner_user_id:user.id,imported_case_ids:[value.id]});count++;
    }return count;
  });
}
