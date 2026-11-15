import type { Evidence, RentalCase } from "@/types/case";
import { getBackend } from "@/lib/backend";
import { fromRow, toRow } from "@/lib/db/mapping";
import { bufferedCase, markSaved, rememberCase, restorePosition } from "@/lib/auth/drafts";
import type { Result } from "@/types/backend";
export const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
export function freshCase():RentalCase{return {id:crypto.randomUUID(),demo:false,address:"",renter:"",landlord:"",moveOut:"",received:"",deposit:0,returned:0,charges:[],evidence:[],completedStep:0,audited:false,stale:false,letter:"",replyBy:"",incoming:"",reply:""};}
export function unwrap<T>(response:Result<T>):T {if(response.error)throw new Error(response.error.message);return response.data as T;}
const queues=new Map<string,Promise<unknown>>();
export async function readCase(id:string):Promise<RentalCase|null>{
  const backend=getBackend(),row=unwrap(await backend.data.getCase(id));if(!row)return null;
  const checkpoint=bufferedCase(row.id,row.user_id)??unwrap(await backend.data.getDraft(row.id));
  if(checkpoint && "charges" in checkpoint.payload){restorePosition(checkpoint);return structuredClone(checkpoint.payload);}
  return fromRow(row);
}
export function saveCase(value:RentalCase):Promise<void>{
  rememberCase(value);const snapshot=structuredClone(value);
  const previous=queues.get(value.id)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
    const backend=getBackend(),old=unwrap(await backend.data.getCase(snapshot.id)),input=toRow(snapshot,old??undefined);
    const row=old?unwrap(await backend.data.updateCase(snapshot.id,input,old.revision)):unwrap(await backend.data.createCase(input));
    const buffer=bufferedCase(snapshot.id,row.user_id);
    if(buffer&&JSON.stringify(buffer.payload)===JSON.stringify(snapshot)){markSaved(snapshot.id,row.user_id);unwrap(await backend.data.clearDraft(snapshot.id));}
  });
  queues.set(value.id,next);void next.finally(()=>{if(queues.get(value.id)===next)queues.delete(value.id);}).catch(()=>{});return next;
}
export async function flushCases(){await Promise.all([...queues.values()]);}
export async function storeFile(caseId:string,sourceId:string,file:File):Promise<Pick<Evidence,"fileId"|"path"|"bucket">>{
  const backend=getBackend(),session=unwrap(await backend.auth.getSession()).session;if(!session)throw new Error("Sign in to keep going.");
  await flushCases();
  const bucket=file.type.startsWith("image/")&&sourceId.startsWith("P")?"photos":"documents";
  const filename=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100)||"original";
  const path=`${session.user.id}/${caseId}/${crypto.randomUUID()}-${filename}`;
  const metadata=unwrap(await backend.storage.from(bucket).upload(path,file));return {fileId:metadata.id,path,bucket};
}
export async function getFile(caseId:string,evidence:Evidence):Promise<string>{
  if(!evidence.path||!evidence.bucket)throw new Error("Original unavailable in this browser. Please add the file again.");
  const backend=getBackend();unwrap(await backend.data.getCase(caseId));return unwrap(await backend.storage.from(evidence.bucket).createSignedUrl(evidence.path,300)).signedUrl;
}
