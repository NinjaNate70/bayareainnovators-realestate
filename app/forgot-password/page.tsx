import { Suspense } from "react";
import { ForgotPassword } from "@/components/auth/recovery";
export default function ForgotPasswordPage(){return <Suspense fallback={<main className="protected-screen">Opening password help…</main>}><ForgotPassword/></Suspense>;}
