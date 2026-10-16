import React, { useState } from 'react';
import { getSupabase } from '../lib/sync';

interface AuthScreenProps {
  theme: 'dark' | 'light';
  /** Study without an account on this device */
  onSkip: () => void;
}

type Mode = 'signIn' | 'signUp';

/** Supabase Auth messages in the app's language; anything unknown falls back to a generic line. */
function authMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme o seu e-mail antes de entrar. O link está na sua caixa de entrada.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Este e-mail já tem conta. Entre com a sua senha.';
  if (m.includes('password') && (m.includes('at least') || m.includes('short'))) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Espere um minuto e tente de novo.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão. Verifique a internet e tente de novo.';
  return 'Não foi possível entrar agora. Tente de novo.';
}

/** First screen when cloud sync is available: sign in, create an account, or keep studying offline. */
export const AuthScreen: React.FC<AuthScreenProps> = ({ theme, onSkip }) => {
  const [mode, setMode] = useState<Mode>('signIn');
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
      if (mode === 'signIn') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError(authMessage(err.message));
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin + window.location.pathname },
        });
        if (err) setError(authMessage(err.message));
        // With email confirmation on, sign-up returns no session until the link is opened
        else if (!data.session) setNotice('Enviamos um link de confirmação para o seu e-mail. Abra-o e depois entre.');
      }
    } catch (err) {
      setError(authMessage(err instanceof Error ? err.message : ''));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
    setError(null);
    setNotice(null);
  };

  return (
    <div
      className={`app-ground min-h-screen w-full flex items-center justify-center px-4 py-10 font-sans ${
        isLight ? 'card-theme-light text-ink' : 'night_mode card-theme-dark bg-night text-white'
      }`}
    >
      <main className="w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2.5 px-1">
          <svg aria-hidden="true" viewBox="0 0 120 120" className="size-7 shrink-0">
            <rect width="120" height="120" rx="8" fill="#B3261E" />
            <path d="M22 98 V80 H42 V62 H62 V44 H98 V98 Z" fill="#F4EEE3" />
          </svg>
          <span className="hanzi-index text-xl font-semibold">Lóutī</span>
          <span className="text-[11px] uppercase tracking-[0.2em] ink-tertiary">Mandarim</span>
        </div>

        <section className="sheet p-6 space-y-5" aria-labelledby="auth-title">
          <div className="space-y-1">
            <h1 id="auth-title" className="text-2xl font-semibold tracking-tight">
              {mode === 'signIn' ? 'Entrar' : 'Criar conta'}
            </h1>
            <p className="text-sm ink-secondary">Seu progresso fica salvo na conta e segue você em outros aparelhos.</p>
          </div>

          <form onSubmit={submit} className="space-y-3" noValidate={false}>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">E-mail</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-12 px-4 rounded-xl glass-field text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Senha</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-12 px-4 rounded-xl glass-field text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
              />
            </label>

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
              {busy ? 'Aguarde...' : mode === 'signIn' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <p className="text-sm ink-secondary">
            {mode === 'signIn' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
            <button
              type="button"
              onClick={switchMode}
              className="min-h-11 font-semibold text-[var(--text-fg)] underline underline-offset-4 cursor-pointer"
            >
              {mode === 'signIn' ? 'Criar conta' : 'Entrar'}
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
