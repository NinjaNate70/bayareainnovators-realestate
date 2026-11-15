'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { auditRoomColumns, summarizeAudit, type AuditRoom, type AuditStatus } from '@/lib/move-out-audit';
import styles from './inspections.module.css';

type Photo = { id: string; phase: 'move_in' | 'move_out'; original_name: string; uploaded_at: string };
type Room = { id: string; name: string; inspection_photos: Photo[] };
type RenderPhoto = (room: Room, id: string) => ReactNode;
type Retake = (roomId: string, phase: Photo['phase']) => void;

const statuses: Record<AuditStatus, string> = {
  awaiting_photos: 'Photos needed', queued: 'Waiting for condition review', inspecting: 'Reviewing condition',
  review_queued: 'Waiting for evidence review', reviewing: 'Checking evidence',
  completed: 'Reviewed', needs_review: 'Needs review', failed: 'Review interrupted',
};
const categories = { no_damage: 'No damage', normal_wear_and_tear: 'Normal wear and tear', repair: 'Repair' };

function selectLabel(photo: Photo) {
  return `${photo.original_name} · ${new Date(photo.uploaded_at).toLocaleString()}`;
}

function PhotoField({ room, phase, previous, renderPhoto }: { room: Room; phase: Photo['phase']; previous?: string | null; renderPhoto: RenderPhoto }) {
  const photos = room.inspection_photos.filter((photo) => photo.phase === phase);
  const [selected, setSelected] = useState(previous && photos.some(({ id }) => id === previous) ? previous : photos[0]?.id ?? '');
  return (
    <div>
      <label>{phase === 'move_in' ? 'Move-in photo' : 'Move-out photo'}
        <select name={`${room.id}-${phase}`} value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Photo missing or needs retake</option>
          {photos.map((photo) => <option key={photo.id} value={photo.id}>{selectLabel(photo)}</option>)}
        </select>
      </label>
      {selected && renderPhoto(room, selected)}
    </div>
  );
}

function PairFields({ room, job, renderPhoto }: { room: Room; job?: AuditRoom; renderPhoto: RenderPhoto }) {
  return (
    <div className={`${styles.phases} ${styles.comparisonPair}`}>
      <PhotoField room={room} phase="move_in" previous={job?.before_id} renderPhoto={renderPhoto} />
      <PhotoField room={room} phase="move_out" previous={job?.after_id} renderPhoto={renderPhoto} />
    </div>
  );
}

function pairFrom(data: FormData, roomId: string) {
  return { room_id: roomId, before_id: data.get(`${roomId}-move_in`) || null, after_id: data.get(`${roomId}-move_out`) || null };
}

export function MoveOutAudit({ supabase, leaseId, rooms, renderPhoto, refreshPhotos, onRetake }: {
  supabase: SupabaseClient; leaseId: string; rooms: Room[]; renderPhoto: RenderPhoto; refreshPhotos: () => Promise<void>;
  onRetake: Retake;
}) {
  const [auditId, setAuditId] = useState<string | null>();
  const [jobs, setJobs] = useState<AuditRoom[]>([]);
  const [loadError, setLoadError] = useState('');
  const loadVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;
    const audit = await supabase.from('move_out_audits').select('id').eq('lease_id', leaseId).maybeSingle();
    if (version !== loadVersion.current) return;
    if (audit.error) {
      setLoadError('Could not load the move-out audit. Check that the audit migration was applied.');
      return;
    }
    const id = audit.data?.id ?? null;
    if (!id) {
      setAuditId(null);
      setLoadError('');
      return;
    }
    const records = await supabase.from('move_out_audit_rooms').select(auditRoomColumns).eq('audit_id', id).returns<AuditRoom[]>();
    if (version !== loadVersion.current) return;
    if (records.error) { setLoadError('Could not load the audit rooms.'); return; }
    setAuditId(id);
    setJobs(records.data);
    setLoadError('');
  }, [supabase, leaseId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    const refreshVisible = () => { if (!document.hidden) void refresh(); };
    const interval = window.setInterval(refreshVisible, 6000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!auditId) return;
    const channel = supabase.channel(`move-out-audit:${auditId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'move_out_audit_rooms', filter: `audit_id=eq.${auditId}` }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, auditId, refresh]);

  const visiblePhotoIds = new Set(rooms.flatMap(({ inspection_photos }) => inspection_photos.map(({ id }) => id)));
  const missingPhoto = jobs.flatMap(({ before_id, after_id }) => [before_id, after_id]).find((id) => id && !visiblePhotoIds.has(id));
  useEffect(() => { if (missingPhoto) void refreshPhotos(); }, [missingPhoto, refreshPhotos]);

  const totals = summarizeAudit(jobs.map(({ status }) => status));

  return (
    <section className={styles.panel}>
      <div className={styles.sectionHeading}>
        <h2>Live move-out audit</h2>
        <button type="button" className={styles.secondary} onClick={refresh}>Refresh audit</button>
      </div>
      {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
      {auditId === undefined && !loadError && <p role="status">Loading audit…</p>}
      {auditId === null && <StartAudit supabase={supabase} leaseId={leaseId} rooms={rooms} refresh={refresh} renderPhoto={renderPhoto} />}
      {auditId && (
        <>
          <p role="status"><strong>{totals.completed} of {totals.total} rooms reviewed</strong> · {totals.working} in progress · {totals.needsAttention} need attention</p>
          {rooms.length > jobs.length && <p>This audit covers the rooms that existed when it started. You can use Compare photos in rooms added later.</p>}
          <p className={styles.comparisonNote}>AI findings are based on visible evidence. Open the photos to verify them.</p>
          {rooms.map((room) => {
            const job = jobs.find((item) => item.room_id === room.id);
            return job && <RoomReview key={`${job.id}:${job.status}`} job={job} room={room} supabase={supabase} refresh={refresh}
              refreshPhotos={refreshPhotos} renderPhoto={renderPhoto} onRetake={onRetake} />;
          })}
        </>
      )}
    </section>
  );
}

function StartAudit({ supabase, leaseId, rooms, refresh, renderPhoto }: {
  supabase: SupabaseClient; leaseId: string; rooms: Room[]; refresh: () => Promise<void>; renderPhoto: RenderPhoto;
}) {
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !consent) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('start_move_out_audit', {
      p_lease: leaseId, p_pairs: rooms.map(({ id }) => pairFrom(data, id)), p_consent: consent,
    });
    if (error) setError(error.message);
    else await refresh();
    setBusy(false);
  }

  if (!choosing) return <button className={styles.primary} type="button" onClick={() => setChoosing(true)}>Set up move-out audit</button>;
  return (
    <form className={styles.form} onSubmit={start} onChange={(event) => { if (event.target instanceof HTMLSelectElement) setConsent(false); }}>
      <p>Choose one pair from the same spot in each room. Leave missing photos unselected and add them later.</p>
      <fieldset disabled={busy} className={styles.form}>
        {rooms.map((room) => <div key={room.id} className={styles.auditRoom}><h3>{room.name}</h3><PairFields room={room} renderPhoto={renderPhoto} /></div>)}
        <Consent checked={consent} setChecked={setConsent} />
        <button className={styles.primary}>{busy ? 'Starting audit…' : 'Start audit'}</button>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </form>
  );
}

function Consent({ checked, setChecked }: { checked: boolean; setChecked: (value: boolean) => void }) {
  return (
    <label className={styles.comparisonConsent}>
      <input type="checkbox" required checked={checked} onChange={(event) => setChecked(event.target.checked)} />
      <span>I checked the selected pairs and agree to let our system analyze these photos.</span>
    </label>
  );
}

function RoomReview({ job, room, supabase, refresh, refreshPhotos, renderPhoto, onRetake }: {
  job: AuditRoom; room: Room; supabase: SupabaseClient; refresh: () => Promise<void>; renderPhoto: RenderPhoto;
  refreshPhotos: () => Promise<void>; onRetake: Retake;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canResume = ['awaiting_photos', 'needs_review', 'failed'].includes(job.status);
  const hasPair = room.inspection_photos.some((photo) => photo.phase === 'move_in') && room.inspection_photos.some((photo) => photo.phase === 'move_out');
  const disagree = job.status === 'needs_review' && job.condition_finding?.status === 'ready' && job.evidence_finding?.status === 'ready';
  const retakePhase = job.before_id ? 'move_out' : 'move_in';

  async function resume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || busy) return;
    const pair = pairFrom(new FormData(event.currentTarget), room.id);
    if (!pair.before_id || !pair.after_id) { setError('Choose a move-in and a move-out photo.'); return; }
    if (job.status === 'needs_review' && pair.before_id === job.before_id && pair.after_id === job.after_id) {
      setError('Choose a different photo or take a new photo before resuming.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await supabase.rpc('resume_move_out_audit_room', { p_job: job.id, p_before: pair.before_id, p_after: pair.after_id, p_consent: consent });
    if (result.error || !result.data) setError(result.error?.message ?? 'This room changed. Refresh the audit and try again.');
    else await refresh();
    setBusy(false);
  }

  return (
    <article id={`audit-room-${room.id}`} className={styles.auditRoom}>
      <h3>{room.name} · {job.category ? categories[job.category] : statuses[job.status]}</h3>
      {disagree && <p>The reviewers disagreed. Check both findings against the photos.</p>}
      {job.status === 'awaiting_photos' && <p>Choose a move-in and move-out photo that show the same spot.</p>}
      {(job.condition_finding || job.evidence_finding) && <details className={styles.comparisonHistory}>
        <summary>Photos and reviewer findings</summary>
        <div className={`${styles.phases} ${styles.comparisonPair}`}>
          {job.before_id && <div><strong>Move-in</strong>{renderPhoto(room, job.before_id)}</div>}
          {job.after_id && <div><strong>Move-out</strong>{renderPhoto(room, job.after_id)}</div>}
        </div>
        {job.condition_finding && <p><strong>Condition reviewer</strong> {job.condition_finding.category && `${categories[job.condition_finding.category]}. `}{job.condition_finding.summary}</p>}
        {job.evidence_finding && <p><strong>Evidence reviewer</strong> {job.evidence_finding.category && `${categories[job.evidence_finding.category]}. `}{job.evidence_finding.summary}</p>}
      </details>}
      {canResume && <p><a className={styles.back} href="#capture-inspection-photo" onClick={() => onRetake(room.id, retakePhase)}>
        {retakePhase === 'move_in' ? 'Add a move-in photo' : 'Add or retake a move-out photo'} for {room.name}
      </a></p>}
      {canResume && <details className={styles.comparisonHistory} onToggle={(event) => { if (event.currentTarget.open) void refreshPhotos(); }}>
        <summary>Choose photos and resume this room</summary>
        {hasPair ? <form className={styles.form} onSubmit={resume} onChange={(event) => { if (event.target instanceof HTMLSelectElement) setConsent(false); }}>
          <fieldset className={styles.form} disabled={busy}>
            <PairFields room={room} job={job} renderPhoto={renderPhoto} />
            <Consent checked={consent} setChecked={setConsent} />
            <button className={styles.primary}>{busy ? 'Queuing…' : 'Resume room'}</button>
          </fieldset>
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </form> : <p>Add photos for both inspection phases before resuming.</p>}
      </details>}
    </article>
  );
}
