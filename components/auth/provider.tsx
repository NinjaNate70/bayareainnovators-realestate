"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import type { Session } from "@/types/backend";
import { getBackend } from "@/lib/backend";
import { retainBuffers, setDraftIdentity } from "@/lib/auth/drafts";
import { Button } from "@/components/ui/button";
type State = "loading" | "signed_out" | "signed_in" | "expired" | "error";
const AuthContext = createContext<{
  session: Session | null;
  state: State;
  error: string;
  notice: string;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}>({
  session: null,
  state: "loading",
  error: "",
  notice: "",
  notify: () => {},
  refresh: async () => {},
  signOut: async () => {},
});
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [state, setState] = useState<State>("loading"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const last = useRef<Session | null>(null),
    explicit = useRef(false),
    router = useRouter();
  const expire = useCallback(async () => {
    const previous = last.current;
    getBackend().storage.revokeUrls();
    setSession(null);
    setState(previous ? "expired" : "signed_out");
    if (previous) {
      try {
        await retainBuffers(previous);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Keep this tab open. Your changes are still here.",
        );
      }
    }
  }, []);
  const refresh = useCallback(async () => {
    const r = await getBackend().auth.getSession();
    if (r.error) {
      setState("error");
      setError(r.error.message);
      return;
    }
    if (r.data?.session) {
      if (last.current && last.current.user.id !== r.data.session.user.id) {
        setState("loading");
        getBackend().storage.revokeUrls();
        try {
          await retainBuffers(last.current);
        } catch {
          /* The original owner's memory buffer remains available in this tab. */
        }
      }
      last.current = r.data.session;
      setDraftIdentity(r.data.session);
      setSession(r.data.session);
      setState("signed_in");
      setError("");
    } else if (!explicit.current) await expire();
  }, [expire]);
  useEffect(() => {
    let alive = true;
    let subscription: { unsubscribe(): void } | undefined;
    void (async () => {
      try {
        const backend = getBackend();
        const r = await backend.auth.initialize();
        if (!alive) return;
        if (r.error) {
          setState("error");
          setError(r.error.message);
          return;
        }
        subscription = backend.auth.onAuthStateChange((event, newSession) => {
          if (!alive) return;
          if (event === "SIGNED_OUT") {
            last.current = null;
            setDraftIdentity(null);
            setSession(null);
            setState("signed_out");
            backend.storage.revokeUrls();
          } else if (event === "SESSION_EXPIRED") void expire();
          else if (newSession) {
            setNotice("");
            if (last.current && last.current.user.id !== newSession.user.id)
              backend.storage.revokeUrls();
            last.current = newSession;
            setDraftIdentity(newSession);
            setSession(newSession);
            setState("signed_in");
            setError("");
          }
        }).data.subscription;
        await refresh();
      } catch (e) {
        if (alive) {
          setState("error");
          setError(
            e instanceof Error ? e.message : "Unable to open browser storage.",
          );
        }
      }
    })();
    const check = () => {
      if (alive && !explicit.current) void refresh();
    };
    const interval = setInterval(check, 5000);
    window.addEventListener("storage", check);
    window.addEventListener("focus", check);
    const visible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      subscription?.unsubscribe();
      clearInterval(interval);
      window.removeEventListener("storage", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [expire, refresh]);
  const signOut = async () => {
    if (last.current) await retainBuffers(last.current);
    explicit.current = true;
    try {
      const r = await getBackend().auth.signOut({ scope: "local" });
      if (r.error) throw new Error(r.error.message);
      last.current = null;
      setDraftIdentity(null);
      setSession(null);
      setState("signed_out");
      setNotice("You're signed out. Your saved cases remain in this browser.");
      router.push("/login");
    } finally {
      explicit.current = false;
    }
  };
  return (
    <AuthContext.Provider
      value={{
        session,
        state,
        error,
        notice,
        notify: setNotice,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { state, error, refresh, session } = useAuth(),
    path = usePathname(),
    router = useRouter();
  const [target, setTarget] = useState(path);
  useEffect(() => {
    const url = location.pathname + location.search + location.hash;
    queueMicrotask(() => setTarget(url));
    if (state === "signed_out")
      router.replace(`/login?returnTo=${encodeURIComponent(url)}`);
  }, [path, state, router]);
  if (state === "signed_in" && session)
    return <div key={session.user.id}>{children}</div>;
  return (
    <main className="protected-screen">
      <div className="auth-status-icon">
        <ShieldCheck aria-hidden="true" />
      </div>
      <h1>
        {state === "expired"
          ? "Sign in to keep going"
          : state === "error"
            ? "We couldn't open your account"
            : "Opening your account…"}
      </h1>
      {state === "expired" ? (
        <>
          <p>
            Your place is kept in this browser. Sign in to return to your case.
          </p>
          {error && (
            <p className="notice" role="alert">
              {error} Keep this tab open.
            </p>
          )}
          <Button asChild>
            <Link href={`/login?returnTo=${encodeURIComponent(target)}`}>
              Sign in to keep going
            </Link>
          </Button>
        </>
      ) : state === "error" ? (
        <>
          <p role="alert">{error}</p>
          <Button onClick={() => void refresh()}>Try again</Button>
        </>
      ) : (
        <LoaderCircle className="spin" aria-label="Opening your account" />
      )}
    </main>
  );
}
