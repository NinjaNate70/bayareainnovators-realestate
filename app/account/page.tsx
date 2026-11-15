import { ProtectedRoute } from "@/components/auth/provider";
import { AccountSettings } from "@/components/auth/account";
export default function AccountPage(){return <ProtectedRoute><AccountSettings/></ProtectedRoute>;}
