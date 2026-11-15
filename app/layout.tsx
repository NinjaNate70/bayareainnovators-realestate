import type { Metadata } from "next";
import Link from "next/link";
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
      <body>
        <AuthProvider>{children}</AuthProvider>
        <footer className="site-footer">
          <span>Tenant Shield · Bay Innovations</span>
          <nav aria-label="Legal">
            <Link href="/terms" target="_blank" rel="noreferrer">
              Terms of Service
            </Link>
            <Link href="/privacy" target="_blank" rel="noreferrer">
              Privacy Policy
            </Link>
          </nav>
          <span>Information, not legal advice.</span>
        </footer>
      </body>
    </html>
  );
}
