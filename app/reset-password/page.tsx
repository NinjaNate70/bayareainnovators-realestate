import { Suspense } from "react";
import { ResetPassword } from "@/components/auth/recovery";
export default function ResetPasswordPage(){return <Suspense fallback={<main className="protected-screen">Opening password reset…</main>}><ResetPassword/></Suspense>;}
