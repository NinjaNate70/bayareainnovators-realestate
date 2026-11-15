import type { Checkpoint, Session } from "../../types/backend";
import type { RentalCase } from "../../types/case";
import { getBackend } from "../backend";
const buffers=new Map<string,Checkpoint>();
let identity:Session|null=null;
export function setDraftIdentity(session:Session|null){identity=session;}
export function rememberCase(value:RentalCase){
  if(!identity)return;
  const key=`${identity.user.id}:${value.id}`,existing=buffers.get(key);
  buffers.set(key,{id:existing?.id??crypto.randomUUID(),user_id:identity.user.id,draft_key:value.id,case_id:value.id,payload:structuredClone(value),route:location.pathname+location.search+location.hash,scroll_y:window.scrollY,focus_id:(document.activeElement as HTMLElement|null)?.id??"",updated_at:new Date().toISOString()});
}
export function bufferedCase(id:string,userId:string){return buffers.get(`${userId}:${id}`);}
export function markSaved(id:string,userId:string){buffers.delete(`${userId}:${id}`);}
export async function retainBuffers(session:Session){
  const drafts=[...buffers.values()].filter(d=>d.user_id===session.user.id);
  for(const draft of drafts){draft.route=location.pathname+location.search+location.hash;draft.scroll_y=window.scrollY;draft.focus_id=(document.activeElement as HTMLElement|null)?.id??draft.focus_id;
    const r=await getBackend().auth.retainDraft(draft,session.access_token);if(r.error)throw new Error(r.error.message);
  }return drafts;
}
export async function recoveryDestination(session:Session,returnTo?:string|null){
  const {safeReturnTo}=await import("./validation");
  const drafts=await getBackend().data.listDrafts();if(drafts.error)throw new Error(drafts.error.message);
  const memory=[...buffers.values()].filter(d=>d.user_id===session.user.id);
  const checkpoint=[...(drafts.data??[]),...memory].sort((a,b)=>b.updated_at.localeCompare(a.updated_at))[0];
  if(checkpoint&&safeReturnTo(checkpoint.route))return checkpoint.route;
  const target=safeReturnTo(returnTo);if(target)return target;
  const recent=await getBackend().data.getMostRecentCase();if(recent.error)throw new Error(recent.error.message);
  return recent.data?`/case/${recent.data.id}`:"/case/new";
}
export function restorePosition(checkpoint:Checkpoint){setTimeout(()=>{const field=checkpoint.focus_id?document.getElementById(checkpoint.focus_id):null;field?.focus({preventScroll:true});window.scrollTo(0,checkpoint.scroll_y);},200);}
