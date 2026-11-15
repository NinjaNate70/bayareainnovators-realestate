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
  reviewed_by: "openai" | "gemini";
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
        cause instanceof Error ? cause.message : "The assistant couldn’t answer.",
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
          Your question and this case’s details are sent to Google Gemini and
          OpenAI to prepare an answer. Rules come from the California Courts
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
                  {message.reviewed_by === "openai" ? "OpenAI" : "Gemini"}{" "}
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
              Choosing a specialist, drafting, then reviewing…
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
      </div>
    </Sheet>
  );
}
