import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The reconciler's core is an interval-bound closure; the regressions it fixes
// are in its SQL/strategy. These static checks pin the invariants:
//  - pagination via last_reconciled_at (rotates through ALL rows, not the same 50)
//  - cursor stamped per row regardless of outcome
//  - period update even when status is unchanged
//  - expired trials and ended cancelled periods handled
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'jobs', 'billingReconciler.ts'), 'utf8');

describe('billing reconciler (regression checks)', () => {
  it('paginates by last_reconciled_at instead of updated_at', () => {
    expect(src).toContain('"last_reconciled_at" ASC NULLS FIRST');
    expect(src).not.toContain('ORDER BY s."updated_at"');
  });

  it('stamps the reconciliation cursor on every row', () => {
    // Both the success and failure paths stamp last_reconciled_at so one bad
    // record can't block the scan and every cycle covers new rows.
    const stamps = src.match(/SET "last_reconciled_at" = CURRENT_TIMESTAMP/g);
    expect(stamps?.length).toBeGreaterThanOrEqual(2);
  });

  it('updates the billing period even when the status did not change', () => {
    expect(src).toContain('periodChanged');
    // update is called when statusChanged OR periodChanged
    expect(src).toMatch(/if \(statusChanged \|\| periodChanged\)/);
    expect(src).toContain('reconciliation_period_update');
  });

  it('expires trials past trial_ends_at', () => {
    expect(src).toContain("'trial_expired'");
    expect(src).toContain('"trial_ends_at" < CURRENT_TIMESTAMP');
  });

  it('expires cancelled subs after the contracted period ends', () => {
    expect(src).toContain("'expired'");
    expect(src).toContain('"current_period_end" < CURRENT_TIMESTAMP');
  });
});
