import { Suspense } from "react";
import { Login } from "@/components/auth/login";
export default function LoginPage(){return <Suspense fallback={<main className="protected-screen">Opening sign in…</main>}><Login/></Suspense>;}
