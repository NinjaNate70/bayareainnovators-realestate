import type { DataClient, CaseInput } from "../db/client";
import { db, now } from "./database";
import { fail, requireSession, result } from "./core";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateCase(input:CaseInput){
  if(!input||!uuid.test(input.id)||!Array.isArray(input.charges)||!Array.isArray(input.evidence)||input.charges.length>200||input.evidence.length>200)return fail("validation","This case couldn't be saved. Check the case details.");
  for(const key of ["address","renter_name","landlord_name","move_out_date","letter_received_date","letter_text","reply_by_date","incoming_text","reply_text"] as const)if(typeof input[key]!=="string"||input[key].length>200_000)fail("validation","Case text is too long or invalid.");
  for(const n of [input.deposit_cents,input.returned_cents,...input.charges.flatMap(c=>[c.amount_cents,c.low_cents,c.high_cents])])if(!Number.isSafeInteger(n)||n<0||n>100_000_000)fail("validation","Enter valid amounts for this case.");
  if(!Number.isInteger(input.completed_step)||input.completed_step<0||input.completed_step>4)fail("validation","The case step is invalid.");
}
const tables=[db.users,db.sessions,db.cases,db.drafts,db.files];
async function resolveCase(id:string,userId:string){
  if(id==="demo")return db.cases.where("user_id").equals(userId).filter(c=>c.is_demo).first();
  const row=await db.cases.get(id);return row?.user_id===userId?row:undefined;
}
export const localData:DataClient={
  listCases:()=>result(()=>db.transaction("r",tables,async()=>{const {user}=await requireSession();return (await db.cases.where("user_id").equals(user.id).toArray()).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id));})),
  getCase:(id)=>result(()=>db.transaction("r",tables,async()=>{const {user}=await requireSession();return await resolveCase(id,user.id)??null;})),
  getMostRecentCase:()=>result(async()=>{const response=await localData.listCases();if(response.error)fail(response.error.code,response.error.message);return response.data?.[0]??null;}),
  createCase:(input)=>result(()=>db.transaction("rw",tables,async()=>{validateCase(input);const {user}=await requireSession();const row={...input,user_id:user.id,created_at:now(),updated_at:now(),revision:1};await db.cases.add(row);return row;})),
  updateCase:(id,input,expectedRevision)=>result(()=>db.transaction("rw",tables,async()=>{validateCase(input);const {user}=await requireSession();const row=await resolveCase(id,user.id);if(!row||input.id!==row.id)return fail("not_found","This case is unavailable.");if(expectedRevision!==undefined&&row.revision!==expectedRevision)fail("conflict","This case changed in another tab. Your draft is retained; reload to review both versions.");const updated={...input,user_id:user.id,created_at:row.created_at,updated_at:now(),revision:row.revision+1};await db.cases.put(updated);return updated;})),
  deleteCase:(id)=>result(()=>db.transaction("rw",tables,async()=>{const {user}=await requireSession();const row=await resolveCase(id,user.id);if(!row)fail("not_found","This case is unavailable.");await db.files.where("[user_id+case_id]").equals([user.id,id]).delete();await db.drafts.where("[user_id+draft_key]").equals([user.id,id]).delete();await db.cases.delete(id);return null;})),
  saveDraft:(checkpoint)=>result(()=>db.transaction("rw",tables,async()=>{const {user}=await requireSession();if(checkpoint.user_id!==user.id)fail("forbidden","This draft belongs to a different account.");if(checkpoint.case_id&&!await resolveCase(checkpoint.case_id,user.id))fail("not_found","This case is unavailable.");const previous=await db.drafts.where("[user_id+draft_key]").equals([user.id,checkpoint.draft_key]).first();const row={...checkpoint,id:previous?.id??checkpoint.id};await db.drafts.put(row);return row;})),
  getDraft:(key)=>result(()=>db.transaction("r",tables,async()=>{const {user}=await requireSession();return await db.drafts.where("[user_id+draft_key]").equals([user.id,key]).first()??null;})),
  clearDraft:(key)=>result(()=>db.transaction("rw",tables,async()=>{const {user}=await requireSession();await db.drafts.where("[user_id+draft_key]").equals([user.id,key]).delete();return null;})),
  listDrafts:()=>result(()=>db.transaction("r",tables,async()=>{const {user}=await requireSession();return db.drafts.where("user_id").equals(user.id).toArray();})),
  legacyStatus:()=>result(async()=>{await requireSession();return db.legacy_archive.filter(a=>!a.owner_user_id).count();}),
  importLegacy:()=>result(async()=>{const {importLegacy}=await import("./legacy");return importLegacy();}),
};
