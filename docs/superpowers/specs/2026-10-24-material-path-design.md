# Material path and outward action MVP
User requested implementation in Keiko: rename Progress, show all materials newest activity first, progress and last engagement per material; after completion offer a context-specific outward action and record "Я помог". Core intent explicitly confirmed: completion should lead to an action outside oneself.

## Approach
Default Progress route becomes "Мой путь", with "Материалы" and "Занятия" modes. The latter preserves existing weekly/monthly rings and calendar. Material cards use existing cover system and progress algorithms, show last session date or honest no-session state. Sort descending by last activity/completion; unused materials follow. Include archive snapshots without duplicate cards; exclude deleted materials and entries. Archiving alone does not imply completion (legacy pastel snapshot has 0%). An ongoing unstructured drawing has no invented completion percentage.

Completed cards offer "Как помочь"; suggestion explains contextual relationship and opens verified organization link. "Я помог" is an explicit self-reported action, not inferred from opening a link, not payment verification. Persist date, chosen suggestion and optional short note. User can undo with tombstone. No payment integration, prices, automatic transfers or claimed individual impact.

Suggestions for all current Anton materials live in the private catalog under outward metadata. Generic track-based suggestions cover future uncurated materials and are labeled as general. UI and synchronization code only in GitHub. Records live in per-profile outwardActions array, pass migration/export/import/Gist/backup and merge by record id + updatedAt. Deterministic record id per material ensures idempotent marking across devices. Changes do not alter activity sessions or completion flags.

320px minimum, existing design tokens/type/sheets/44px controls. No shelf metaphor in production. Static PWA, no dependencies.
