import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/provider";

export const metadata: Metadata = {
  title: "Tenant Shield | A clearer path to your deposit",
  description:
    "Organize your California rental evidence, review deposit deductions, and prepare your next step. Information, not legal advice.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
