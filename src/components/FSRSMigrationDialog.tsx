import React, { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { readUserBackup } from '../lib/storage';
import { COURSE } from '../lib/course';
import { useDialogFocus } from './useDialogFocus';

interface FSRSMigrationDialogProps {
  open: boolean;
  onClose: () => void;
  onMigrate: () => void;
}

export const FSRSMigrationDialog: React.FC<FSRSMigrationDialogProps> = ({
  open,
  onClose,
  onMigrate,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useDialogFocus(dialogRef, open, onClose);

  if (!open) return null;

  const downloadBackupAndMigrate = () => {
    setError(null);
    try {
      const backup = readUserBackup(window.localStorage);
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${COURSE.exportFileBase}-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onMigrate();
    } catch {
      setError('Não foi possível baixar o backup. Nada foi alterado; tente novamente.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fsrs-migration-title"
        aria-describedby="fsrs-migration-description"
        onClick={(event) => event.stopPropagation()}
        className="sheet w-full max-w-md p-6 sm:p-7 animate-in zoom-in-95 duration-200"
      >
        <h2 id="fsrs-migration-title" className="text-lg font-semibold tracking-tight">
          Atualizar a repetição espaçada
        </h2>
        <p id="fsrs-migration-description" className="pt-2 text-sm leading-relaxed ink-secondary">
          Seus pesos do FSRS-5 serão convertidos para o FSRS-6, preservando a calibração do
          histórico. A conversão não pode ser desfeita.
        </p>
        <p className="pt-2 text-sm leading-relaxed ink-secondary">
          Baixe um backup antes de continuar. Enquanto estiver no FSRS-5, o planejador por prazo
          fica desativado.
        </p>

        {error && (
          <p role="alert" className="pt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-4 text-sm font-medium ink-secondary hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={downloadBackupAndMigrate}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 cursor-pointer"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Baixar backup e atualizar
          </button>
        </div>
      </div>
    </div>
  );
};
