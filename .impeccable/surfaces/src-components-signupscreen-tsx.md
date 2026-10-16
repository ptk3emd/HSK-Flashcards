---
version: 1
slug: "src-components-signupscreen-tsx"
primary_target: "src/components/SignUpScreen.tsx"
related_targets: ["src/components/AuthScreen.tsx","src/components/ChangePasswordScreen.tsx","src/components/AccountSettings.tsx"]
---

# Account flow (entrar, criar conta, alterar senha)

Scope: the sign-in entry, the dedicated sign-up screen, the dedicated change-password screen, and the Conta sheet inside Settings. Visitor mode: Operate.

Audience: one student, often on a phone, creating an account to carry progress across devices or returning to sign in.

Job: get into the study app with minimal friction; the rare account tasks (sign-up, password change) must feel as deliberate as the study card itself.

Pinned by the user: sign-up as topics on a single screen (Identidade, Contato, Origem, Segurança); password minimum 8 with easy passwords blocked (common list, sequences, repetitions, personal data) and no forced symbols; password change verifies the current password first; profile (name, country, birth date) lives in Supabase user_metadata, display-only.

Removed by the user: tinted-circle icon badges and decorative glyphs on the account sheets (finish review, 2026-10); keep headers text-only.

## Direction contract

THESIS: The account flow is the study card's glass world in its most austere form: one sheet, typed rows of labels and fields, hairline topic rules, one red action. Refuses the badge-and-icon ornament that account screens usually wear.

OWN-WORLD: The app's glass sheet and glass fields, hairline separators, uppercase tracked topic legends (the wordmark's Mandarim badge device), Noto Serif SC wordmark, system sans labels, one red #B3261E for the primary action, emerald/green reserved for passing validation, dark and light from the app theme.

STORY: The student signs in or creates an account in one screen of grouped fields; a weak password is named rule by rule before it is accepted; a confirmation panel replaces the form when the e-mail link is sent; a signed-in student changes the password by first proving the current one.

FIRST VIEWPORT: Centered sheet on the striped ground under the wordmark row: heading, one-line purpose, then topic groups separated by hairline rules; the red action at the end of the form, disabled until every rule passes.

FORM: Extension of the incumbent hanzi-ledger world (no seed; code-led extension of the established surface).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
