'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { comparisonColumns, type SavedComparison } from '@/lib/inspection-comparison';
import styles from './inspections.module.css';

type PhotoChoice = { id: string; phase: 'move_in' | 'move_out'; original_name: string; uploaded_at: string };

const labels = {
  no_damage: 'No damage',
  normal_wear_and_tear: 'Normal wear and tear',
  repair: 'Repair',
};

function ComparisonResult({ result, photoNames }: { result: SavedComparison; photoNames: Map<string, string> }) {
  const estimate = result.estimate;
  const currency = estimate && new Intl.NumberFormat(undefined, { style: 'currency', currency: estimate.currency, maximumFractionDigits: 2 });
  return (
    <div className={styles.comparisonResult}>
      <h4>{result.category ? labels[result.category] : 'Needs review'} · {result.spot}</h4>
      <p>{result.summary}</p>
      <dl>
        <dt>Move-in</dt><dd>{photoNames.get(result.move_in_photo_id) ?? 'Move-in photo'}</dd>
        <dt>Move-out</dt><dd>{photoNames.get(result.move_out_photo_id) ?? 'Move-out photo'}</dd>
      </dl>
      {estimate && currency ? (
        <p><strong>Rough estimate</strong> {currency.format(estimate.low_cents / 100)}–{currency.format(estimate.high_cents / 100)} {estimate.unit} for {estimate.title}. {estimate.source}, {estimate.effective_on}.</p>
      ) : result.category === 'repair' && <p>No matching regional price is available for this repair.</p>}
      <p className={styles.comparisonNote}>AI assessment based on visible evidence. Review it before relying on it.</p>
    </div>
  );
}

type ComparisonInput = { moveInId: string; moveOutId: string; spot: string; region?: string };

async function requestComparison(supabase: SupabaseClient, input: ComparisonInput) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in again to compare photos.');
  const response = await fetch('/api/inspections/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      moveInPhotoId: input.moveInId, moveOutPhotoId: input.moveOutId,
      spot: input.spot, region: input.region ?? '', consent: true,
    }),
  });
  const result: { comparison?: SavedComparison; error?: string } = await response.json().catch(() => ({}));
  if (!response.ok || !result.comparison) throw new Error(result.error ?? 'Could not complete the comparison. Try again.');
  return result.comparison;
}

export function ComparePhotos({ supabase, roomId, roomName, auto, photos, renderPhoto }: {
  supabase: SupabaseClient;
  roomId: string;
  roomName: string;
  // The renter chose to have each room's newest pair analyzed without asking each time.
  auto: boolean;
  photos: PhotoChoice[];
  renderPhoto: (id: string) => ReactNode;
}) {
  const moveIn = photos.filter((photo) => photo.phase === 'move_in');
  const moveOut = photos.filter((photo) => photo.phase === 'move_out');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SavedComparison[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoError, setAutoError] = useState('');
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    void supabase.from('inspection_comparisons').select(comparisonColumns)
      .eq('room_id', roomId).order('created_at', { ascending: false })
      .abortSignal(controller.signal).returns<SavedComparison[]>().then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) setHistoryError(true);
        else setResults(data);
        setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [supabase, roomId]);

  const saveResult = useCallback((saved: SavedComparison) => {
    setResults((current) => [saved, ...current.filter(({ id }) => id !== saved.id)]);
  }, []);

  // Photos arrive newest first, so the first of each phase is the latest pair.
  const newestIn = moveIn[0]?.id;
  const newestOut = moveOut[0]?.id;
  const newestResult = results.find((result) => result.move_in_photo_id === newestIn && result.move_out_photo_id === newestOut);
  const hasNewestResult = Boolean(newestResult);

  const analyze = useCallback(async (moveInId: string, moveOutId: string) => {
    setAutoBusy(true);
    setAutoError('');
    try {
      saveResult(await requestComparison(supabase, { moveInId, moveOutId, spot: roomName.trim().slice(0, 120) || 'Room' }));
    } catch (cause) {
      setAutoError(cause instanceof Error ? cause.message : 'Could not analyze the photos.');
    } finally {
      setAutoBusy(false);
    }
  }, [supabase, roomName, saveResult]);

  useEffect(() => {
    if (!auto || historyLoading || historyError || hasNewestResult || !newestIn || !newestOut) return;
    const pair = `${newestIn}/${newestOut}`;
    // One automatic attempt per pair; a failure waits for the renter to retry.
    if (attempted.current.has(pair)) return;
    attempted.current.add(pair);
    queueMicrotask(() => void analyze(newestIn, newestOut));
  }, [auto, historyLoading, historyError, hasNewestResult, newestIn, newestOut, analyze]);

  if (!moveIn.length || !moveOut.length) return null;
  const names = new Map(photos.map(({ id, original_name }) => [id, original_name]));
  return (
    <div className={styles.comparison}>
      {autoBusy && <p role="status">Our system is analyzing the newest move-in and move-out photos for this room…</p>}
      {autoError && !autoBusy && (
        <p role="alert" className={styles.error}>
          Automatic analysis didn’t finish: {autoError}{' '}
          <button type="button" className={styles.secondary} onClick={() => void analyze(newestIn!, newestOut!)}>Try again</button>
        </p>
      )}
      {newestResult && !open && <div role="status"><ComparisonResult result={newestResult} photoNames={names} /></div>}
      <button type="button" className={styles.secondary} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide comparisons' : newestResult ? 'Compare other photos' : 'Compare photos'}
      </button>
      {open && (
        <ComparisonForm supabase={supabase} moveIn={moveIn} moveOut={moveOut} renderPhoto={renderPhoto}
          results={results} historyLoading={historyLoading || autoBusy} historyError={historyError} onSaved={saveResult} />
      )}
    </div>
  );
}

function ComparisonForm({ supabase, moveIn, moveOut, renderPhoto, results, historyLoading, historyError, onSaved }: {
  supabase: SupabaseClient;
  moveIn: PhotoChoice[];
  moveOut: PhotoChoice[];
  renderPhoto: (id: string) => ReactNode;
  results: SavedComparison[];
  historyLoading: boolean;
  historyError: boolean;
  onSaved: (saved: SavedComparison) => void;
}) {
  const [moveInId, setMoveInId] = useState(moveIn[0].id);
  const [moveOutId, setMoveOutId] = useState(moveOut[0].id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedResult = results.find((result) => result.move_in_photo_id === moveInId && result.move_out_photo_id === moveOutId);
  const previousResults = results.filter((result) => result.id !== selectedResult?.id);
  const names = new Map([...moveIn, ...moveOut].map(({ id, original_name }) => [id, original_name]));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || selectedResult) return;
    const form = new FormData(event.currentTarget);
    if (form.get('consent') !== 'on') return;
    setBusy(true);
    setError('');
    try {
      onSaved(await requestComparison(supabase, {
        moveInId, moveOutId, spot: String(form.get('spot') ?? ''), region: String(form.get('region') ?? ''),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not compare the photos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.comparisonForm}>
      <p>Choose photos that show the same spot from a similar angle.</p>
      <form className={styles.form} onSubmit={submit}>
        <fieldset className={styles.form} disabled={busy}>
          <div className={`${styles.phases} ${styles.comparisonPair}`}>
            {[
              { label: 'Move-in photo', choices: moveIn, id: moveInId, select: setMoveInId },
              { label: 'Move-out photo', choices: moveOut, id: moveOutId, select: setMoveOutId },
            ].map(({ label, choices, id, select }) => (
              <div key={label}>
                <label>{label}
                  <select value={id} onChange={(event) => { select(event.target.value); setError(''); }}>
                    {choices.map((photo) => <option key={photo.id} value={photo.id}>{photo.original_name} · {new Date(photo.uploaded_at).toLocaleString()}</option>)}
                  </select>
                </label>
                {renderPhoto(id)}
              </div>
            ))}
          </div>
          {!selectedResult && (
            <>
              <div className={styles.phases}>
                <label>Spot name<input name="spot" placeholder="e.g. Floor next to sink" maxLength={120} required /></label>
                <label>Pricing region (optional)<input name="region" placeholder="e.g. San Luis Obispo, CA" maxLength={120} /></label>
              </div>
              <label className={styles.comparisonConsent}>
                <input key={`${moveInId}/${moveOutId}`} name="consent" type="checkbox" required />
                <span>These photos show the same spot. I agree to let our system analyze both photos.</span>
              </label>
              <button className={styles.primary} disabled={busy || historyLoading}>{busy ? 'Comparing…' : 'Run comparison'}</button>
            </>
          )}
        </fieldset>
      </form>
      {busy && <p role="status">Our system is reviewing the photos and saving the result.</p>}
      {historyError && <p role="status">Could not load saved comparisons. If this persists, check the Supabase migration.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {selectedResult && <div role="status"><ComparisonResult result={selectedResult} photoNames={names} /></div>}
      {previousResults.length > 0 && (
        <details className={styles.comparisonHistory}>
          <summary>Saved comparisons ({previousResults.length})</summary>
          {previousResults.map((result) => <ComparisonResult key={result.id} result={result} photoNames={names} />)}
        </details>
      )}
    </div>
  );
}
