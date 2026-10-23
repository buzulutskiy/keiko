# Book journeys Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User authorized execution with «да гоу».

**Goal:** Follow confirmed expedition movements in Совы во льдах without revealing unread episodes.
**Architecture:** Private article holds journeys independent of reading trajectories (`routes`). Existing map overlay gains journey layer, controls, screen-coordinate SVG lines and numbered stops. Pure selectors enforce chapter-end progress and preserve repeat visits.
**Tech Stack:** Existing vanilla JS/CSS, Node VM tests, private Gist JSON.
**Spec:** docs/superpowers/specs/2026-10-23-owls-routes.md

## Global Constraints
- 320px mobile minimum; canonical app tokens and existing gestures.
- Future stops and people/trip names with no unlocked stops are not rendered.
- Only literal EPUB movement evidence, no imagined tracks, no separate heroes section.
- Preserve unrelated tools/book.py change; no private book text committed.

## Review Focus
- Same place revisited: distinct numbered episode, no deduplication.
- No completed chapters: explanatory empty state, no future names.
- Participant changes: only explicit person membership; gaps never imply connecting travel.
- Legacy books and reading trajectories: no routes tab unless journeys data exists.
- Late article refresh: resolve route state again without disclosing future steps.

### Task 1: selectors and content
- [ ] Add failing selectors tests to tools/test.js: chapter-end gating, filtering, missing coordinates, repeats, gap segmentation, legacy books.
- [ ] Implement journeyTrips(book), journeyStops(book,trip,person) in app.js.
- [ ] Read all narrative chapter text and curate private dataset with literal movement evidence and per-person membership; verify each evidence string against EPUB.
- [ ] Run selectors and baseline suite.

### Task 2: existing map integration
- [ ] Extend gmLayers, gmВидимые, gmList, gmPins, gmScalePins, gmCard, gmNavRow, gmFocus for journeys; keep places branch unchanged.
- [ ] Add native participant and expedition selects, numbered stop navigation, compact stop card and schematic note.
- [ ] Render lines in stage pixels; preserve drag/pinch and exact click targets. Break lines on person membership gaps and different maps/trips.
- [ ] Check browser at 320 and 390px: empty, several stops, repeats, participant switch, trip switch, places return and direct marker tap.

### Task 3: delivery
- [ ] Update DESIGN.md and material schema documentation.
- [ ] Run node --check app.js, node tools/test.js and browser checks; inspect screenshots.
- [ ] Review diff, publish private article and app via existing release process, verify live versions and content.
