---
name: Lóutī Mandarim (Hanzi Anki)
description: Glass-on-red FSRS flashcard app for HSK Mandarin — acrylic sheets over a striped red ground, in paired rose-daylight and ember-night themes.
colors:
  ground-rose: "#d87679"
  ground-night: "#160608"
  ink: "#111113"
  action-red: "#B3261E"
  action-red-deep: "#8F1E18"
  system-red: "#ff3b30"
  focus-red: "#ef4444"
  seal-cream: "#F4EEE3"
  glass-surface: "rgba(255, 248, 246, 0.46)"
  glass-surface-night: "rgba(36, 18, 20, 0.58)"
  glass-field: "rgba(255, 252, 250, 0.58)"
  glass-field-night: "rgba(12, 6, 7, 0.42)"
  glass-solid: "#fbf3f0"
  glass-solid-night: "#2a1417"
  state-new: "oklch(48.8% 0.243 264.376)"
  state-new-night: "oklch(80.9% 0.105 251.813)"
  state-learning: "oklch(50.5% 0.213 27.518)"
  state-learning-night: "oklch(80.8% 0.114 19.571)"
  state-review: "oklch(50.8% 0.118 165.612)"
  state-review-night: "oklch(84.5% 0.143 164.978)"
  chart-target: "#059669"
  chart-target-night: "#10b981"
typography:
  hanzi:
    fontFamily: "Songti SC, STSong, Noto Serif CJK SC, Noto Serif SC, Yu Mincho, Mincho, serif"
    fontWeight: 500
    lineHeight: 1.25
  display:
    fontFamily: "SF Pro Display, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "clamp(22px, 5.5vw, 28px)"
    fontWeight: 500
    lineHeight: 1.45
  body:
    fontFamily: "SF Pro Text, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "SF Pro Text, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.18em"
  mono:
    fontFamily: "SF Mono, Menlo, monospace"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  sheet: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-red}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.action-red-deep}"
  button-glass:
    backgroundColor: "{colors.glass-field}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "44px"
  sheet:
    backgroundColor: "{colors.glass-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "24px"
  glass-field:
    backgroundColor: "{colors.glass-field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "48px"
  bottom-bar:
    backgroundColor: "{colors.glass-surface}"
    rounded: "{rounded.lg}"
    padding: "8px"
  study-seal:
    backgroundColor: "{colors.action-red}"
    textColor: "{colors.seal-cream}"
    rounded: "10px"
    size: "60px"
---

# Design System: Lóutī Mandarim

## Overview

**Creative North Star: "The Glass Ledger"**

Every screen stands in the same red room: a striped red ground — rose by day (#d87679 under a cream-to-crimson radial), ember at night (#160608 under a red glow) — and all work happens on frosted acrylic sheets laid over it. The material is the study card: a translucent surface, 30px blur at 180% saturation, with specular highlights inset along its edges in place of drop shadows. That card has spread outward — study, navigation, settings and the account screens are all the same glass, cut into sheets.

The sheets read as a ledger. One or two per screen, never framed panels inside them; rows run under hairlines with hanzi numerals as their index column (一 二 三 …), counts right-aligned in tabular figures. Red is the only accent hue, and it is also the ground and the action; the only other colors are three state tints that live on numbers. The account surface — sign-in, sign-up, change password, and the account sheet in Settings — extends the same world on a deliberately text-only key: labels, hairlines, values, and the crimson brand seal.

The personality is quiet, bookish and tactile. Two full themes are equal citizens and darkness follows the student's saved choice (the `.night_mode` class), never `prefers-color-scheme`. Motion is restrained — state changes at 150–200ms, entrances on a single rise curve — with every animation dropped under reduced motion and every glass surface falling back to solid under reduced transparency. No emojis, icons only from lucide-react, copy kept terse.

**Key Characteristics:**
- Frosted glass sheets over a striped red ground; depth is specular light, not shadow.
- Every material and ink token ships as a rose-daylight / ember-night pair.
- Hanzi is the typographic lead — serif (Noto Serif SC), weight 500, elastic sizing.
- Ledger rows: hanzi-numeral index, hairline separators, tabular figures.
- One red: ground, action, accent and seal; no second decorative hue.
- State hues on counts and state marks only — new blue, learning red, review green.
- Touch-first: a 44px floor on controls, 56–60px study actions.

## Colors

A one-hue world in two temperatures: red is the ground, the accent and the action, while the only other hues are state tints that belong to numbers.

### Primary
- **Seal Red** (#B3261E): the canonical action red and brand color — the "Lóutī" seal mark, the study seal stamped after each graded answer, the first step of the study ladder, the account screens' primary buttons (Entrar, Criar conta, Alterar senha), the session-complete button, and the browser theme color. Hover deepens to #8F1E18.
- **System Red** (#ff3b30): the study card's in-text accent, inherited from the Anki template — cloze deletions, links, the `<x>`/`<xu>` tags, text selection, and the statistics curve. It marks content inside the card, never chrome.
- **Rose control tint** (Tailwind `red-600`): incumbent control chrome — the active bottom-bar tab, the Estudar CTA, progress-rule fills, active level numerals — wears the same action role one step rose-ward. It reads as the same family; new surfaces use the seal red.

### State
- **New Blue** (oklch(48.8% 0.243 264.376), night oklch(80.9% 0.105 251.813)): counts of unseen cards and the "Novo" tag.
- **Learning Red** (oklch(50.5% 0.213 27.518), night oklch(80.8% 0.114 19.571)): cards in learning and the "Aprendendo" count, and grade-1 marks.
- **Review Green** (oklch(50.8% 0.118 165.612), night oklch(84.5% 0.143 164.978)): review counts and pass marks — password-rule checkmarks, the strength rule once the policy passes, sync success text. The statistics chart reuses a deeper target green (#059669 day, #10b981 night).

### Neutral
- **Ground Rose** (#d87679): light-theme ground base, under a radial gradient of #fae6d4 → #e08285 → #c25258 and 18/36px vertical stripes at very low alpha.
- **Ground Night** (#160608): night ground base, under a red-glow radial and the same stripe rhythm; also the PWA background color.
- **Ink** (#111113): UI text on light surfaces; the study card's own ink steps to a near-black #1d1d1f for card text.
- **Text ramp**: secondary and tertiary inks are alpha forms — rgba(60, 60, 67, 0.78) / 0.55 by day, rgba(235, 235, 245, 0.78) / 0.55 by night.
- **Hairline separator**: 1px rgba(60, 60, 67, 0.18) by day; rgba(84, 84, 88, 0.65) by night.
- **Glass materials**: sheets sit at rgba(255, 248, 246, 0.46) day / rgba(36, 18, 20, 0.58) night under blur(30px) saturate(180%); fields lighten to rgba(255, 252, 250, 0.58) / rgba(12, 6, 7, 0.42) at blur(16px) saturate(160%); popovers densify to rgba(255, 252, 250, 0.84) / rgba(40, 20, 22, 0.8); the reduced-transparency fallback is solid #fbf3f0 / #2a1417.
- **Seal Cream** (#F4EEE3): the glyph and paper-ring color inside the red brand seal.

### Named Rules
**The One Red Rule.** Red is the system's only accent hue: ground, action, selection, seal. No second decorative hue is introduced; the only other hues are the three state tints, and they belong to numbers.

**The Two-Temperature Rule.** Every material and ink token ships as a day/night pair. A new token without its night sibling is incomplete work.

**The State-On-Numerals Rule.** New blue, learning red and review green mark counts, tags and state marks only. They never tint buttons, headings, sheets or navigation.

## Typography

**Display Font:** system sans — "SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui
**Body Font:** system sans — "SF Pro Text", same fallbacks
**Hanzi Lead:** "Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", "Yu Mincho", "Mincho", serif (Noto Serif SC 400/600/700 loaded from Google Fonts)
**Mono Font:** "SF Mono", Menlo

**Character:** The UI stays in the platform's own voice — quiet, fast, invisible — while every character the student came to learn arrives in a deep serif with the weight of print. Hanzi always outranks everything else on its surface; the sans never competes with it.

### Hierarchy
- **Hanzi** (500, elastic clamp(26px…80px) sized from the card's own width in `cqi`, long strings clamp(24px…44px), line-height 1.25): the card face and every hanzi-numeral index.
- **Pinyin** (500, clamp(22px…28px)): under the hanzi, secondary ink.
- **Translation** (500, clamp(20px…26px)): the answer dock, primary ink.
- **Title** (600, 24px, tracking-tight): screen titles — Entrar, Criar conta, Alterar senha, Configurações.
- **Section header** (500, 14px, secondary ink): "Hoje", "Níveis"; settings subheads run 16px semibold inside their sheets.
- **Body** (400, 14–16px, line-height 1.45): field labels 14px medium; helper and error text 12–14px.
- **Label** (600, 12px, uppercase, letter-spacing 0.18em, tertiary ink): field-group legends. The wordmark tag ("Mandarim") is the same role at 11px / 0.2em.
- **Figures** (tabular-nums): every count, interval and right-aligned ledger value.

### Named Rules
**The Hanzi Lead Rule.** Anywhere a character appears it is set in the serif stack and is the largest element on its surface. Never set hanzi in the UI sans, and never use it as texture or watermark.

**The Legend Rule.** Uppercase tracked labels are structural, not ornamental: they legend a field group or tag the wordmark. They label the content that follows; they never introduce a heading.

## Layout

A single centered column on every screen. The app shell is max-w-5xl (1024px) with px-4 (16px) gutters, pt-6 top padding, and pb-28 (112px) so the floating bar never covers content. Screens hold a max-w-2xl (672px) column; the account screens narrow to a single max-w-sm (384px) sheet, widening to max-w-md (448px) for the sign-up form at the sm breakpoint — the only breakpoint the app uses (640px).

Sheets stack with 16px gaps and never nest framed panels. Sheet padding runs 24px (p-6) on account and form sheets, 20→28px (px-5, sm:px-7) on settings sheets; ledger rows breathe with 12px (py-3) separations and 10px in the account sheet's data list. The floating bottom bar hangs fixed at bottom-4 (16px), horizontally centered.

Touch is the base assumption: every interactive control holds a 44px floor (min-h-11), primary buttons run 48px (min-h-12), the dashboard CTA 56px (min-h-14), and the study session's reveal and grade buttons 60px.

## Elevation & Depth

Depth is conveyed by light, not shadow. Sheets sit on the ground as translucent panes — blur(30px) saturate(180%) plus the four-edge specular inset (`--glass-highlight`, white alpha strongest at the top edge) — and fields use the same recipe at blur(16px) with a 1px translucent edge. Exactly one drop shadow ships in the system: the floating bottom bar (`0 12px 32px rgba(0, 0, 0, 0.18)`), which must read as lifted over scrolling content. The segmented control's active pill adds only Tailwind's `shadow-sm`. Focus is a 2px #ef4444 outline at 2px offset; glass fields substitute a 60%-alpha red ring. Under `prefers-reduced-transparency`, every glass falls back to its solid color with blur removed.

### Shadow Vocabulary
- **Specular insets** (`--glass-highlight`: `inset 0 1.5px 1px rgba(255,255,255,0.88), inset 0 -1px 1px rgba(255,255,255,0.38), inset 1px 0 1px rgba(255,255,255,0.48), inset -1px 0 1px rgba(255,255,255,0.48)` by day; 0.28 / 0.08 / 0.15 / 0.15 by night): the standard edge treatment on every sheet, card, dock and field.
- **Float** (`0 12px 32px rgba(0, 0, 0, 0.18)`): the floating bottom bar only.
- **Seal rings** (`inset 0 0 0 3px #B3261E, inset 0 0 0 5px rgba(244, 238, 227, 0.9)`): the study seal's cream paper border.

### Named Rules
**The Light-Not-Shadow Rule.** Ordinary sheets never take a drop shadow; their depth is the specular light on the glass edges. Only the floating bottom bar is allowed one shadow.

## Shapes

The acrylic radius is 28px — the study card's radius, carried unchanged onto every sheet. Floating containers, dialogs and the dashboard CTA use 16px; fields, buttons and segments 12px; small icon buttons 8–10px; pills (the answer dock, progress rules, checkmarks) are fully round (999px). Borders are light: 1px translucent white edges on glass and 1px translucent hairlines between ledger rows — never an opaque outline. The brand mark is a red rounded square (8px on a 120-unit viewBox) with a stepped cream glyph, the same staircase read in the study ladder; the study seal is a 10px-rounded lacquer square, rotated −8°, holding one graded hanzi.

## Components

### Buttons
- **Shape:** 12px radius; min-height 44px for secondary actions, 48px for primary, full-width on account forms.
- **Primary:** seal red #B3261E, white 16px semibold text, hover #8F1E18 at 150ms, disabled at 50–60% opacity. One per surface: Entrar, Criar conta, Alterar senha, the session-complete button.
- **Study CTA:** full-width, 56px, rose control red with white text; disabled at 40% when nothing is due; active scale 0.99.
- **Glass secondary:** the glass-field material as a button (the account sheet's Alterar senha / Sair, export links).
- **Grade buttons:** flat paper tints per rating — day #f6e4e3/#982c29, #f3ebdc/#795015, #e5eddf/#3d622c, #e1ebf3/#285a84; night deep grounds with pastel text; hover deepens via color-mix 12% at 160ms.
- **Text buttons:** underlined semibold (Criar conta) or plain secondary ink ("Continuar sem conta"), 44px floor.

### Chips
- **Style:** fully rounded pills, 10px bold text on a 20%-alpha state ground — blue for Novo, red for learning, emerald for review, amber for suspended; night uses the 300-step text color.

### Sheets / Ledgers
- **Sheet:** the glass surface, 28px radius, specular insets, 24px padding; views fade in over 200ms, and ledger rows add an 8px rise staggered 30ms apart (capped at 240ms). Popovers swap to the denser `--glass-menu` glass; the bottom bar adds `sheet-float` (glass plus the one drop shadow).
- **Ledger:** rows separated by one 1px hairline between siblings, no edge rules; row hover black/[0.03] by day, white/[0.04] by night; settings and account rows read as label-left / value-right pairs.
- **Hanzi index:** the row's index column — serif, weight 500, line-height 1, colored by state (active levels red, inactive tertiary).

### Inputs / Fields
- **Style:** glass-field — translucent fill, 1px translucent edge, 12px radius, 44–48px min height, 16px text (never smaller, to hold off iOS zoom); placeholders in tertiary ink.
- **Focus:** the global keyboard ring is 2px in the focus red at 2px offset; glass fields show a 2px 60%-alpha red ring instead.
- **Affordances:** password fields carry a right-side eye toggle (44px target); selects hide the native arrow for a lucide chevron; date inputs bind `color-scheme` to the theme.

### Navigation
- **Bottom bar:** a fixed floating sheet (16px radius, glass plus the single shadow), five icon+label tabs; the active tab is a solid rose-red 44px pill with white text, inactive tabs are secondary ink with a faint hover fill; labels hide below the sm breakpoint.

### Password Checklist (signature)
- A live rule list under password fields: 12px rows, a lucide check in review green when passed, a hollow circle in secondary ink when not, topped by a 3px strength rule that fills red until the policy passes and turns emerald once it does. Its labels are the policy's own strings ("Pelo menos 8 caracteres", "Longe das senhas mais usadas", "Sem sequências como 1234 ou abcd", …), and the checklist announces progress to assistive tech.

### Study Seal (signature)
- After each graded answer a 60px lacquer seal presses onto the card's top-right corner: seal red ground, cream inset ring, one serif character for the rating (再/难/好/易), rotated −8°, on a 140ms press (scale 1.7 → 0.94 → 1). The session-complete state stamps 完 on the glass instead.

### Study Card & Dock (signature)
- The original material: the acrylic card holds hanzi, pinyin and translation with elastic type; the pill dock (999px, `--glass-pill` glass) carries the translation on the back and fades out on the front rather than unmounting, so the card never shifts.

## Do's and Don'ts

### Do:
- **Do** set every hanzi in the serif stack — card text and the numeral index column alike.
- **Do** pair every new material or ink with its night sibling and verify both themes.
- **Do** keep depth as specular light on glass; the floating bottom bar is the only drop shadow.
- **Do** reserve the seal red (#B3261E, hover #8F1E18) for one solid primary action per surface.
- **Do** keep state hues on counts, tags and state marks only.
- **Do** hold the 44px touch floor; 48px for primary actions, 56–60px for study actions.
- **Do** render counts in tabular figures, right-aligned in ledger rows.
- **Do** draw icons from lucide-react only, and honor the reduced-motion and reduced-transparency fallbacks.

### Don't:
- **Don't** use emojis anywhere; the only non-icon graphic is the brand seal.
- **Don't** put decorative icons on text-only sheets — the account sheet is labels, hairlines and values.
- **Don't** nest framed panels inside sheets; one or two sheets per screen.
- **Don't** stack explanatory copy; keep interface text terse.
- **Don't** introduce a second accent hue, or a second solid red action on one surface.
- **Don't** set hanzi in the sans stack, or use characters as texture or watermark.
- **Don't** give glass opaque fills or dark outlines; edges are translucent hairlines.
- **Don't** drive the theme from `prefers-color-scheme`; it follows the saved choice via `.night_mode`.
