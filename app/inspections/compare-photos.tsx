'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { comparisonColumns, type SavedComparison } from '@/lib/inspection-comparison';
import styles from './inspections.module.css';

type PhotoChoice = { id: string; phase: 'move_in' | 'move_out'; original_name: string; uploaded_at: string };
type ComparisonProps = {
  supabase: SupabaseClient;
  roomId: string;
  roomName: string;
  autoCompare: boolean;
  renderPhoto: (id: string) => ReactNode;
};
type StoredComparison = SavedComparison & { hasCurrentAssessment: boolean };

const labels = {
  no_damage: 'No new visible damage',
  normal_wear_and_tear: 'Normal wear and tear',
  repair: 'Visible damage',
};

async function requestComparison(supabase: SupabaseClient, moveInPhotoId: string, moveOutPhotoId: string, spot: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in again to compare photos.');
  const response = await fetch('/api/inspections/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ moveInPhotoId, moveOutPhotoId, spot, consent: true }),
  });
  const result: { comparison?: SavedComparison; error?: string } = await response.json().catch(() => ({}));
  if (!response.ok || !result.comparison) throw new Error(result.error ?? 'Could not complete the comparison. Try again.');
  return result.comparison;
}

export function ComparePhotos({ photos, ...props }: ComparisonProps & { photos: PhotoChoice[] }) {
  const moveIn = photos.filter((photo) => photo.phase === 'move_in');
  const moveOut = photos.filter((photo) => photo.phase === 'move_out');
  if (!moveIn.length || !moveOut.length) return null;

  // The gallery sorts newest first. Reset the selection when an upload creates a new pair.
  return <RoomPhotoComparison key={`${moveIn[0].id}/${moveOut[0].id}`} {...props} moveIn={moveIn} moveOut={moveOut} />;
}

function RoomPhotoComparison({ moveIn, moveOut, renderPhoto, ...props }: ComparisonProps & {
  moveIn: PhotoChoice[];
  moveOut: PhotoChoice[];
}) {
  const pickerId = useId();
  const [moveInId, setMoveInId] = useState(moveIn[0].id);
  const [moveOutId, setMoveOutId] = useState(moveOut[0].id);
  const choices = [
    { phase: 'move-in', label: 'Move-in photo', photos: moveIn, id: moveInId, select: setMoveInId },
    { phase: 'move-out', label: 'Move-out photo', photos: moveOut, id: moveOutId, select: setMoveOutId },
  ].filter(({ photos }) => photos.length > 1);

  return (
    <div className={styles.comparison}>
      <h4>Photo comparison</h4>
      {choices.length > 0 && (
        <div className={`${styles.phases} ${styles.comparisonPair}`}>
          {choices.map(({ phase, label, photos, id, select }) => (
            <div key={phase}>
              <label><span id={`${pickerId}-${phase}`}>{label}</span>
                <select aria-labelledby={`${pickerId}-${phase}`} value={id} onChange={(event) => select(event.target.value)}>
                  {photos.map((photo) => (
                    <option key={photo.id} value={photo.id}>{photo.original_name} · {new Date(photo.uploaded_at).toLocaleString()}</option>
                  ))}
                </select>
              </label>
              {renderPhoto(id)}
            </div>
          ))}
        </div>
      )}
      <PairAssessment key={`${moveInId}/${moveOutId}`} supabase={props.supabase}
        roomId={props.roomId} roomName={props.roomName} moveInId={moveInId} moveOutId={moveOutId}
        autoCompare={props.autoCompare && moveInId === moveIn[0].id && moveOutId === moveOut[0].id} />
    </div>
  );
}

function PairAssessment({ supabase, roomId, roomName, moveInId, moveOutId, autoCompare }: Omit<ComparisonProps, 'renderPhoto'> & {
  moveInId: string;
  moveOutId: string;
}) {
  const disclosureId = useId();
  const [result, setResult] = useState<StoredComparison | null>();
  const [historyError, setHistoryError] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void supabase.from('inspection_comparisons').select(`${comparisonColumns}, model`)
      .eq('room_id', roomId).eq('move_in_photo_id', moveInId).eq('move_out_photo_id', moveOutId)
      .abortSignal(controller.signal).maybeSingle<SavedComparison & { model: string }>().then(({ data, error }) => {
        if (controller.signal.aborted) return;
        setHistoryError(Boolean(error));
        setResult(data ? { ...data, hasCurrentAssessment: data.model.startsWith('claude-') } : null);
      });
    return () => controller.abort();
  }, [supabase, roomId, moveInId, moveOutId]);

  const compare = useCallback(async () => {
    attempted.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await requestComparison(supabase, moveInId, moveOutId, roomName);
      setResult({ ...saved, hasCurrentAssessment: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not compare the photos.');
    } finally {
      setBusy(false);
    }
  }, [supabase, moveInId, moveOutId, roomName]);

  useEffect(() => {
    if (!autoCompare || historyError || result !== null || busy || attempted.current) return;
    let active = true;
    queueMicrotask(() => {
      if (active && !attempted.current) void compare();
    });
    return () => { active = false; };
  }, [autoCompare, busy, compare, historyError, result]);

  return (
    <>
      {result === undefined && <p role="status">Loading comparison…</p>}
      {busy && <p role="status">Comparing photos…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {result !== undefined && !result?.hasCurrentAssessment && !busy && (
        <>
          <p id={disclosureId} className={styles.comparisonNote}>Sends these two photos to an external service for comparison.</p>
          <button type="button" className={styles.secondary} aria-describedby={disclosureId} onClick={() => void compare()}>
            {error ? 'Retry comparison' : 'Compare photos'}
          </button>
        </>
      )}
      {result && (
        <div className={styles.comparisonResult} role="status">
          <p><strong>{result.category ? labels[result.category] : 'Needs review'}</strong></p>
          {result.summary.split('\n').map((line, index) => {
            const split = line.indexOf(': ');
            return result.hasCurrentAssessment && split > 0
              ? <p key={index}><strong>{line.slice(0, split)}</strong> {line.slice(split + 2)}</p>
              : <p key={index}>{line}</p>;
          })}
        </div>
      )}
    </>
  );
}
