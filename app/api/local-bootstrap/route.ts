import { hashPassword, iterations, randomSalt } from "@/lib/local/crypto";
export const dynamic="force-dynamic";
let verifier:Promise<{salt:string;password_hash:string}>|undefined;
export async function GET(){
  if((process.env.NEXT_PUBLIC_BACKEND??"local")!=="local")return Response.json({error:"Local mode is disabled."},{status:404});
  const password=process.env.DEMO_PASSWORD;
  if(!password)return Response.json({error:"The demo account isn't ready. Please contact the team."},{status:503});
  verifier??=(async()=>{const salt=randomSalt();return {salt,password_hash:await hashPassword(password,salt)};})();
  const body={...await verifier,iterations,email:"demo@tenantshield.app",...(process.env.NODE_ENV==="development"?{demo_password:password}:{})};
  // The verifier is intentionally public in browser-only demo auth. Never use it as server authorization.
  return Response.json(body,{headers:{"Cache-Control":"no-store"}});
}
