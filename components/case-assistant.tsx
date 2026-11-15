"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  LoaderCircle,
  MessageCircleQuestionMark,
  SendHorizontal,
} from "lucide-react";
import { getBackend, hosted } from "@/lib/backend";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

type Reply = {
  reply: string;
  agent_label: string;
  reviewed_by: "claude" | "gemini";
  revised: boolean;
  sources: { id: string; title: string }[];
};
type Message =
  | { role: "user"; text: string }
  | ({ role: "assistant"; text: string } & Partial<Omit<Reply, "reply">>);

const suggestions = [
  "What should I do next?",
  "What evidence am I missing?",
  "How long does my landlord have to return my deposit?",
];

// A chat panel on the case screens. Each answer comes from one specialist
// agent and is checked by a reviewer agent before it is shown.
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function CaseAssistant({
  caseId,
  page,
}: {
  caseId?: string;
  page: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);
  // Answers depend on a server-checked sign-in, which the browser-only demo lacks.
  if (!hosted) return null;

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const history = messages.map(({ role, text }) => ({ role, text }));
    setMessages((current) => [...current, { role: "user", text }]);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const session = (await getBackend().auth.getSession()).data?.session;
      if (!session) throw new Error("Sign in again to use the assistant.");
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        // The server answers within a minute; past that, stop waiting.
        signal: AbortSignal.timeout(70_000),
        body: JSON.stringify({
          message: text,
          history,
          // "demo" and unsaved cases have no stored record to read.
          caseId: caseId && uuid.test(caseId) ? caseId : null,
          page,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as Partial<Reply> & {
        error?: string;
      };
      if (!response.ok || !result.reply)
        throw new Error(
          result.error ?? "The assistant couldn’t answer. Try again.",
        );
      const { reply, ...details } = result;
      setMessages((current) => [
        ...current,
        { role: "assistant", text: reply, ...details },
      ]);
    } catch (cause) {
      // Put the question back so it isn't lost.
      setMessages((current) => current.slice(0, -1));
      setDraft(text);
      setError(
        cause instanceof Error && cause.name === "TimeoutError"
          ? "The assistant took too long to answer. Try again."
          : cause instanceof Error
            ? cause.message
            : "The assistant couldn’t answer.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <Sheet
      title="Case assistant"
      description="Ask how to work through your case. Information, not legal advice."
      trigger={
        <button type="button" className="assistant-launch">
          <MessageCircleQuestionMark size={20} aria-hidden="true" />
          <span>Ask the assistant</span>
        </button>
      }
    >
      <div className="assistant">
        <p className="small muted">
          Your question and this case’s details are sent to Anthropic’s Claude
          to prepare an answer, or to Google Gemini if Claude is unavailable. Rules come from the California Courts
          Self-Help Guide.
        </p>
        <div className="assistant-log" role="log" aria-live="polite">
          {messages.length === 0 && (
            <div className="assistant-suggestions">
              {suggestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => void ask(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`assistant-message assistant-${message.role}`}
            >
              <p>{message.text}</p>
              {message.role === "assistant" && message.agent_label && (
                <p className="assistant-meta">
                  {message.agent_label} ·{" "}
                  {message.revised ? "corrected by" : "checked by"}{" "}
                  {message.reviewed_by === "claude" ? "Claude" : "Gemini"}{" "}
                  reviewer
                  {message.sources?.length
                    ? ` · Guide: ${message.sources.map((source) => source.title).join("; ")}`
                    : ""}
                </p>
              )}
            </div>
          ))}
          {busy && (
            <p className="assistant-meta" role="status">
              <LoaderCircle className="spin" size={16} aria-hidden="true" />{" "}
              Drafting an answer, then having it reviewed. This can take up to
              half a minute…
            </p>
          )}
          <div ref={end} />
        </div>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <form className="assistant-form" onSubmit={submit}>
          <label htmlFor="assistant-question" className="sr-only">
            Your question
          </label>
          <textarea
            id="assistant-question"
            rows={2}
            maxLength={2000}
            placeholder="Ask about your next step, your evidence, the rules or your letter"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(draft);
              }
            }}
          />
          <Button disabled={busy || !draft.trim()}>
            <SendHorizontal size={18} aria-hidden="true" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
        <AiCheck />
      </div>
    </Sheet>
  );
}

type ServiceStatus = {
  service: string;
  used_for: string;
  key_set: boolean;
  model: string;
  ok: boolean;
  answered_in_ms: number | null;
  problem: string;
  fix: string;
  available_models: string[];
  optional?: boolean;
};

// Tests the site's AI keys and models and shows what, if anything, is wrong.
function AiCheck() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  async function check() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const session = (await getBackend().auth.getSession()).data?.session;
      if (!session) throw new Error("Sign in again to check the connection.");
      const response = await fetch("/api/ai-status", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: AbortSignal.timeout(40_000),
      });
      const result = (await response.json().catch(() => ({}))) as {
        services?: ServiceStatus[];
        error?: string;
      };
      if (!response.ok || !result.services)
        throw new Error(result.error ?? "The check couldn’t run. Try again.");
      setServices(result.services);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name !== "TimeoutError"
          ? cause.message
          : "The check took too long. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="assistant-check">
      <button
        type="button"
        className="auth-text-link"
        disabled={busy}
        onClick={() => void check()}
      >
        {busy ? "Checking the AI services…" : "Not getting answers? Check the AI connection"}
      </button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {services && (
        <ul role="status">
          {services.map((item) => (
            <li key={item.service}>
              <strong>
                {item.service}:{" "}
                {item.ok
                  ? "working"
                  : item.optional && !item.key_set
                    ? "not set (optional)"
                    : "not working"}
              </strong>
              <span className="assistant-meta">
                Model {item.model} · {item.used_for}
              </span>
              {item.ok ? (
                <span>
                  Answered a test in{" "}
                  {((item.answered_in_ms ?? 0) / 1000).toFixed(1)} seconds.
                </span>
              ) : (
                <>
                  <span>{item.problem}</span>
                  <span>{item.fix}</span>
                  {item.available_models.length > 0 && (
                    <span className="assistant-meta">
                      Available to this key: {item.available_models.join(", ")}
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
