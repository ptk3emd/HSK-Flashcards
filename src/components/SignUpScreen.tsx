import React, { useState } from 'react';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { getSupabase } from '../lib/sync';
import { authMessage } from '../lib/authMessages';
import { evaluatePassword, PASSWORD_MIN_LENGTH } from '../lib/passwordPolicy';
import { COUNTRIES } from '../data/countries';
import { BrandHeader } from './BrandHeader';
import { PasswordChecklist, PasswordField } from './PasswordField';

interface SignUpScreenProps {
  theme: 'dark' | 'light';
  /** Back to the sign-in screen */
  onBack: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fieldClass =
  'w-full min-h-12 px-4 rounded-xl glass-field text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60';
const topicClass = 'space-y-3 border-t border-[var(--separator)] pt-5';
const legendClass = 'p-0 text-xs font-semibold uppercase tracking-[0.18em] ink-tertiary';

/** Dedicated sign-up screen: the profile in topics plus a password the policy accepts. */
export const SignUpScreen: React.FC<SignUpScreenProps> = ({ theme, onBack }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const isLight = theme === 'light';

  const today = new Date().toISOString().slice(0, 10);
  const verdict = evaluatePassword(password, { email: email.trim(), name: name.trim() });
  const nameOk = name.trim().length >= 2;
  const emailOk = EMAIL_PATTERN.test(email.trim());
  const countryOk = COUNTRIES.some((option) => option.code === country);
  const birthOk = birthDate >= '1900-01-01' && birthDate <= today;
  const matchOk = confirm.length > 0 && confirm === password;
  const canSubmit = nameOk && emailOk && countryOk && birthOk && verdict.ok && matchOk && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim(), country, birth_date: birthDate },
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (err) setError(authMessage(err.message));
      // With email confirmation on, sign-up returns no session until the link is opened
      else if (!data.session) setSent(true);
    } catch (err) {
      setError(authMessage(err instanceof Error ? err.message : ''));
    } finally {
      setBusy(false);
    }
  };

  const rootClass = `app-ground min-h-screen w-full flex items-center justify-center px-4 py-10 font-sans ${
    isLight ? 'card-theme-light text-ink' : 'night_mode card-theme-dark bg-night text-white'
  }`;

  if (sent) {
    return (
      <div className={rootClass}>
        <main className="w-full max-w-sm space-y-4 animate-in fade-in duration-200">
          <BrandHeader />
          <section className="sheet p-6 space-y-5" aria-labelledby="signup-sent-title">
            <div className="space-y-1">
              <h1 id="signup-sent-title" className="text-2xl font-semibold tracking-tight">
                Confira seu e-mail
              </h1>
              <p role="status" className="text-sm ink-secondary">
                Enviamos um link de confirmação para{' '}
                <span className="font-semibold text-[var(--text-fg)]">{email.trim()}</span>. Abra o
                link para ativar a conta e entrar.
              </p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="w-full min-h-12 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white text-base font-semibold cursor-pointer transition-colors"
            >
              Voltar para entrar
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <main className="w-full max-w-sm sm:max-w-md space-y-4 animate-in fade-in duration-200">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 min-h-11 -ml-2 px-2 rounded-lg text-sm font-medium ink-secondary hover:text-[var(--text-fg)] cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Voltar
        </button>

        <BrandHeader />

        <section className="sheet p-6 space-y-5" aria-labelledby="signup-title">
          <div className="space-y-1">
            <h1 id="signup-title" className="text-2xl font-semibold tracking-tight">
              Criar conta
            </h1>
            <p className="text-sm ink-secondary">
              Seu progresso fica salvo na conta e segue você em outros aparelhos.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <fieldset className="space-y-3">
              <legend className={legendClass}>Identidade</legend>
              <label className="block space-y-1.5" htmlFor="signup-name">
                <span className="text-sm font-medium">Nome</span>
                <input
                  id="signup-name"
                  type="text"
                  required
                  autoComplete="name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
                />
              </label>
            </fieldset>

            <fieldset className={topicClass}>
              <legend className={legendClass}>Contato</legend>
              <label className="block space-y-1.5" htmlFor="signup-email">
                <span className="text-sm font-medium">E-mail</span>
                <input
                  id="signup-email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                />
              </label>
            </fieldset>

            <fieldset className={topicClass}>
              <legend className={legendClass}>Origem</legend>
              <label className="block space-y-1.5" htmlFor="signup-country">
                <span className="text-sm font-medium">País</span>
                <span className="relative block">
                  <select
                    id="signup-country"
                    required
                    autoComplete="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className={`${fieldClass} appearance-none pr-10 cursor-pointer`}
                  >
                    <option value="" disabled>
                      Selecione o país
                    </option>
                    {COUNTRIES.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 ink-tertiary"
                    aria-hidden="true"
                  />
                </span>
              </label>
              <label className="block space-y-1.5" htmlFor="signup-birth">
                <span className="text-sm font-medium">Data de nascimento</span>
                <input
                  id="signup-birth"
                  type="date"
                  required
                  autoComplete="bday"
                  min="1900-01-01"
                  max={today}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className={`${fieldClass} [color-scheme:light] dark:[color-scheme:dark]`}
                />
              </label>
            </fieldset>

            <fieldset className={topicClass}>
              <legend className={legendClass}>Segurança</legend>
              <PasswordField
                id="signup-password"
                label="Senha"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                describedBy={password.length > 0 ? 'signup-rules' : undefined}
              />
              {password.length > 0 && <PasswordChecklist id="signup-rules" verdict={verdict} />}
              <PasswordField
                id="signup-confirm"
                label="Confirmar senha"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                describedBy={confirm.length > 0 && !matchOk ? 'signup-mismatch' : undefined}
              />
              {confirm.length > 0 && !matchOk && (
                <p id="signup-mismatch" className="text-xs text-red-800 dark:text-red-300">
                  As senhas não coincidem.
                </p>
              )}
            </fieldset>

            {error && (
              <p role="alert" className="text-sm text-red-800 dark:text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full min-h-12 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white text-base font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? 'Aguarde...' : 'Criar conta'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
};
