import React, { useState } from 'react';
import { getSupabase, SyncStatus } from '../lib/sync';
import { countryName } from '../data/countries';
import { UserProfile } from '../types/card';

interface AccountSettingsProps {
  email: string | null;
  status: SyncStatus;
  profile: UserProfile | null;
  /** Shows the sign-in screen again (for a student who skipped it) */
  onSignIn: () => void;
  /** Opens the dedicated change-password screen */
  onChangePassword: () => void;
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  idle: 'Aguardando',
  syncing: 'Sincronizando...',
  synced: 'Sincronizado',
  offline: 'Sem conexão, sincroniza ao voltar',
  error: 'Falha ao sincronizar, tenta de novo na próxima mudança',
};

function formatBirthDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The account sheet in Settings: who is signed in, the profile, and the account actions. */
export const AccountSettings: React.FC<AccountSettingsProps> = ({
  email,
  status,
  profile,
  onSignIn,
  onChangePassword,
}) => {
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
      <div className="min-w-0 space-y-1">
        <h2 id="settings-account" className="text-base font-semibold">
          Conta
        </h2>
        {email ? (
          <>
            <p className="text-sm ink-secondary truncate">{email}</p>
            <p role="status" className="text-xs ink-tertiary">
              {STATUS_TEXT[status]}
            </p>
          </>
        ) : (
          <p className="text-sm ink-secondary">Entre para salvar o progresso na nuvem.</p>
        )}
      </div>

      {email && profile && (
        <dl className="ledger mt-3 border-t border-[var(--separator)]">
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-sm ink-secondary">Nome</dt>
            <dd className="text-sm font-medium text-right min-w-0 truncate">{profile.name}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-sm ink-secondary">País</dt>
            <dd className="text-sm font-medium text-right">{countryName(profile.country)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-sm ink-secondary">Nascimento</dt>
            <dd className="text-sm font-medium text-right">{formatBirthDate(profile.birthDate)}</dd>
          </div>
        </dl>
      )}

      {email ? (
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <button
            type="button"
            onClick={onChangePassword}
            className="min-h-11 px-4 rounded-xl glass-field text-sm font-semibold cursor-pointer"
          >
            Alterar senha
          </button>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="min-h-11 px-4 rounded-xl glass-field text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            Sair
          </button>
          <p className="w-full pt-1 text-xs ink-tertiary">Ao sair, os dados continuam neste aparelho.</p>
        </div>
      ) : (
        <div className="pt-4">
          <button
            type="button"
            onClick={onSignIn}
            className="min-h-11 px-4 rounded-xl bg-[#B3261E] hover:bg-[#8F1E18] text-white text-sm font-semibold cursor-pointer"
          >
            Entrar
          </button>
        </div>
      )}
    </section>
  );
};
