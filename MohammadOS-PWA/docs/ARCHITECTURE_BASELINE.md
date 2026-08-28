# MohammadOS Architecture Baseline

Status: approved design, implementation in phases

## Product boundary

MohammadOS remains a local-first personal operating system. The app must remain
usable without an account or an internet connection. Cloud services are
optional adapters for authentication, multi-device sync, and remote backup.

## Runtime modes

1. Local mode: Dexie/IndexedDB only.
2. Synced mode: authenticated owner workspace plus local-first sync.
3. Guest mode: a separate guest workspace with restricted capabilities.

The guest must never receive access to the owner's financial data, private
notes, backups, or security settings.

## Domain boundaries

- Productivity: habits, day logs, schedules, courses, roadmap, timers.
- Finance: accounts, transactions, transaction entries, categories, budgets.
- Life: life-wheel scores and personal reviews.
- Analytics: derived metrics only; it is not a source of truth.
- Coach: receives explicitly approved, minimized data.

Finance uses a ledger-lite model:

- `income` increases an account.
- `expense` decreases an account.
- `transfer` moves value between accounts and is excluded from income/expense
  totals.
- split transactions contain multiple categorized entries.
- balances are derived from transactions and can be rebuilt.

## Data ownership contract

Cloud records must contain:

```text
id, user_id, workspace_id, created_at, updated_at,
deleted_at, version
```

Every exposed cloud table must enforce row-level authorization. The browser
must never contain a server/service-role key.

Local records may additionally contain:

```text
sync_status, client_id, last_synced_version
```

## Sync contract

All future mutations must use an atomic local transaction:

```text
domain write + outbox write
```

Outbox fields:

```text
op_id, entity, entity_id, operation, payload,
base_version, client_id, created_at, attempt_count,
next_retry_at, status
```

Conflict policy is domain-aware:

- ordinary settings: server version wins;
- independent list records: merge by stable record ID;
- financial records: never silently overwrite; surface a conflict;
- deletion: use a tombstone (`deleted_at`) until every active client has
  acknowledged it.

## Security contract

- public GitHub is allowed, but secrets must remain untracked;
- no full bank-card number is stored;
- Finance must not be sent to the AI service by default;
- UI hiding is not a security boundary;
- owner and guest data must be separated in the data layer;
- authentication and authorization must be tested independently.

## Implementation order

1. Core tests and mobile/accessibility audit.
2. Auth adapter and owner/guest workspaces.
3. API authorization and rate limits.
4. Local outbox and sync worker.
5. Finance ledger-lite.
6. Lightweight owner settings/admin panel.
7. Private receipt storage only when receipt upload is actually needed.
