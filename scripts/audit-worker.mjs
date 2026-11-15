import { setTimeout as sleep } from 'node:timers/promises';

const secret = process.env.AUDIT_WORKER_SECRET;
const appUrl = process.env.AUDIT_APP_URL;
if (!appUrl || !secret) throw new Error('Set AUDIT_APP_URL and AUDIT_WORKER_SECRET.');
const endpoint = new URL('/api/inspections/audit/worker', appUrl);
const local = endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
if (endpoint.protocol !== 'https:' && !local) throw new Error('Use HTTPS for a hosted audit worker.');

const headers = { Authorization: `Bearer ${secret}` };
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
}
const stop = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop.abort());

async function run() {
  let idleDelay = 3000;
  while (!stop.signal.aborted) {
    let wait = 3000;
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers, redirect: 'manual',
        signal: AbortSignal.any([stop.signal, AbortSignal.timeout(65_000)]),
      });
      if ([302, 307, 401, 403, 404].includes(response.status)) {
        console.error(`Audit worker could not reach its endpoint (${response.status}). Check the URL, shared secret, and Vercel protection settings.`);
        process.exitCode = 1;
        stop.abort();
      } else if (response.status === 200) {
        idleDelay = 3000;
        wait = 250;
      } else if (response.status === 204) {
        wait = idleDelay;
        idleDelay = Math.min(idleDelay * 2, 30_000);
      } else {
        console.warn(`Audit worker endpoint returned ${response.status}. Retrying in 15 seconds.`);
        wait = 15_000;
      }
      await response.body?.cancel();
    } catch {
      if (!stop.signal.aborted) console.warn('Audit worker request failed. Retrying in 15 seconds.');
      wait = 15_000;
    }
    if (!stop.signal.aborted) await sleep(wait, undefined, { signal: stop.signal }).catch(() => {});
  }
}

console.log('Move-out audit worker started with three concurrent requests.');
await Promise.all(Array.from({ length: 3 }, run));
