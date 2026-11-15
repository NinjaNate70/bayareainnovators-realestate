import { Suspense } from "react";
import { Signup } from "@/components/auth/signup";
export default function SignupPage(){return <Suspense fallback={<main className="protected-screen">Opening sign up…</main>}><Signup/></Suspense>;}
