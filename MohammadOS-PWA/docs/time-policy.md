# MohammadOS Time Policy

Status: specification only. This document does not change current date/time behavior.

## 1. Instant

An **Instant** is a specific point on the global timeline.

- Storage format: ISO-8601 UTC string.
- Example: `2026-09-10T20:30:00Z`
- An Instant must not be used to determine a Civil Date without applying the account Timezone Policy.

## 2. Civil Date

A **Civil Date** is the calendar date produced after converting an Instant to the account timezone.

- Format: `YYYY-MM-DD`
- Canonical storage representation: Gregorian `YYYY-MM-DD`.
- Example:

  - Instant: `2026-09-10T20:30:00Z`
  - Account timezone: `Asia/Tehran`
  - Civil Date: `2026-09-11`

A Civil Date is a date identity, not an Instant. It must not be shifted merely because the machine timezone changes.

## 3. Account Timezone

The MohammadOS v1 default account timezone is:

```text
Asia/Tehran
```

Until account-profile timezone support exists, this default remains the active policy. The default must be applied centrally rather than scattered across business logic.

In a future version, the source may move from a fixed `DEFAULT_TIMEZONE` to:

```text
user.profile.timezone
```

Changing the account timezone policy must not change the meaning of already stored Instants.

## 4. Local Time

A **Local Time** is the account-local clock time.

- Format: `HH:mm`
- Meaning: clock time in the account timezone.
- Local Time alone must not be used to store an event that requires a globally ordered Instant.

When an event needs both a date and a clock time, its timezone context must be explicit. When it needs global ordering or synchronization, an Instant is required.

## 5. Week Policy

MohammadOS uses a Saturday-to-Friday week:

- Week starts: Saturday
- Week ends: Friday
- Week/period identity is derived from the Civil Date after applying the account timezone.

The week policy must not depend on the device timezone when the account timezone is known.

## 6. Display

- Display locale: `fa-IR` where Persian presentation is required.
- Display calendar: Persian calendar presentation may be used in the UI.
- Canonical stored Civil Date remains Gregorian `YYYY-MM-DD`.
- Display formatting must not replace or mutate the canonical stored value.

## 7. Future Timezone Change

The future migration path is:

```text
DEFAULT_TIMEZONE
        ↓
user.profile.timezone
```

This is a policy-source change, not a change to the representation of Instants. Existing UTC Instants remain unchanged; only their Civil Date/Local Time presentation may differ when the account timezone policy changes.

## 8. Scope of this Step

This document defines the target contract for Phase 2 / Step B. It does not migrate current date calculations, replace `new Date()`, change database fields, or alter existing page/repository behavior.
