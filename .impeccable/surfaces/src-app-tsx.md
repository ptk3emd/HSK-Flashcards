---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/DeckDashboard.tsx","src/components/CardBrowser.tsx","src/components/StatsView.tsx"]
---

# Navigation screens (Decks, Dicionário, Estatísticas, Configurações)

Scope: the four screens behind the floating bottom bar. Visitor mode: Operate.
Audience: one student studying HSK vocabulary in short daily sessions, mostly on a phone.
Job: start today's review in one tap; then, less often, pick levels, look up a word, read progress, adjust settings.
Pinned by the user: red striped ground, frosted glass like the study card, hanzi in serif as the typographic lead, the floating bottom bar.
Removed by the user: coloured number tiles, boxes inside boxes, explanatory copy, decorative icons.

## Direction contract

THESIS: Each screen is one or two frosted sheets read as a ledger: rows indexed by hanzi numerals (一 二 三 …), numbers right-aligned in tabular figures, hairline rules between rows. Refuses the dashboard default of tinted metric tiles and nested panels.

OWN-WORLD: The study card's glass (translucent surface, 30px blur at 180% saturation, specular inset edges) on the red striped ground; Noto Serif SC for hanzi and the index column; system sans for labels; one red for the primary action; state colours only on counts (new blue, learning red, review green).

STORY: The student opens the app, sees how many cards are due and taps Estudar. Below, the levels list shows which are on and how far each has come; a tap toggles a level. The other screens read in the same rows.

FIRST VIEWPORT: Decks: one sheet with the day's count (large serif numeral), the split by state in one line, and a full-width Estudar button; under it the level ledger, one row per HSK level with its hanzi numeral, on/off state, due or word count and a hairline progress rule.

FORM: Hanzi ledger, third of the three dealt structures (index 5 of 7); seed key f839fd20.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
