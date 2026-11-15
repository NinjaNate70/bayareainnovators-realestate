import type { StorageClient } from "../storage/client";
import { db, now } from "./database";
import { fail, requireSession, result } from "./core";
const urls=new Map<string,ReturnType<typeof setTimeout>>();
async function authorize(path:string){const {row,user}=await requireSession();const parts=path.split("/");if(parts.length!==3||parts.some(p=>!p||p==="."||p===".."||/[\\%\u0000-\u001f]/.test(p))||parts[0]!==user.id)fail("not_found","This file is unavailable.");const c=await db.cases.get(parts[1]);if(!c||c.user_id!==user.id)fail("not_found","This file is unavailable.");return {row,user,caseId:parts[1]};}
async function validateBlob(blob:Blob,bucket:string){
  if(blob.size===0||blob.size>10*1024*1024)fail("file_size","Choose a file larger than zero and no larger than 10MB.");
  const header=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  const png=header[0]===137&&header[1]===80&&header[2]===78&&header[3]===71;
  const jpg=header[0]===255&&header[1]===216&&header[2]===255;
  const pdf=String.fromCharCode(...header.slice(0,5))==="%PDF-";
  if(!((blob.type==="image/png"&&png)||(blob.type==="image/jpeg"&&jpg)||(bucket==="documents"&&blob.type==="application/pdf"&&pdf)))fail("file_type","Choose a valid JPG or PNG photo, or a PDF for a document.");
}
const tables=[db.users,db.sessions,db.files,db.cases];
export const localStorageClient:StorageClient={
  revokeUrls(){for(const [url,timer]of urls){clearTimeout(timer);URL.revokeObjectURL(url);}urls.clear();},
  from(bucket){return {
    upload:(path,file,options)=>result(async()=>{
      const initial=await authorize(path);await validateBlob(file,bucket);
      return db.transaction("rw",tables,async()=>{const {user}=await authorize(path);if(user.id!==initial.user.id)fail("signed_out","Sign in to keep going.");const old=await db.files.where("[bucket+path]").equals([bucket,path]).first();if(old&&!options?.upsert)fail("exists","A file already uses this name. Choose a different name.");const id=old?.id??crypto.randomUUID();await db.files.put({id,user_id:user.id,case_id:initial.caseId,bucket,path,mime_type:file.type,size:file.size,blob:file,original_name:"name"in file?String(file.name):path.split("/").pop()!,created_at:old?.created_at??now()});return {id,path,fullPath:`${bucket}/${path}`};});
    }),
    download:(path)=>result(()=>db.transaction("r",tables,async()=>{await authorize(path);const file=await db.files.where("[bucket+path]").equals([bucket,path]).first();if(!file) return fail("not_found","This file is unavailable.");return file.blob;})),
    remove:(paths)=>result(()=>db.transaction("rw",tables,async()=>{const removed=[];for(const path of paths){await authorize(path);const file=await db.files.where("[bucket+path]").equals([bucket,path]).first();if(file){await db.files.delete(file.id);const {blob,...metadata}=file;void blob;removed.push(metadata);}}return removed;})),
    list:(prefix)=>result(()=>db.transaction("r",tables,async()=>{const {user}=await requireSession();if(!prefix.startsWith(`${user.id}/`))fail("not_found","This file is unavailable.");const files=await db.files.where("user_id").equals(user.id).filter(f=>f.bucket===bucket&&f.path.startsWith(prefix)).toArray();return files.map(({blob,...metadata})=>{void blob;return metadata;});})),
    createSignedUrl:(path,expiresIn=60)=>result(async()=>{const r=await localStorageClient.from(bucket).download(path);if(r.error||!r.data)return fail(r.error?.code??"not_found",r.error?.message??"This file is unavailable.");await authorize(path);const signedUrl=URL.createObjectURL(r.data);urls.set(signedUrl,setTimeout(()=>{URL.revokeObjectURL(signedUrl);urls.delete(signedUrl);},Math.min(3600,Math.max(1,expiresIn))*1000));return {signedUrl};}),
  };},
};
