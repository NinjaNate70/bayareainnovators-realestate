"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, FlaskConical } from "lucide-react";
import { AuthFrame, OAuthButton } from "./frame";
import { Field, FormError, PasswordField, SubmitButton, useAuthForm } from "./form";
import { useAuth } from "./provider";
import { getBackend } from "@/lib/backend";
import { validEmail } from "@/lib/auth/validation";
import { recoveryDestination } from "@/lib/auth/drafts";
import { Button } from "@/components/ui/button";
export function Login(){
  const router=useRouter(),search=useSearchParams(),{state,session}=useAuth();
  const form=useAuthForm(v=>({email:!v.email?"Enter your email address.":!validEmail(v.email.trim())?"Enter an email address like name@example.com.":"",password:!v.password?"Enter your password.":""}));
  const [status,setStatus]=useState("");
  useEffect(()=>{if(session)void recoveryDestination(session,search.get("returnTo")).then(path=>router.replace(path)).catch(e=>form.setError(e.message));},[session,search,router]); // eslint-disable-line react-hooks/exhaustive-deps
  async function signIn(){const r=await getBackend().auth.signInWithPassword({email:form.values.email,password:form.values.password});if(r.error){form.responseError(r.error);return;}if(!r.data?.session){router.push(`/check-email?flow=${r.data?.flow_id}`);return;}setStatus("You're signed in. Opening your case…");router.replace(await recoveryDestination(r.data.session,search.get("returnTo")));}
  const signup=`/signup${search.get("returnTo")?`?returnTo=${encodeURIComponent(search.get("returnTo")!)}`:""}`;
  return <AuthFrame title="Welcome back." description="Pick up where you left off."><OAuthButton/><form ref={form.ref} noValidate aria-busy={form.busy} onSubmit={e=>void form.submit(e,signIn)} className="auth-form"><FormError message={form.error}/><Field label="Email" id="email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={form.values.email??""} onChange={e=>form.setValue("email",e.target.value)} onBlur={()=>form.blur("email")} error={form.errors.email}/><PasswordField id="password" name="password" autoComplete="current-password" value={form.values.password??""} onChange={e=>form.setValue("password",e.target.value)} onBlur={()=>form.blur("password")} error={form.errors.password}/><div className="auth-forgot"><Link href="/forgot-password" className="auth-text-link">Forgot password?</Link></div><SubmitButton busy={form.busy} wait={form.wait} loading="Signing in…" disabled={state==="loading"}>Sign in <ArrowRight size={18} aria-hidden="true"/></SubmitButton><p className="sr-only" role="status">{status}</p></form><p className="auth-switch">New here? <Link href={signup}>Create an account</Link></p>{process.env.NODE_ENV==="development"&&<DemoPanel onFill={(email,password)=>form.setValues({email,password})}/>}</AuthFrame>;
}
function DemoPanel({onFill}:{onFill:(email:string,password:string)=>void}){
  const [demo,setDemo]=useState<{email:string;demo_password?:string}|null>(null);
  useEffect(()=>{let alive=true;void fetch("/api/local-bootstrap",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(data=>{if(alive)setDemo(data);}).catch(()=>{});return()=>{alive=false;};},[]);
  return <details className="dev-panel"><summary><FlaskConical size={17} aria-hidden="true"/> Development demo account</summary>{demo?.demo_password?<div className="stack-sm"><p>Use the seeded six-charge example. This account is local to this browser.</p><p className="demo-value">{demo.email}<br/><code>{demo.demo_password}</code></p><Button type="button" variant="outline" onClick={()=>onFill(demo.email,demo.demo_password!)}>Use demo account</Button></div>:<p>The demo account isn't ready. Please contact the team.</p>}</details>;
}
