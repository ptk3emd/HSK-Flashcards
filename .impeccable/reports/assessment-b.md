# Assessment B — Technical Audit (2026-10-28)

Target: src/; fresh Playwright Chromium context, executable /usr/bin/chromium, localhost:3000, mobile viewport 390×844. Independent from Assessment A. No UI changes made by this assessment.

## Implementation integrity
Pass: coherent product-specific system (glass ledger, hanzi, paired day/night themes, per-course accents). Detector findings concern metadata drift and literal token choices, not a generic scaffold verdict.

## Scores
Accessibility 2/4; Performance 3/4; Theming 3/4; Responsive 2/4; Integrity 3/4. Total 13/20 (Acceptable). Scores are bounded inspection judgments, not WCAG certification or measured performance benchmarks.

## Verified issues

1. **P1 — Tertiary light-theme text lacks contrast.** `src/styles/mandarin-card.css:58` uses rgba(60,60,67,.55); `src/index.css:213,235` uses it on placeholders and helper text. Composite over pure white is RGB(147.75,147.75,151.6), contrast **3.03:1**, below WCAG 1.4.3 requirement 4.5:1 for these small texts. Colored glass backgrounds require their own composited verification and do not establish a pass. Increase token contrast and verify both themes/courses. Suggested `/impeccable colorize`.
2. **P2 — Interaction targets below the project's 44px floor.** `src/components/CourseSwitch.tsx:33` (line may shift under layout changes) is min-h-9; measured 36px. `src/components/CardBrowser.tsx:318,334,347` has 36px search mode buttons/selects. `src/index.css:52` makes range inputs 16px high. Planner controls commonly40px. Measured fresh Chromium mobile page. This violates the documented touch floor; 36px buttons are not automatically WCAG AA target-size failures (AA 2.5.8 is24px with exceptions). Native range hit-area16px needs surrounding space/label considered before assigning AA nonconformance. Increase hit area without enlarging visual track. `/impeccable layout`, `/impeccable adapt`.
3. **P2 — Mobile fields use14px and may trigger iOS focus zoom.** `src/components/CardBrowser.tsx:272` search uses text-sm, also date `DeckDashboard.tsx:281` and voice text fields. DESIGN.md:218 explicitly requires16px minimum. Chromium confirms14px; Safari focus-zoom behavior not physically tested. Set editable fields to16px at mobile breakpoint. `/impeccable adapt`.
4. **P2 — Failed level downloads return only to console.** `src/components/DeckDashboard.tsx:142,170` catches dynamic import failures with console.error, resets loading and presents no user-visible recovery. Under chunk/network failure student cannot distinguish failure from ignored tap. Add inline role=alert with retry. Source-verified failure path, not induced during this assessment. `/impeccable harden`.
5. **P2 — Default dependency installation fails.** Root confirmed npm ci ERESOLVE: explicit esbuild0.25 conflicts with Vite8 optional peer0.27/0.28. Legacy-peer workaround allowed local inspection, but contributor/CI install reproducibility needs a separate dependency correction. No package files changed by this assessment.
6. **P3 — Design metadata disagrees with prose and course variants.** Detector84 advisory entries across14 files. 39 font-size,36 color,9 radius. Many are not UI defects: prose DESIGN.md:165–167 allows14px and11px wordmark; DESIGN.md:210 explicitly specifies10px state badges; DESIGN.md:197 allows8–10px small controls; front matter omits these values. French/Italian accents intentionally override Mandarin world. Keep raw output as advisory signals, do not remove course identity to satisfy scan. `/impeccable document` separately if requested.

Counts: P0=0, P1=1, P2=4, P3=1 (6 grouped issues). Detector84 is not84 user-facing defects.

## Mechanical evidence

Bundled `impeccable detect --json src` produced `.impeccable/reports/detector-before.json`,84 findings, all severity advisory: design-system-font-size39, design-system-color36, design-system-radius9. No error findings. Examples verified as false positive/UI-nonissue: BrandHeader11px (DESIGN prose explicitly allows), CardBrowser badge10px (explicitly allowed), study seal10px (component front matter and prose explicitly allow). Course accent findings are documentation coverage, not reason to recolor French/Italian.

Browser mutable injection preflight succeeded (document.title and appended inline script). Started bundled live server8400, injected http://localhost:8400/detect.js; console returned `[impeccable] No anti-patterns found.` No claim of a visible overlay: scanner found nothing to mark. Server PID1307 stopped after collection. No native browser presentation available, so fallback Playwright used. CLI source and runtime checks have different coverage.

Mobile390px: dashboard, dictionary, statistics, settings each document.scrollWidth=390, no horizontal overflow in tested default states. This does not cover all widths, long content or zoom. Drawing search synthesized real touch via Chromium CDP: first diagonal created1polyline; touchCancel then next touch sequence resulted3polylines total and no stuck capture. Cancel currently commits a stroke, which may be intended; no gesture blocker established. Physical device, Safari and Firefox remain untested.

## Positive evidence

- Global focus-visible palette ring (`src/index.css:18`) and shared focus trap/Escape/focus return (`useDialogFocus.ts`).
- Paired day/night variables, in-app theme custom variant, deliberate reduced-motion fade and static stroke alternative, reduced-transparency fallback.
- Study gestures clear stale drag/tap state on blur/background (`StudySession.tsx:610`), pointer capture, cancel cleanup, conditional touch-action.
- Lazy dictionary/stats/learn routes, lazy glyph index, worker-backed planner, bounded dictionary display150rows. No measured frame-rate or network speed claims.

## Next commands

Prioritize colorize/harden, then adapt for remaining mobile controls; preserve already authorized layout scope. Finish `/impeccable polish`, then rerun audit after corrections. Commands can run individually or together in any order the user chooses.
