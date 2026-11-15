'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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

export function ComparePhotos({ supabase, roomId, photos, renderPhoto }: {
  supabase: SupabaseClient;
  roomId: string;
  photos: PhotoChoice[];
  renderPhoto: (id: string) => ReactNode;
}) {
  const moveIn = photos.filter((photo) => photo.phase === 'move_in');
  const moveOut = photos.filter((photo) => photo.phase === 'move_out');
  const [open, setOpen] = useState(false);

  if (!moveIn.length || !moveOut.length) return null;
  return (
    <div className={styles.comparison}>
      <button type="button" className={styles.secondary} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide comparisons' : 'Compare photos'}
      </button>
      {open && <ComparisonForm supabase={supabase} roomId={roomId} moveIn={moveIn} moveOut={moveOut} renderPhoto={renderPhoto} />}
    </div>
  );
}

function ComparisonForm({ supabase, roomId, moveIn, moveOut, renderPhoto }: {
  supabase: SupabaseClient;
  roomId: string;
  moveIn: PhotoChoice[];
  moveOut: PhotoChoice[];
  renderPhoto: (id: string) => ReactNode;
}) {
  const [moveInId, setMoveInId] = useState(moveIn[0].id);
  const [moveOutId, setMoveOutId] = useState(moveOut[0].id);
  const [results, setResults] = useState<SavedComparison[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  const selectedResult = results.find((result) => result.move_in_photo_id === moveInId && result.move_out_photo_id === moveOutId);
  const previousResults = results.filter((result) => result.id !== selectedResult?.id);
  const names = new Map([...moveIn, ...moveOut].map(({ id, original_name }) => [id, original_name]));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || selectedResult) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in again to compare photos.');
      const response = await fetch('/api/inspections/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          moveInPhotoId: moveInId, moveOutPhotoId: moveOutId,
          spot: form.get('spot'), region: form.get('region'), consent: form.get('consent') === 'on',
        }),
      });
      const result: { comparison?: SavedComparison; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !result.comparison) throw new Error(result.error ?? 'Could not complete the comparison. Try again.');
      const saved = result.comparison;
      setResults((current) => [saved, ...current.filter(({ id }) => id !== saved.id)]);
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
                <span>These photos show the same spot. I agree to send both photos to Google Gemini for analysis.</span>
              </label>
              <button className={styles.primary} disabled={busy || historyLoading}>{busy ? 'Comparing…' : 'Run comparison'}</button>
            </>
          )}
        </fieldset>
      </form>
      {busy && <p role="status">Gemini is reviewing the photos and saving the result.</p>}
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
