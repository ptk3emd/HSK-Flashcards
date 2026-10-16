import React, { useState } from 'react';
import { getSupabase } from '../lib/sync';
import { authMessage } from '../lib/authMessages';
import { BrandHeader } from './BrandHeader';
import { PasswordField } from './PasswordField';
import { SignUpScreen } from './SignUpScreen';

interface AuthScreenProps {
  theme: 'dark' | 'light';
  /** Study without an account on this device */
  onSkip: () => void;
}

/** First screen when cloud sync is available: sign in, open the sign-up screen, or keep studying offline. */
export const AuthScreen: React.FC<AuthScreenProps> = ({ theme, onSkip }) => {
  const [view, setView] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isLight = theme === 'light';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) setError(authMessage(err.message));
    } catch (err) {
      setError(authMessage(err instanceof Error ? err.message : ''));
    } finally {
      setBusy(false);
    }
  };

  if (view === 'signUp') {
    return <SignUpScreen theme={theme} onBack={() => setView('signIn')} />;
  }

  return (
    <div
      className={`app-ground min-h-screen w-full flex items-center justify-center px-4 py-10 font-sans ${
        isLight ? 'card-theme-light text-ink' : 'night_mode card-theme-dark bg-night text-white'
      }`}
    >
      <main className="w-full max-w-sm space-y-4">
        <BrandHeader />

        <section className="sheet p-6 space-y-5" aria-labelledby="auth-title">
          <div className="space-y-1">
            <h1 id="auth-title" className="text-2xl font-semibold tracking-tight">
              Entrar
            </h1>
            <p className="text-sm ink-secondary">Seu progresso fica salvo na conta e segue você em outros aparelhos.</p>
          </div>

          <form onSubmit={submit} className="space-y-3" noValidate={false}>
            <label className="block space-y-1.5" htmlFor="auth-email">
              <span className="text-sm font-medium">E-mail</span>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-12 px-4 rounded-xl glass-field text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
              />
            </label>

            <PasswordField
              id="auth-password"
              label="Senha"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />

            {error && (
              <p role="alert" className="text-sm text-red-800 dark:text-red-300">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-12 rounded-xl bg-[#B3261E] hover:bg-[#8F1E18] text-white text-base font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-wait transition-colors"
            >
              {busy ? 'Aguarde...' : 'Entrar'}
            </button>
          </form>

          <p className="text-sm ink-secondary">
            Ainda não tem conta?{' '}
            <button
              type="button"
              onClick={() => {
                setView('signUp');
                setError(null);
                setNotice(null);
              }}
              className="min-h-11 font-semibold text-[var(--text-fg)] underline underline-offset-4 cursor-pointer"
            >
              Criar conta
            </button>
          </p>
        </section>

        <button
          type="button"
          onClick={onSkip}
          className="w-full min-h-11 rounded-xl text-sm font-medium ink-secondary hover:text-[var(--text-fg)] cursor-pointer"
        >
          Continuar sem conta
        </button>
      </main>
    </div>
  );
};
