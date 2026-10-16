import React, { useState } from 'react';
import { getSupabase, SyncStatus } from '../lib/sync';

interface AccountSettingsProps {
  email: string | null;
  status: SyncStatus;
  /** Shows the sign-in screen again (for a student who skipped it) */
  onSignIn: () => void;
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  idle: 'Aguardando',
  syncing: 'Sincronizando...',
  synced: 'Sincronizado',
  offline: 'Sem conexão, sincroniza ao voltar',
  error: 'Falha ao sincronizar, tenta de novo na próxima mudança',
};

/** The account row in Settings: who is signed in, the sync state, and sign out. */
export const AccountSettings: React.FC<AccountSettingsProps> = ({ email, status, onSignIn }) => {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sheet px-5 sm:px-7 py-4" aria-labelledby="settings-account">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 id="settings-account" className="text-base font-semibold">Conta</h2>
          {email ? (
            <>
              <p className="text-sm ink-secondary truncate">{email}</p>
              <p role="status" className="text-xs ink-tertiary">{STATUS_TEXT[status]}</p>
            </>
          ) : (
            <p className="text-sm ink-secondary">Entre para salvar o progresso na nuvem.</p>
          )}
        </div>
        {email ? (
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="min-h-11 px-4 rounded-xl glass-field text-sm font-semibold cursor-pointer shrink-0 disabled:opacity-60"
          >
            Sair
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="min-h-11 px-4 rounded-xl bg-[#B3261E] hover:bg-[#8F1E18] text-white text-sm font-semibold cursor-pointer shrink-0"
          >
            Entrar
          </button>
        )}
      </div>
      {email && <p className="pt-2 text-xs ink-tertiary">Ao sair, os dados continuam neste aparelho.</p>}
    </section>
  );
};
