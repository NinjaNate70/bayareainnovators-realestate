import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRecovery, daysUntil } from '../lib/estimate.ts';
import { demoCase } from '../lib/fixtures/demo-case.ts';

test('fixture range includes three disputable charges and excludes fair/unknown', () => { const result=estimateRecovery(demoCase); assert.equal(result.low,650);assert.equal(result.high,900);assert.equal(result.included.length,3); });
test('real uploads and stale or unaudited cases never inherit fixture estimates', () => { for(const patch of [{demo:false},{stale:true},{audited:false}]) assert.equal(estimateRecovery({...demoCase,...patch}),null); });
test('missing evidence and invalid ranges are excluded; deposit caps recovery',()=>{const stripped={...demoCase,charges:demoCase.charges.map(c=>({...c,sources:[]}))};assert.equal(estimateRecovery(stripped),null);const capped=estimateRecovery({...demoCase,deposit:600,returned:500});assert.equal(capped.high,100);const invalid={...demoCase,charges:demoCase.charges.map(c=>({...c,low:-1}))};assert.equal(estimateRecovery(invalid),null);});
test('date-only countdown handles future, elapsed and unknown dates',()=>{assert.equal(daysUntil('2026-11-21','2026-11-14'),7);assert.equal(daysUntil('2026-11-13','2026-11-14'),-1);assert.equal(daysUntil(''),null);});
