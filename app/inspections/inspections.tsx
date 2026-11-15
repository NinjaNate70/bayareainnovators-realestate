'use client';

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from 'react';
import { saveInspectionPhoto, validateInspectionImage } from '@/lib/inspection-photos';
import { ComparePhotos } from './compare-photos';
import { MoveOutAudit } from './move-out-audit';
import styles from './inspections.module.css';

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const client = projectUrl && publishableKey ? createClient(projectUrl, publishableKey) : null;
const bucket = 'inspection-photos';
const phases = [
  { value: 'move_in', label: 'Move-in' },
  { value: 'move_out', label: 'Move-out' },
] as const;

type Phase = (typeof phases)[number]['value'];
type Lease = { id: string; name: string };
type Photo = { id: string; phase: Phase; original_name: string; content_type: string; storage_path: string; uploaded_at: string };
type Room = { id: string; name: string; inspection_photos: Photo[] };
type Gallery = { rooms: Room[]; urls: Record<string, string> };
type CaptureControls = { prepare: (roomId: string, phase: Phase) => void };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function Inspections() {
  const [user, setUser] = useState<User | null>();

  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!client) {
    return <p className={styles.panel}>My Inspections needs a Supabase connection. See the repository setup guide.</p>;
  }
  if (user === undefined) return <p role="status">Checking your sign-in…</p>;
  if (user === null) return <SignIn supabase={client} />;
  return <LeaseList key={user.id} supabase={client} user={user} />;
}

function SignIn({ supabase }: { supabase: SupabaseClient }) {
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email')).trim();
    const password = String(data.get('password'));
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (creatingAccount) {
        const result = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/inspections` },
        });
        if (result.error) throw result.error;
        if (!result.data.session) setMessage('Check your email to confirm your account, then sign in.');
      } else {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
      }
    } catch (cause) {
      setError(errorMessage(cause, 'Could not sign in. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.panel} ${styles.signIn}`}>
      <h2>{creatingAccount ? 'Create your account' : 'Sign in'}</h2>
      <p>Use the same account on your phone and computer to see your photos on both.</p>
      <form className={styles.form} onSubmit={submit}>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete={creatingAccount ? 'new-password' : 'current-password'} minLength={creatingAccount ? 8 : undefined} required /></label>
        <button className={styles.primary} disabled={busy}>{creatingAccount ? 'Create account' : 'Sign in'}</button>
      </form>
      <button type="button" className={styles.textButton} disabled={busy} onClick={() => {
        setCreatingAccount(!creatingAccount);
        setError('');
        setMessage('');
      }}>{creatingAccount ? 'Back to sign in' : 'Create an account'}</button>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function LeaseList({ supabase, user }: { supabase: SupabaseClient; user: User }) {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseId, setLeaseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const loadLeases = useCallback(async () => {
    const { data, error } = await supabase.from('leases').select('id, name').order('created_at');
    if (error) {
      setError(error.message);
    } else {
      setError('');
      setLeases(data);
      setLeaseId((current) => current || data[0]?.id || '');
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadLeases(); });
    return () => { active = false; };
  }, [loadLeases]);

  async function addLease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name')).trim();
    if (!name) { setError('Enter a lease name.'); return; }
    setAdding(true);
    const { data, error } = await supabase.from('leases').insert({ name }).select('id, name').single();
    if (error) {
      setError(error.message);
    } else {
      setError('');
      setLeases((current) => [...current, data]);
      setLeaseId(data.id);
      form.reset();
    }
    setAdding(false);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) setError(error.message);
  }

  return (
    <>
      <div className={styles.account}>
        <span>{user.email}</span>
        <button className={styles.secondary} type="button" onClick={signOut}>Sign out</button>
      </div>
      <section className={styles.panel}>
        <h2>Leases</h2>
        {loading && <p role="status">Loading leases…</p>}
        {!loading && leases.length === 0 && !error && <p>Add a lease to start documenting rooms.</p>}
        {leases.length > 0 && (
          <label>Current lease
            <select value={leaseId} onChange={(event) => setLeaseId(event.target.value)}>
              {leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.name}</option>)}
            </select>
          </label>
        )}
        <form className={styles.inlineForm} onSubmit={addLease}>
          <label>New lease name<input name="name" placeholder="e.g. Oak Street apartment" maxLength={120} required /></label>
          <button className={styles.secondary} disabled={loading || adding}>Add lease</button>
        </form>
        {error && <p className={styles.error} role="alert">{error} <button type="button" className={styles.textButton} onClick={loadLeases}>Reload leases</button></p>}
      </section>
      {leaseId && <LeaseInspection key={leaseId} supabase={supabase} leaseId={leaseId} userId={user.id} />}
    </>
  );
}

function LeaseInspection({ supabase, leaseId, userId }: { supabase: SupabaseClient; leaseId: string; userId: string }) {
  const capture = useRef<CaptureControls>(null);
  const [gallery, setGallery] = useState<Gallery>({ rooms: [], urls: {} });
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const galleryRequest = useRef(0);

  const loadGallery = useCallback(async () => {
    const request = ++galleryRequest.current;
    const result = await supabase.from('rooms')
      .select('id, name, inspection_photos (id, phase, original_name, content_type, storage_path, uploaded_at)')
      .eq('lease_id', leaseId)
      .not('inspection_photos.uploaded_at', 'is', null)
      .order('name')
      .order('uploaded_at', { referencedTable: 'inspection_photos', ascending: false })
      .returns<Room[]>();
    if (request !== galleryRequest.current) return;
    if (result.error) {
      setError(result.error.message);
      setLoaded(true);
      return;
    }

    const paths = result.data.flatMap((room) => room.inspection_photos.map((photo) => photo.storage_path));
    const urls: Record<string, string> = {};
    let signingError = false;
    if (paths.length) {
      const signed = await supabase.storage.from(bucket).createSignedUrls(paths, 900);
      if (request !== galleryRequest.current) return;
      signingError = Boolean(signed.error || signed.data?.some((item) => !item.signedUrl));
      for (const item of signed.data ?? []) {
        if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
      }
    }
    setGallery({ rooms: result.data, urls });
    setError(signingError ? 'Some photos could not be opened. Refresh photos to try again.' : '');
    setLoaded(true);
  }, [supabase, leaseId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadGallery(); });
    return () => { active = false; };
  }, [loadGallery]);

  async function addRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name')).trim();
    if (!name) { setError('Enter a room name.'); return; }
    setAdding(true);
    const { error } = await supabase.from('rooms').insert({ lease_id: leaseId, name });
    if (error) {
      setError(error.code === '23505' ? 'This lease already has a room with that name.' : error.message);
    } else {
      form.reset();
      await loadGallery();
    }
    setAdding(false);
  }

  return (
    <>
      <section className={styles.panel}>
        <h2>Rooms</h2>
        <form className={styles.inlineForm} onSubmit={addRoom}>
          <label>New room name<input name="name" placeholder="e.g. Kitchen" maxLength={80} required /></label>
          <button className={styles.secondary} disabled={adding}>Add room</button>
        </form>
      </section>
      {gallery.rooms.length > 0 && <CapturePhoto supabase={supabase} userId={userId} rooms={gallery.rooms} onSaved={loadGallery} captureRef={capture} />}
      {gallery.rooms.length > 0 && <MoveOutAudit supabase={supabase} leaseId={leaseId} rooms={gallery.rooms} refreshPhotos={loadGallery}
        onRetake={(roomId, phase) => capture.current?.prepare(roomId, phase)} renderPhoto={(room, id) => {
        const photo = gallery.rooms.find((item) => item.id === room.id)?.inspection_photos.find((item) => item.id === id);
        return photo ? <PhotoPreview key={`${id}/${gallery.urls[photo.storage_path]}`} url={gallery.urls[photo.storage_path]} photo={photo} /> : null;
      }} />}
      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <h2>Inspection photos</h2>
          <button type="button" className={styles.secondary} onClick={loadGallery}>Refresh photos</button>
        </div>
        {!loaded && <p role="status">Loading photos…</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {loaded && !error && gallery.rooms.length === 0 && <p>Add a room to start taking photos.</p>}
        {gallery.rooms.map((room) => (
          <section key={room.id} className={styles.room}>
            <h3>{room.name}</h3>
            <div className={styles.phases}>
              {phases.map((phase) => (
                <div className={styles.phase} key={phase.value}>
                  <h4>{phase.label}</h4>
                  {room.inspection_photos.every((photo) => photo.phase !== phase.value) && <p>No photos yet.</p>}
                  <ul className={styles.photos}>
                    {room.inspection_photos.filter((photo) => photo.phase === phase.value).map((photo) => (
                      <li key={photo.id}>
                        <PhotoPreview key={gallery.urls[photo.storage_path]} url={gallery.urls[photo.storage_path]} photo={photo} />
                        <time dateTime={photo.uploaded_at}>Uploaded {new Date(photo.uploaded_at).toLocaleDateString()}</time>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <ComparePhotos supabase={supabase} roomId={room.id} photos={room.inspection_photos} renderPhoto={(id) => {
              const photo = room.inspection_photos.find((item) => item.id === id);
              return photo ? <PhotoPreview key={`${id}/${gallery.urls[photo.storage_path]}`} url={gallery.urls[photo.storage_path]} photo={photo} /> : null;
            }} />
          </section>
        ))}
      </section>
    </>
  );
}

function PhotoPreview({ url, photo }: { url?: string; photo: Photo }) {
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<string>();
  const isHeic = ['image/heic', 'image/heif'].includes(photo.content_type);

  useEffect(() => {
    if (!url || !failed || !isHeic) return;

    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function decode(source: string) {
      const response = await fetch(source, { signal: controller.signal });
      if (!response.ok) return;
      const blob = await response.blob();
      const { heicTo } = await import('heic-to/csp');
      if (controller.signal.aborted) return;
      const image = await heicTo({ blob, type: 'image/jpeg', quality: 0.8 });
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(image);
      setPreview(objectUrl);
    }
    void decode(url).catch(() => { /* Keep the original available if decoding fails. */ });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [failed, isHeic, url]);

  const name = photo.original_name;
  if (!url) return <p>{name} · Preview unavailable</p>;
  const downloadUrl = new URL(url);
  downloadUrl.searchParams.set('download', name);
  const imageUrl = failed ? preview : url;

  return (
    <a href={downloadUrl.href} aria-label={`Download original ${name}`}>
      {imageUrl ? (
        // Load the private image directly instead of caching it on the Next.js image server.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} loading="lazy" onError={() => { setFailed(true); setPreview(undefined); }} />
      ) : <span>Download original · {name}</span>}
    </a>
  );
}

function CapturePhoto({ supabase, userId, rooms, onSaved, captureRef }: {
  supabase: SupabaseClient;
  userId: string;
  rooms: Room[];
  onSaved: () => Promise<void>;
  captureRef: Ref<CaptureControls>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '');
  const [phase, setPhase] = useState<Phase>('move_in');
  const [auditRoomId, setAuditRoomId] = useState('');
  const captureForm = useRef<HTMLFormElement>(null);
  const pendingId = useRef<string | null>(null);

  useImperativeHandle(captureRef, () => ({
    prepare(room, phase) {
      if (busy) return;
      pendingId.current = null;
      setRoomId(room);
      setPhase(phase);
      setAuditRoomId(room);
      setFile(null);
      for (const input of captureForm.current?.querySelectorAll<HTMLInputElement>('input[type="file"]') ?? []) input.value = '';
      setError('');
      setMessage('');
    },
  }), [busy]);

  function selectFile(next: File | null) {
    pendingId.current = null;
    setFile(next);
    setError('');
    setMessage('');
  }

  async function uploadPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const contentType = validateInspectionImage(file);
      const photoId = pendingId.current ?? crypto.randomUUID();
      pendingId.current = photoId;
      const path = `${userId}/${roomId}/${photoId}`;
      const storage = supabase.storage.from(bucket);

      await saveInspectionPhoto({
        stage: async () => {
          const { error } = await supabase.from('inspection_photos').upsert({
            id: photoId,
            room_id: roomId,
            phase,
            original_name: file.name.trim().slice(0, 255) || 'Inspection photo',
            content_type: contentType,
          }, { onConflict: 'id', ignoreDuplicates: true });
          if (error) throw new Error(error.message);
        },
        upload: async () => {
          const { error } = await storage.upload(path, await file.arrayBuffer(), { contentType, upsert: false });
          if (error) throw error;
        },
        exists: async () => (await storage.exists(path)).data === true,
        finish: async () => {
          const { data, error } = await supabase.rpc('complete_inspection_photo', { photo_id: photoId });
          if (error || data !== true) throw new Error(error?.message ?? 'Could not confirm the upload. Try again.');
        },
      });
      pendingId.current = null;
      setFile(null);
      for (const input of form.querySelectorAll<HTMLInputElement>('input[type="file"]')) input.value = '';
      setMessage('Photo saved. You can open it on another device with the same account.');
      await onSaved();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not upload your photo. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="capture-inspection-photo" className={styles.panel}>
      <h2>Add an inspection photo</h2>
      <form ref={captureForm} onSubmit={uploadPhoto}>
        <fieldset className={styles.form} disabled={busy}>
          <div className={styles.phases}>
            <label>Room<select name="room" value={roomId} onChange={(event) => { pendingId.current = null; setRoomId(event.target.value); }}>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select></label>
            <label>Inspection phase<select name="phase" value={phase} onChange={(event) => { pendingId.current = null; setPhase(event.target.value as Phase); }}>
              {phases.map((phase) => <option key={phase.value} value={phase.value}>{phase.label}</option>)}
            </select></label>
          </div>
          <div className={styles.phases}>
            <label>Take a photo<input type="file" accept="image/*" capture="environment" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} /></label>
            <label>Choose an existing photo<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} /></label>
          </div>
          {file && <p className={styles.selectedFile}>Selected photo <strong>{file.name}</strong></p>}
          <button className={styles.primary} disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload photo'}</button>
        </fieldset>
      </form>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {message && <p role="status">{message}</p>}
      {auditRoomId && <p><a href={`#audit-room-${auditRoomId}`} className={styles.back}>Back to audit room</a></p>}
    </section>
  );
}
