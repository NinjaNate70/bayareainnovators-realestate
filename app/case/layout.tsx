import { ProtectedRoute } from "@/components/auth/provider";
export default function CaseLayout({children}:{children:React.ReactNode}){return <ProtectedRoute>{children}</ProtectedRoute>;}
