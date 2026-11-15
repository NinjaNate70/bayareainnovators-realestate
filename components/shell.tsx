"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  FileText,
  FolderOpen,
  Home,
  Images,
  MessageSquare,
  Plus,
  ShieldCheck,
  ArrowUpRight,
  CircleHelp,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CaseTab } from "@/types/case";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/auth/account-menu";
import { useAuth } from "@/components/auth/provider";
import { CaseAssistant } from "@/components/case-assistant";

export function Shell({
  children,
  caseId,
  tab = "audit",
  draftCaseId,
}: {
  children: ReactNode;
  caseId?: string;
  tab?: CaseTab;
  // The case being built in the wizard, so the assistant can read it.
  draftCaseId?: string;
}) {
  const path = usePathname();
  const { session } = useAuth();
  const pageTitle = path === "/case/demo" ? "Demo case"
    : path === "/case/new" ? "New case"
    : path.startsWith("/case/") ? "Case file"
    : path === "/account" ? "Account settings"
    : path === "/documents" ? "Documents"
    : "Home";
  const global = [
    { label: "Home", href: "/", icon: Home },
    { label: "New case", href: "/case/new", icon: Plus },
    { label: "Documents", href: "/documents", icon: FolderOpen },
  ];
  const tabs = [
    { label: "Audit", key: "audit", icon: BookOpen },
    { label: "Photos", key: "photos", icon: Images },
    { label: "Letter", key: "letter", icon: FileText },
    { label: "Replies", key: "replies", icon: MessageSquare },
  ].map((x) => ({ ...x, href: `/case/${caseId}?tab=${x.key}` }));
  const active = (href: string) =>
    href.includes("?tab=") ? href.endsWith(`=${tab}`) : path === href;
  const navLinks = (items: typeof global) =>
    items.map(({ label, href, icon: Icon }) => (
      <Link
        href={href}
        key={href}
        aria-current={active(href) ? "page" : undefined}
        className={active(href) ? "nav-item active" : "nav-item"}
      >
        <Icon size={20} aria-hidden="true" />
        <span>{label}</span>
        {active(href) && <span className="nav-marker" />}
      </Link>
    ));
  return (
    <div className="app-layout">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <Link href="/" className="brand-lockup">
          <span className="brand-symbol">
            <ShieldCheck size={24} aria-hidden="true" />
          </span>
          <span>
            Tenant<span className="brand-green">Shield</span>
            <small>YOUR DEPOSIT. YOUR PEACE OF MIND.</small>
          </span>
        </Link>
        <p className="nav-eyebrow">WORKSPACE</p>
        <nav aria-label="Workspace">{navLinks(global)}</nav>
        {caseId && (
          <>
            <p className="nav-eyebrow">YOUR CASE</p>
            <nav aria-label="Case">{navLinks(tabs)}</nav>
          </>
        )}
        <div className="sidebar-foot">
          <AccountMenu />
          <div className="sidebar-note">
            <ShieldCheck aria-hidden="true" size={22} />
            <strong>A little clarity goes a long way.</strong>
            <p>
              Your evidence, organized.
              <br />
              Your next step, made simpler.
            </p>
          </div>
          <span className="small muted">
            Built for California renters{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </span>
        </div>
      </aside>
      <div className="app-content">
        <header className="app-topbar">
          <Link href="/" className="mobile-brand">
            <ShieldCheck size={22} aria-hidden="true" />
            Tenant Shield
          </Link>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {pageTitle !== "Home" && (
              <>
                <Link href="/">Home</Link>
                <span aria-hidden="true">/</span>
              </>
            )}
            <span aria-current="page">{pageTitle}</span>
          </nav>
          <div className="topbar-end">
            <div className={session ? "mobile-account" : ""}>
              <AccountMenu compact />
            </div>
            <span className="scope-tag">California renters</span>
            <Sheet
              title="A clearer path forward"
              description="How Tenant Shield works"
              trigger={
                <button className="icon-button" aria-label="Get help">
                  <CircleHelp size={21} aria-hidden="true" />
                </button>
              }
            >
              <p>
                Start a case with your deduction letter, confirm the details,
                and add optional move-in and move-out photos.
              </p>
              <p>
                This MVP runs in demo mode. Uploaded files remain in this
                browser; automatic extraction and legal analysis require a
                future backend connection.
              </p>
              <p>
                Information to help you understand your deposit. Not legal
                advice.
              </p>
              <Button asChild variant="outline">
                <Link href="/case/demo">Explore the example case</Link>
              </Button>
            </Sheet>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="page-content" key={path}>
          {children}
        </main>
        {session && caseId !== "demo" && (
          <CaseAssistant
            caseId={caseId ?? draftCaseId}
            page={caseId ? tab : draftCaseId ? "wizard" : "other"}
          />
        )}
      </div>
      <nav
        className="bottom-nav"
        aria-label={caseId ? "Case navigation" : "Workspace navigation"}
      >
        {navLinks(caseId ? tabs : global)}
      </nav>
    </div>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar">{children}</div>;
}
