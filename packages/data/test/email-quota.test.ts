import { describe, expect, it } from 'vitest';
import { createInMemoryEmailQuotaRepository, reserveEmailQuota, OCI_EMAIL_DAILY_LIMIT, OCI_EMAIL_MONTHLY_LIMIT } from '../src/email-quota.js';

const now = Date.UTC(2026,8,12,12);
describe('OCI free-allowance guard', () => {
  it('accepts at most 90 concurrent reservations in a rolling 24-hour period', async () => {
    const repo = createInMemoryEmailQuotaRepository();
    const results = await Promise.all(Array.from({length:100},()=>repo.reserve(now)));
    expect(results.filter(Boolean)).toHaveLength(90);
    expect(await repo.reserve(now+24*60*60*1000-1)).toBe(false);
    expect(await repo.reserve(now+24*60*60*1000)).toBe(true);
  });
  it('atomically reserves both recipient and records copy', async () => {
    const repo=createInMemoryEmailQuotaRepository();
    const results=await Promise.all(Array.from({length:50},()=>repo.reserve(now,2)));
    expect(results.filter(Boolean)).toHaveLength(45);
    expect(reserveEmailQuota({month:'2026-09',count:2699,recent:[],lastAt:now},now,2)).toBeNull();
  });
  it('stops at 2700 in a UTC calendar month, below the documented free allowance', () => {
    const last = reserveEmailQuota({month:'2026-09',count:2699,recent:[],lastAt:now-1},now);
    expect(last?.count).toBe(2700);
    expect(reserveEmailQuota({...last!,recent:[]},now+1)).toBeNull();
    expect(OCI_EMAIL_MONTHLY_LIMIT).toBeLessThan(3000);
    expect(OCI_EMAIL_DAILY_LIMIT).toBe(90);
  });
  it('resets the calendar-month counter without resetting the rolling-day guard', () => {
    const boundary = Date.UTC(2026,9,1);
    const previous = {month:'2026-09',count:2700,recent:Array(90).fill(boundary-1),lastAt:boundary-1};
    expect(reserveEmailQuota(previous,boundary)).toBeNull();
    expect(reserveEmailQuota(previous,boundary+24*60*60*1000)).toMatchObject({month:'2026-10',count:1});
  });
  it('fails closed on corrupt state or a clock rollback', () => {
    expect(() => reserveEmailQuota(null,NaN)).toThrow();
    expect(() => reserveEmailQuota({month:'invalid',count:0,recent:[],lastAt:now},now)).toThrow();
    expect(reserveEmailQuota({month:'2026-09',count:1,recent:[now],lastAt:now},now-1)).toBeNull();
  });
});
