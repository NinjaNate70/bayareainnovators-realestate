import { ProtectedRoute } from "@/components/auth/provider";
export default function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute requireTerms>{children}</ProtectedRoute>;
}
