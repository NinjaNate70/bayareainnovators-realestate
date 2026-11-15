"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { useRouter,useSearchParams } from "next/navigation";
import { ArrowRight,Check,Link2Off,LoaderCircle } from "lucide-react";
import { getBackend } from "@/lib/backend";
import { passwordError,validEmail } from "@/lib/auth/validation";
import { AuthFrame } from "./frame";
import { EmailConfirmation } from "./email";
import { Field,FormError,PasswordField,Requirements,SubmitButton,useAuthForm } from "./form";
import { Button } from "@/components/ui/button";
export function ForgotPassword(){
  const search=useSearchParams(),router=useRouter();
  const form=useAuthForm(v=>({email:!v.email?"Enter your email address.":!validEmail(v.email.trim())?"Enter an email address like name@example.com.":""}));
  const flow=search.get("flow");if(flow)return <EmailConfirmation key={flow} flowId={flow} reset/>;
  async function request(){const r=await getBackend().auth.resetPasswordForEmail(form.values.email);if(r.error){form.responseError(r.error);return;}router.push(`/forgot-password?flow=${r.data?.flow_id}`);}
  return <AuthFrame title="Let's get you back in." description="Enter your email to request a password reset link."><form ref={form.ref} className="auth-form" noValidate aria-busy={form.busy} onSubmit={e=>void form.submit(e,request)}><FormError message={form.error}/><Field label="Email" id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={form.values.email??""} onChange={e=>form.setValue("email",e.target.value)} onBlur={()=>form.blur("email")} error={form.errors.email}/><SubmitButton busy={form.busy} wait={form.wait} loading="Sending reset link…">Send reset link <ArrowRight size={18} aria-hidden="true"/></SubmitButton></form><p className="auth-switch"><Link href="/login">Back to sign in</Link></p></AuthFrame>;
}
export function ResetPassword(){
  const search=useSearchParams(),token=search.get("token")??"";
  const [validation,setValidation]=useState<"loading"|"valid"|"invalid">("loading"),[success,setSuccess]=useState(false);
  const form=useAuthForm(v=>({password:passwordError(v.password??""),confirm:!v.confirm?"Confirm your new password.":v.confirm!==v.password?"Your passwords don't match. Enter the same password in both fields.":""}));
  useEffect(()=>{let alive=true;void getBackend().auth.verifyEmail({token,type:"recovery"}).then(r=>{if(alive)setValidation(r.error?"invalid":"valid");});return()=>{alive=false;};},[token]);
  async function reset(){const r=await getBackend().auth.updateUser({password:form.values.password},{token});if(r.error){form.responseError(r.error);if(r.error.code==="invalid_token")setValidation("invalid");return;}setSuccess(true);form.setValues({});history.replaceState(null,"","/reset-password");}
  const invalid=validation==="invalid";
  return <AuthFrame title={success?"Your password is updated.":invalid?"This link can't be used.":"Choose a new password."} description={success?"Sign in with your new password to return to your case.":invalid?"This link has expired or can't be used. Request a new one.":"A fresh start, with your case right where you left it."}>{success?<div className="stack"><div className="auth-status-icon"><Check aria-hidden="true"/></div><p role="status">Your password was saved. Your previous sessions have ended.</p><Button asChild><Link href="/login">Sign in <ArrowRight size={18} aria-hidden="true"/></Link></Button></div>:validation==="loading"?<p role="status"><LoaderCircle className="spin" size={20} aria-hidden="true"/> Checking your link…</p>:invalid?<div className="stack"><div className="auth-status-icon"><Link2Off aria-hidden="true"/></div><Button asChild><Link href="/forgot-password">Send a new link</Link></Button></div>:<form ref={form.ref} className="auth-form" noValidate aria-busy={form.busy} onSubmit={e=>void form.submit(e,reset)}><FormError message={form.error}/><PasswordField label="New password" id="password" name="password" autoComplete="new-password" value={form.values.password??""} onChange={e=>form.setValue("password",e.target.value)} onBlur={()=>form.blur("password")} error={form.errors.password}/><Requirements password={form.values.password??""}/><PasswordField label="Confirm new password" id="confirm" name="confirm" autoComplete="new-password" value={form.values.confirm??""} onChange={e=>form.setValue("confirm",e.target.value)} onBlur={()=>form.blur("confirm")} error={form.errors.confirm}/><SubmitButton busy={form.busy} wait={form.wait} loading="Saving password…">Save new password</SubmitButton></form>}{!success&&<p className="auth-switch"><Link href="/login">Back to sign in</Link></p>}</AuthFrame>;
}
