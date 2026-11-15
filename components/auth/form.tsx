"use client";
import {
  useEffect,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Circle,
  CircleCheck,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientError } from "@/types/backend";
export function useAuthForm(
  validate: (values: Record<string, string>) => Record<string, string>,
  initialValues: Record<string, string> = {},
) {
  const [values, setValues] = useState<Record<string, string>>(initialValues),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [until, setUntil] = useState(0),
    [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  function setValue(name: string, value: string) {
    if (
      name === "email" &&
      value.trim().toLowerCase() !== (values.email ?? "").trim().toLowerCase()
    ) {
      setUntil(0);
      setError("");
    }
    setValues((v) => ({ ...v, [name]: value }));
  }
  function blur(name: string) {
    setErrors((e) => ({ ...e, [name]: validate(values)[name] ?? "" }));
  }
  function responseError(e: ClientError) {
    if (e.code === "current_password") {
      setErrors((current) => ({ ...current, currentPassword: e.message }));
      const field = document.querySelector<HTMLElement>(
        'form[aria-busy="true"] [name="currentPassword"]',
      );
      requestAnimationFrame(() => field?.focus());
      return;
    }
    setError(e.message);
    if (e.retry_after_seconds) {
      const deadline = Date.now() + e.retry_after_seconds * 1000;
      setUntil(deadline);
      setTick(Date.now());
    }
  }
  async function submit(event: FormEvent, fn: () => Promise<void>) {
    event.preventDefault();
    const element = event.currentTarget as HTMLFormElement;
    if (element.dataset.submitting === "true" || Date.now() < until) return;
    const invalid = validate(values);
    setErrors(invalid);
    setError("");
    const first = Object.keys(invalid).find((key) => invalid[key]);
    if (first) {
      requestAnimationFrame(() =>
        element.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(),
      );
      return;
    }
    element.dataset.submitting = "true";
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Your entries are still here. Try again.",
      );
    } finally {
      delete element.dataset.submitting;
      setBusy(false);
    }
  }
  const wait = Math.max(0, Math.ceil((until - tick) / 60_000));
  function reset() {
    setValues({});
    setErrors({});
    setError("");
    setUntil(0);
  }
  return {
    reset,
    values,
    errors,
    error,
    setError,
    busy,
    wait,
    setValue,
    setValues,
    blur,
    responseError,
    submit,
  };
}
export function Field({
  label,
  error,
  hint,
  children,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      {children ?? (
        <input
          {...props}
          id={id}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
        />
      )}
      <span className="field-feedback" aria-live="polite">
        {error && (
          <span id={`${id}-error`}>
            <AlertCircle size={16} aria-hidden="true" /> Fix this: {error}
          </span>
        )}
      </span>
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
export function PasswordField({
  label = "Password",
  id,
  name,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} id={id} error={error} hint={hint}>
      <div className="password-control">
        <input
          {...props}
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? (
            <EyeOff size={19} aria-hidden="true" />
          ) : (
            <Eye size={19} aria-hidden="true" />
          )}
          <span>{visible ? "Hide" : "Show"}</span>
        </button>
      </div>
    </Field>
  );
}
export function Requirements({ password }: { password: string }) {
  const n = Array.from(password).length;
  const metCount =
    Number(n >= 12) + Number(n > 0 && n <= 128) + Number(!!password.trim());
  return (
    <>
      <ul className="password-requirements" aria-label="Password requirements">
        {[
          [n >= 12, "At least 12 characters"],
          [n > 0 && n <= 128, "128 characters or fewer"],
          [!!password.trim(), "More than spaces"],
        ].map(([met, label]) => (
          <li key={String(label)} className={met ? "met" : ""}>
            {met ? (
              <CircleCheck size={16} aria-hidden="true" />
            ) : (
              <Circle size={16} aria-hidden="true" />
            )}
            <span>{label}</span>
            <span className="sr-only">{met ? " — met" : " — not met"}</span>
          </li>
        ))}
      </ul>
      <span className="sr-only" role="status">
        {metCount} of 3 password requirements met.
      </span>
    </>
  );
}
export function FormError({ message }: { message: string }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {message && (
        <div className="notice auth-error">
          <AlertCircle size={19} aria-hidden="true" />
          <p>{message}</p>
        </div>
      )}
    </div>
  );
}
export function SubmitButton({
  busy,
  wait = 0,
  children,
  loading,
  disabled = false,
}: {
  busy: boolean;
  wait?: number;
  children: ReactNode;
  loading: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="submit"
      className="auth-submit"
      disabled={busy || wait > 0 || disabled}
    >
      {busy && <LoaderCircle size={19} className="spin" aria-hidden="true" />}
      {busy ? loading : wait > 0 ? `Try again in ${wait} min` : children}
    </Button>
  );
}
