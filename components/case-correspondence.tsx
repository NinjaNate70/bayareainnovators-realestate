'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SourceChip } from '@/components/evidence';
import { FileDrop } from '@/components/file-drop';
import { buildMailto, correspondenceTable, maxMessageLength, messageColumns, type CaseMessage, type DraftKind } from '@/lib/case-correspondence';
import { requireSupabase } from '@/lib/supabase/client';
import type { RentalCase } from '@/types/case';

type Editor = { subject: string; body: string; email: string };
const emptyEditor: Editor = { subject: '', body: '', email: '' };
const errorText = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;
const sameDraft = (a: Editor, b: Editor) => a.subject === b.subject && a.body === b.body && a.email === b.email;
const sortMessages = (a: CaseMessage, b: CaseMessage) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id);
const pageSize = 30;

function legacyDraft(mode: DraftKind, data: RentalCase): Editor {
  const body = mode === 'letter' ? data.letter : data.reply;
  const subject = body.match(/^Subject:[ \t]*([^\r\n]+)$/im)?.[1]?.trim().slice(0, 200);
  return { ...emptyEditor, body, subject: body.trim() ? subject || (mode === 'letter' ? 'Security deposit deductions' : 'Re: Security deposit') : '' };
}

export function CaseCorrespondence({ data, mode, onReplyDateSaved }: {
  data: RentalCase; mode: DraftKind; onReplyDateSaved?: (date: string) => void;
}) {
  const id = useId();
  const [editor, setEditor] = useState<Editor>(() => legacyDraft(mode, data));
  const [messageId, setMessageId] = useState<CaseMessage | null>(null);
  const [baseline, setBaseline] = useState(editor);
  const [history, setHistory] = useState<CaseMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<CaseMessage | null>(null);
  const [entry, setEntry] = useState<Editor>(() => ({ ...emptyEditor, body: mode === 'reply' ? data.incoming : '' }));
  const [entryStatus, setEntryStatus] = useState<'received' | 'sent'>('received');
  const [entryTime, setEntryTime] = useState('');
  const [goal, setGoal] = useState('');
  const [replyBy, setReplyBy] = useState(data.replyBy ?? '');
  const [savedReplyBy, setSavedReplyBy] = useState(replyBy);
  const [consent, setConsent] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const client = requireSupabase();
        const [messages, outbound, inbound, caseDate] = await Promise.all([
          client.from(correspondenceTable).select(messageColumns).eq('case_id', data.id)
            .order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize)
            .abortSignal(controller.signal).returns<CaseMessage[]>(),
          client.from(correspondenceTable).select(messageColumns).eq('case_id', data.id).eq('kind', mode).in('status', ['draft', 'sent'])
            .order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(1)
            .abortSignal(controller.signal).maybeSingle<CaseMessage>(),
          client.from(correspondenceTable).select(messageColumns).eq('case_id', data.id).eq('status', 'received')
            .order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(1)
            .abortSignal(controller.signal).maybeSingle<CaseMessage>(),
          client.from('cases').select('reply_by_date').eq('id', data.id).abortSignal(controller.signal).maybeSingle(),
        ]);
        if (controller.signal.aborted) return;
        if (messages.error || outbound.error || inbound.error) throw new Error('The email history could not load. Check the correspondence migration or try again.');
        const byId = new Map(messages.data.map((row) => [row.id, row]));
        for (const row of [outbound.data, inbound.data]) if (row) byId.set(row.id, row);
        setHistory([...byId.values()].sort(sortMessages));
        setOlderCursor(messages.data.length === pageSize ? messages.data.at(-1) ?? null : null);
        setLoadFailed(false);
        setError('');
        if (caseDate.data) {
          const savedDate = caseDate.data.reply_by_date ?? '';
          setReplyBy(savedDate);
          setSavedReplyBy(savedDate);
        }
        const latestDraft = outbound.data;
        if (latestDraft) {
          setMessageId(latestDraft);
          setBaseline(latestDraft);
          setEditor(latestDraft);
        }
        setEntry((current) => [...byId.values()].some((row) => row.status === 'received' && row.body === current.body.trim()) ? emptyEditor : current);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setLoadFailed(true);
          setError(errorText(cause, 'Could not load your email history.'));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [data.id, mode, attempt]);

  const hasReceived = history.some(({ status }) => status === 'received');
  const dirty = !sameDraft(editor, baseline);
  const dateDirty = replyBy !== savedReplyBy;
  const needsDraftSave = dirty || (!messageId && !!editor.body.trim());
  const locked = loading || Boolean(pending);
  const draftReady = Boolean(editor.subject.trim() && editor.body.trim());
  const emailLink = reviewed && !locked ? buildMailto(editor.email, editor.subject, editor.body) : null;
  const latestReceived = history.find(({ status }) => status === 'received');
  const newerReply = mode === 'reply' && !!messageId && !!latestReceived && sortMessages(latestReceived, messageId) < 0;

  function changeEditor(change: Partial<Editor>) {
    setEditor((current) => ({ ...current, ...change }));
    setReviewed(false);
  }

  function remember(row: CaseMessage) {
    setHistory((current) => [row, ...current.filter(({ id }) => id !== row.id)].sort(sortMessages));
  }

  function openDraft(row: CaseMessage) {
    setMessageId(row);
    setEditor(row);
    setBaseline(row);
    setReviewed(false);
  }

  async function loadOlder() {
    if (locked || !olderCursor) return;
    setPending('Loading older emails…');
    setError('');
    try {
      const { occurred_at: time, id: cursorId } = olderCursor;
      const result = await requireSupabase().from(correspondenceTable).select(messageColumns).eq('case_id', data.id)
        .or(`occurred_at.lt.${time},and(occurred_at.eq.${time},id.lt.${cursorId})`)
        .order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize).returns<CaseMessage[]>();
      if (result.error) throw new Error('Could not load older emails. Try again.');
      setHistory((current) => [...new Map([...result.data, ...current].map((row) => [row.id, row])).values()].sort(sortMessages));
      setOlderCursor(result.data.length === pageSize ? result.data.at(-1) ?? null : null);
    } catch (cause) {
      setError(errorText(cause, 'Could not load older emails.'));
    } finally {
      setPending('');
    }
  }

  async function saveRequestedDate() {
    if (locked || !dateDirty) return;
    setPending('Saving requested reply date…');
    setError('');
    try {
      const result = await requireSupabase().from('cases').update({ reply_by_date: replyBy || null })
        .eq('id', data.id).select('id').maybeSingle();
      if (result.error || !result.data) throw new Error('Could not save the requested reply date.');
      setSavedReplyBy(replyBy);
      onReplyDateSaved?.(replyBy);
      setStatus('Requested reply date saved.');
    } catch (cause) {
      setError(errorText(cause, 'Could not save the requested reply date.'));
    } finally {
      setPending('');
    }
  }

  async function addMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || !entry.body.trim()) return;
    setPending('Saving email…');
    setError('');
    setStatus('');
    try {
      const values = { subject: entry.subject.trim(), body: entry.body.trim(), email: entry.email.trim() };
      const occurredAt = entryTime ? new Date(entryTime).toISOString() : undefined;
      const result = await requireSupabase().from(correspondenceTable)
        .insert({ ...values, ...(occurredAt ? { occurred_at: occurredAt } : {}), case_id: data.id, kind: 'reply', status: entryStatus })
        .select(messageColumns).single<CaseMessage>();
      if (result.error) throw new Error('Could not save that email. Keep the text on this page and try again.');
      remember(result.data);
      setEntry(emptyEditor);
      setEntryTime('');
      setConsent(false);
      setReviewed(false);
      setStatus('Email added to the case history.');
    } catch (cause) {
      setError(errorText(cause, 'Could not save that email.'));
    } finally {
      setPending('');
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || locked || needsDraftSave || dateDirty || (mode === 'reply' && (!hasReceived || entry.body.trim()))) return;
    setPending('Writing and reviewing your draft…');
    setReviewed(false);
    setError('');
    setStatus('');
    try {
      const { data: { session } } = await requireSupabase().auth.getSession();
      if (!session) throw new Error('Sign in again to draft this email.');
      const response = await fetch('/api/cases/correspondence', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: data.id, kind: mode, goal, consent }),
      });
      const result: { error?: string; draft?: CaseMessage } = await response.json().catch(() => ({}));
      if (!response.ok || !result.draft) throw new Error(result.error ?? 'Could not prepare a reviewed draft. Try again.');
      remember(result.draft);
      openDraft(result.draft);
      // A reply follows its latest sender. The address is editable and requires review.
      const sender = latestReceived?.email;
      const address = mode === 'reply' ? sender || '' : editor.email;
      if (address) setEditor({ ...result.draft, email: address });
      setStatus('Draft saved. Review and edit it below.');
    } catch (cause) {
      setError(errorText(cause, 'Could not prepare a reviewed draft.'));
    } finally {
      setPending('');
    }
  }

  async function save(sent = false) {
    if (!draftReady || locked || (sent && !reviewed)) return;
    setPending(sent ? 'Recording sent email…' : 'Saving draft…');
    setError('');
    setStatus('');
    try {
      const client = requireSupabase();
      const values = { subject: editor.subject.trim(), body: editor.body.trim(), email: editor.email.trim(), status: sent ? 'sent' : 'draft' };
      const query = messageId?.status === 'draft'
        ? client.from(correspondenceTable).update(values).eq('id', messageId.id)
          .eq('case_id', data.id).eq('updated_at', messageId.updated_at)
        : client.from(correspondenceTable).insert({ ...values, case_id: data.id, kind: mode });
      const result = await query.select(messageColumns).maybeSingle<CaseMessage>();
      if (result.error || !result.data) {
        throw new Error('Could not save this version. The draft may have changed on another device. Copy your edits before refreshing.');
      }
      remember(result.data);
      openDraft(result.data);
      setStatus(sent ? 'Email marked as sent in your case history.' : 'Edited draft saved.');
    } catch (cause) {
      setError(errorText(cause, 'Could not save the email.'));
    } finally {
      setPending('');
    }
  }

  async function copyDraft() {
    if (!reviewed || !draftReady) return;
    try {
      await navigator.clipboard.writeText(editor.body);
      setStatus('Reply text copied. Paste it into the existing email conversation.');
    } catch {
      setError('Select the draft text and copy it manually.');
    }
  }

  function downloadDraft() {
    const url = URL.createObjectURL(new Blob([`${editor.subject}\n\n${editor.body}`], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `tenant-shield-${mode}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <div className="section-title no-print">
        <h2>{mode === 'reply' ? 'Reply to the latest email' : 'Write to your landlord'}</h2>
        <p>Draft from your case, available evidence, and past emails. Review the wording before you use it.</p>
      </div>
      {error && <p className="notice no-print" role="alert">{error}</p>}
      {status && <p className="no-print" role="status">{status}</p>}
      {pending && <p className="no-print" role="status">{pending}</p>}
      {loading && <p className="no-print" role="status">Loading email history…</p>}
      {loadFailed && <Button variant="outline" onClick={() => { setLoading(true); setAttempt(attempt + 1); }}>Reload email history</Button>}
      <div className="letter-layout no-print">
        <div className="stack">
          <Card>
            <h3>Draft with AI</h3>
            <form onSubmit={generate} className="stack">
              <label className="field-label" htmlFor={`${id}-goal`}>What do you want this email to accomplish?</label>
              <textarea id={`${id}-goal`} rows={2} maxLength={600} value={goal} disabled={locked} onChange={(e) => setGoal(e.target.value)}
                placeholder="For example, ask which part of the invoice covers the wall repair." />
              {mode === 'letter' && <div className="stack">
                <label className="field-label">Requested reply date
                  <input type="date" value={replyBy} disabled={locked} onChange={(event) => { setReplyBy(event.target.value); setReviewed(false); }} />
                </label>
                {dateDirty && <Button type="button" variant="outline" disabled={locked} onClick={() => void saveRequestedDate()}>Save reply date</Button>}
              </div>}
              <label className="checkline">
                <input type="checkbox" checked={consent} disabled={locked} onChange={(event) => setConsent(event.target.checked)} />
                <span>I agree to send the case details, selected files, and email history to Claude or Gemini for drafting and review.</span>
              </label>
              {needsDraftSave && <p className="field-hint">Save your current draft before generating a new one.</p>}
              {mode === 'reply' && (!hasReceived || entry.body.trim()) && <p className="field-hint">Add the latest received email to the case history before drafting a reply.</p>}
              <Button type="submit" disabled={locked || loadFailed || !consent || needsDraftSave || dateDirty || (mode === 'reply' && (!hasReceived || !!entry.body.trim()))}>
                {mode === 'reply' ? 'Draft a reply' : 'Draft a letter'}
              </Button>
            </form>
          </Card>
          <Card className="letter-editor">
            <h3>Review your email draft</h3>
            {newerReply && <p className="field-hint">A newer email arrived after this draft. Update it or generate a fresh reply.</p>}
            <div className="stack">
              <label className="field-label">To<input type="email" value={editor.email} maxLength={254} placeholder="manager@example.com" disabled={locked} onChange={(e) => changeEditor({ email: e.target.value })} /></label>
              <label className="field-label">Subject<input value={editor.subject} maxLength={200} disabled={locked} onChange={(e) => changeEditor({ subject: e.target.value })} /></label>
              <label className="sr-only" htmlFor={`${id}-body`}>Edit {mode === 'letter' ? 'demand letter' : 'suggested reply'}</label>
              <textarea id={`${id}-body`} className="letter-text" rows={14} maxLength={maxMessageLength} value={editor.body} disabled={locked} onChange={(e) => changeEditor({ body: e.target.value })} />
              {messageId?.source_ids.length ? <div><p className="field-hint">Sources cited in the AI draft</p><div className="source-list">
                {messageId.source_ids.map((source) => <SourceChip key={source} id={source} data={data} />)}
              </div></div> : null}
              {messageId?.review_note && <p className="field-hint">Review note · {messageId.review_note}</p>}
              <Button variant="outline" disabled={locked || loadFailed || !draftReady || (!dirty && messageId?.status === 'draft')} onClick={() => void save()}>
                Save draft
              </Button>
              <label className="checkline">
                <input type="checkbox" checked={reviewed} disabled={locked || !draftReady} onChange={(e) => setReviewed(e.target.checked)} />
                <span>I checked the recipient, facts, and wording in this draft.</span>
              </label>
              <div className="split-row wrap">
                {emailLink ? <Button asChild><a href={emailLink}>Open in email app</a></Button> : <Button disabled>Open in email app</Button>}
                <Button variant="outline" disabled={locked || !reviewed || !draftReady} onClick={copyDraft}>Copy for email</Button>
                <Button variant="outline" disabled={!draftReady} onClick={downloadDraft}>Download draft</Button>
                {mode === 'letter' && <Button variant="outline" disabled={!draftReady} onClick={() => window.print()}>Print / save PDF</Button>}
              </div>
              <p className="field-hint">Open in email app starts an editable email. To reply in an existing conversation, copy the text into its Reply box.</p>
              <Button variant="outline" disabled={locked || !reviewed || !draftReady || messageId?.status === 'sent'} onClick={() => {
                if (window.confirm('Did you already send this exact email outside Tenant Shield?')) void save(true);
              }}>Record as sent</Button>
            </div>
          </Card>
        </div>
        <aside className="stack">
          <Card>
            <h3>Add an email to the history</h3>
            <form className="stack" onSubmit={addMessage}>
              <label className="field-label">Direction<select value={entryStatus} disabled={locked} onChange={(e) => setEntryStatus(e.target.value === 'sent' ? 'sent' : 'received')}>
                <option value="received">Received from landlord</option><option value="sent">Previously sent by me</option>
              </select></label>
              <label className="field-label">Email subject<input value={entry.subject} maxLength={200} disabled={locked} onChange={(e) => setEntry({ ...entry, subject: e.target.value })} /></label>
              <label className="field-label">{entryStatus === 'received' ? 'From' : 'To'} (optional)<input type="email" value={entry.email} maxLength={254} disabled={locked} onChange={(e) => setEntry({ ...entry, email: e.target.value })} /></label>
              <label className="field-label">Email date and time (optional)<input type="datetime-local" value={entryTime} disabled={locked} onChange={(e) => setEntryTime(e.target.value)} /></label>
              <label className="field-label">Email text<textarea required rows={6} maxLength={maxMessageLength} value={entry.body} disabled={locked} onChange={(e) => setEntry({ ...entry, body: e.target.value })} /></label>
              <FileDrop label="Or import a text file" accept="text/plain,.txt" hint=".txt only" onFiles={async ([file]) => {
                if (!file) return;
                setError('');
                try {
                  if (!file.name.toLowerCase().endsWith('.txt') || file.size > maxMessageLength * 4) throw new Error('Choose a .txt email of up to 20,000 characters.');
                  const body = await file.text();
                  if (body.length > maxMessageLength) throw new Error('This text file is too long. Paste the relevant part instead.');
                  setEntry((current) => ({ ...current, body }));
                } catch (cause) {
                  setError(errorText(cause, 'Could not read the text file.'));
                }
              }} />
              <Button type="submit" variant="outline" disabled={locked || loadFailed || !entry.body.trim()}>Add to email history</Button>
            </form>
          </Card>
          <Card>
            <h3>Email history</h3>
            {history.length === 0 && !loading && <p className="field-hint">Received emails, saved drafts, and messages marked sent appear here.</p>}
            {history.map((row) => <details key={row.id}>
              <summary>{row.status === 'received' ? 'Received' : row.status === 'sent' ? 'Marked sent' : 'Draft'} · {row.subject || 'No subject'}</summary>
              <p className="small muted">{new Date(row.occurred_at).toLocaleString()}</p>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.body}</p>
              {row.status === 'draft' && row.kind === mode && row.id !== messageId?.id && (
                <Button variant="outline" disabled={locked || dirty} onClick={() => openDraft(row)}>Open this draft</Button>
              )}
            </details>)}
            {olderCursor && <Button variant="outline" disabled={locked} onClick={() => void loadOlder()}>Load older emails</Button>}
          </Card>
        </aside>
      </div>
      <article className="print-letter">{`${editor.subject}\n\n${editor.body}`}</article>
    </>
  );
}
