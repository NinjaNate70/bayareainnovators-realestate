import type { AuthEvent, Result, Session, User } from "../../types/backend";
import { db, now, type UserRow } from "./database";
export const sessionKey="tenant-shield:session";
export class LocalError extends Error {constructor(public code:string,message:string,public retry_after_seconds?:number){super(message);}}
export const fail=(code:string,message:string,wait?:number):never=>{throw new LocalError(code,message,wait);};
export async function result<T>(fn:()=>Promise<T>):Promise<Result<T>> {try{return {data:await fn(),error:null};}catch(e){return {data:null,error:e instanceof LocalError?{code:e.code,message:e.message,retry_after_seconds:e.retry_after_seconds}:{code:"storage_error",message:"We couldn't save your changes in this browser. Allow site storage or free up space, then try again. Keep this tab open."}};}}
export function publicUser(row:UserRow):User{return {id:row.id,email:row.email,aud:"authenticated",role:"authenticated",created_at:row.created_at,updated_at:row.updated_at,email_confirmed_at:row.email_verified_at??undefined,confirmed_at:row.email_verified_at??undefined,user_metadata:{name:row.name},app_metadata:{provider:"email"}};}
export const listeners=new Set<(event:AuthEvent,session:Session|null)=>void>();
export function emit(event:AuthEvent,session:Session|null){listeners.forEach(fn=>queueMicrotask(()=>fn(event,session)));}
export async function requireSession(token=localStorage.getItem(sessionKey),allowExpired=false){
  const row=token?await db.sessions.get(token):null;
  if(!row || row.mode!=="normal") return fail("signed_out","Sign in to keep going.");
  const user=await db.users.get(row.user_id);
  if(!user || !user.email_verified_at || row.password_version!==user.password_version) return fail("signed_out","Sign in to keep going.");
  if(!allowExpired && row.expires_at<=now()){emit("SESSION_EXPIRED",null);return fail("session_expired","Sign in to keep going.");}
  return {row,user};
}
export function publicSession(row:{access_token:string;expires_at:string},user:UserRow):Session{return {access_token:row.access_token,token_type:"bearer",expires_at:Date.parse(row.expires_at)/1000,expires_in:Math.max(0,Math.ceil((Date.parse(row.expires_at)-Date.now())/1000)),refresh_token:"",user:publicUser(user)};}
