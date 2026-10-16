import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { getSupabase } from '../lib/sync';
import { authMessage } from '../lib/authMessages';
import { evaluatePassword, PASSWORD_MIN_LENGTH } from '../lib/passwordPolicy';
import { BrandHeader } from './BrandHeader';
import { PasswordChecklist, PasswordField } from './PasswordField';

interface ChangePasswordScreenProps {
  theme: 'dark' | 'light';
  email: string;
  /** Back to the app */
  onBack: () => void;
}

/**
 * Dedicated change-password screen: confirms the current password, then replaces it.
 * The student stays signed in; the new password applies from the next sign-in.
 */
export const ChangePasswordScreen: React.FC<ChangePasswordScreenProps> = ({ theme, email, onBack }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const isLight = theme === 'light';

  const verdict = evaluatePassword(next, { email });
  const differs = next.length > 0 && next !== current;
  const matchOk = confirm.length > 0 && confirm === next;
  const canSubmit = current.length > 0 && verdict.ok && differs && matchOk && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !canSubmit) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verifyError) {
        const message = verifyError.message.toLowerCase();
        setError(message.includes('invalid') ? 'Senha atual incorreta.' : authMessage(verifyError.message));
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        setError(authMessage(updateError.message));
        return;
      }
      setDone('Senha alterada. Use a nova senha no próximo acesso.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(authMessage(err instanceof Error ? err.message : ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`app-ground min-h-screen w-full flex items-center justify-center px-4 py-10 font-sans ${
        isLight ? 'card-theme-light text-ink' : 'night_mode card-theme-dark bg-night text-white'
      }`}
    >
      <main className="w-full max-w-sm space-y-4 animate-in fade-in duration-200">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 min-h-11 -ml-2 px-2 rounded-lg text-sm font-medium ink-secondary hover:text-[var(--text-fg)] cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Voltar
        </button>

        <BrandHeader />

        <section className="sheet p-6 space-y-5" aria-labelledby="change-password-title">
          <div className="space-y-1">
            <h1 id="change-password-title" className="text-2xl font-semibold tracking-tight">
              Alterar senha
            </h1>
            <p className="text-sm ink-secondary truncate">{email}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <PasswordField
              id="password-current"
              label="Senha atual"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />

            <PasswordField
              id="password-next"
              label="Nova senha"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              describedBy={next.length > 0 ? 'change-password-rules' : undefined}
            />
            {next.length > 0 && <PasswordChecklist id="change-password-rules" verdict={verdict} />}
            {next.length > 0 && current.length > 0 && !differs && (
              <p className="text-xs text-red-800 dark:text-red-300">A nova senha precisa ser diferente da atual.</p>
            )}

            <PasswordField
              id="password-confirm"
              label="Confirmar nova senha"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              describedBy={confirm.length > 0 && !matchOk ? 'change-password-mismatch' : undefined}
            />
            {confirm.length > 0 && !matchOk && (
              <p id="change-password-mismatch" className="text-xs text-red-800 dark:text-red-300">
                As senhas não coincidem.
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm text-red-800 dark:text-red-300">
                {error}
              </p>
            )}
            {done && (
              <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
                {done}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full min-h-12 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white text-base font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? 'Aguarde...' : 'Alterar senha'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
};
