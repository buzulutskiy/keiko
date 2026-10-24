# Material Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make material completion lead to a context-specific real-world action.
**Architecture:** Keep single-file app conventions, add pure material overview and outward-action helpers, reuse existing sheet and profile sync. Private catalog owns context; production code owns UI and schemas.
**Tech Stack:** Vanilla JS/CSS, existing Gist persistence, Node test harness.
**Spec:** docs/superpowers/specs/2026-10-24-material-path-design.md

## Global Constraints
- No automatic payments, fabricated completion percentages, or payment verification claims.
- Real external links; escape descriptions and allow HTTPS URLs only.
- Preserve weekly/monthly mode and profiles, activity data and unrelated checkout changes.
- Support 320 CSS px and existing theme tokens.

## Review Focus
- Archived-but-unfinished drawings must not unlock action.
- Zero-page/list books and plain drawings must retain truthful progress.
- Deleted records and same-named archived aliases must not duplicate cards.
- Closing/reopening or syncing twice must not duplicate action.
- New catalog fields must not overwrite unrelated live content.

## Tasks
- [x] Add failing tests for migration/export, idempotent action records, tombstone merge, completion gating and sort.
- [x] Implement overview/progress helpers and outwardActions persistence. Run tests.
- [x] Implement material cards, mode switch, accessible help sheet and explicit mark/undo. Verify UI at 320px and current data.
- [x] Prepare all current material suggestions with verified primary links; patch live catalog immediately after fresh read and verify all other fields unchanged.
- [ ] Run checks, publish, verify deployed version and deliver concise status.
