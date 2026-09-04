# MohammadOS Execution Checklist

## Completed in this phase

- [x] Record the local-first architecture baseline.
- [x] Define owner and guest as separate workspaces.
- [x] Define the finance ledger rules.
- [x] Add automated tests for date, Persian week, schedule signatures, and habit
  recurrence validation.
- [x] Add a repeatable `npm run test` command.
- [x] Add a disabled record-level sync foundation with a one-time baseline
  seed and a visible preparation status.

## Phase 1 — stability and mobile

- [ ] Run `npm run lint`, `npm run test`, and `npm run build` on every change.
- [ ] Test the installed PWA on Xiaomi Note 14 Pro.
- [ ] Test offline startup, refresh, background/foreground, Android Back, and
  keyboard/viewport behavior.
- [ ] Run Lighthouse on mobile and desktop.
- [ ] Check WCAG 2.2 AA: focus visibility, target size, labels, contrast,
  dialogs, status messages, and keyboard navigation.
- [ ] Remove unused Vite/React starter assets.
- [ ] Replace remaining user-facing `console.error` paths with the project
  logger after verifying no sensitive data is recorded.

## Phase 2 — two accounts

- [ ] Create an external Auth project only after its URL and public key are
  available.
- [ ] Add `AuthService` abstraction; pages must not call a provider directly.
- [ ] Add owner and guest workspaces plus membership records.
- [ ] Disable public signup; provision exactly two accounts manually.
- [ ] Protect every cloud table with row-level policies.
- [ ] Enforce guest restrictions on the server/data layer.
- [ ] Validate the AI API token server-side and apply per-user rate limits.
- [ ] Add logout, password reset, session expiry, and clear Persian errors.

## Phase 3 — sync

- [x] Add stable `client_id`.
- [x] Add automatic snapshot sync with explicit first-device setup and conflict
  protection.
- [x] Add retry backoff metadata for temporary cloud failures.
- [x] Show synced, pending, offline, retry-wait, conflict, and failed states.
- [x] Refresh the active app after an automatic cloud pull.
- [ ] Migrate from snapshot sync to record-level atomic domain-write + outbox.
- [x] Add the local outbox table and atomic helper contract as a transition bridge.
- [x] Record habit, schedule, gate, course, day-log, and life-wheel mutations in the local outbox.
- [x] Show the local outbox count on the Sync page.
- [ ] Run `supabase/record_sync_schema.sql` in the production Supabase project
  and verify the baseline status for owner and guest independently.
- [ ] Add record-level retry queue with backoff and offline mutation delivery.
- [ ] Add tombstones for deletions.
- [ ] Add record-level conflict resolution and tombstone acknowledgement.
- [ ] Migrate existing Dexie data only after a local backup is verified.
- [ ] Test two devices editing the same record.

## Phase 4 — finance

- [ ] Add financial accounts without full card numbers.
- [ ] Add income, expense, transfer, and split entries.
- [ ] Add categories and monthly budgets.
- [ ] Derive balances and report totals from the ledger.
- [ ] Add monthly review and comparison with the previous month.
- [ ] Keep financial data out of AI prompts by default.
- [ ] Add encryption only after a tested recovery strategy exists.

## Phase 5 — lightweight admin

- [ ] Owner-only Settings page.
- [ ] Enable/disable guest.
- [ ] Show sync, storage, backup, and last activity status.
- [ ] Allow owner to revoke guest access.
- [ ] Do not add organizations, invitations, billing, or SaaS analytics yet.

## Release gate

- [ ] Backup exported and import-tested.
- [ ] `npm run lint` passes.
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] `npm audit --omit=dev --audit-level=high` passes.
- [ ] Manual phone and desktop smoke tests pass.
- [ ] No secret appears in tracked files or build output.
