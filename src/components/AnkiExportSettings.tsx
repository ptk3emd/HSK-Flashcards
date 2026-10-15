import React, { useEffect, useRef, useState } from 'react';
import { InlineLoadingSkeleton } from './ViewLoading';
import { Download } from 'lucide-react';
import type { Card, DeckConfig, FSRSOptions, ReviewLog } from '../types/card';

interface Props { cards: Card[]; deckConfig: DeckConfig; fsrsOptions: FSRSOptions; }
interface Files { csv: string; backup: string; count: number; date: string; }

export function AnkiExportSettings({ cards, deckConfig, fsrsOptions }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<Files | null>(null);
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const urlsRef = useRef<string[]>([]);
  useEffect(() => () => {
    requestRef.current++;
    urlsRef.current.forEach(URL.revokeObjectURL);
  }, []);

  const prepare = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const request = ++requestRef.current;
    setBusy(true);
    setError('');
    setFiles(null);
    urlsRef.current.forEach(URL.revokeObjectURL);
    urlsRef.current = [];
    try {
      const { loadExportCards, buildAnkiCsv, readUserBackup } = await import('../lib/ankiExport');
      const storage = readUserBackup(localStorage);
      const logs = JSON.parse((storage.hanzi_anki_review_logs_v2 as string) ?? '[]') as ReviewLog[];
      if (!Array.isArray(logs)) throw new Error('Invalid review history');
      const allCards = await loadExportCards(cards);
      if (request !== requestRef.current) return;
      const exportedAt = new Date().toISOString();
      const csv = URL.createObjectURL(new Blob([buildAnkiCsv(allCards, logs)], { type: 'text/csv;charset=utf-8' }));
      urlsRef.current.push(csv);
      const backup = URL.createObjectURL(new Blob([JSON.stringify({ format: 'hsk-flashcards-backup', version: 1,
        exportedAt, cards: allCards, deckConfig, fsrsOptions, reviewLogs: logs, storage }, null, 2)], { type: 'application/json' }));
      urlsRef.current.push(backup);
      setFiles({ csv, backup, count: allCards.length, date: exportedAt.slice(0, 10) });
    } catch {
      if (request === requestRef.current) {
        urlsRef.current.forEach(URL.revokeObjectURL);
        urlsRef.current = [];
        setError('Não foi possível preparar os arquivos. Verifique a conexão para carregar os níveis HSK e tente novamente. Seus dados não foram alterados.');
      }
    } finally {
      if (request === requestRef.current) { busyRef.current = false; setBusy(false); }
    }
  };

  return <section className="sheet px-5 sm:px-7 py-5 space-y-4" aria-labelledby="settings-export">
    <h2 id="settings-export" className="text-base font-semibold">Exportar para o Anki</h2>
    <p className="text-sm leading-relaxed">Todos os níveis HSK 1–9, incluindo o bloco conjunto HSK 7–9, mais seus cartões e mnemônicos. Os arquivos são preparados neste dispositivo.</p>
    <button type="button" onClick={prepare} disabled={busy} className="min-h-11 px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white font-semibold inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait">
      <Download size={18} aria-hidden="true" />{busy ? 'Preparando exportação…' : 'Preparar CSV e backup'}
    </button>
    {busy && <InlineLoadingSkeleton label="Carregando todos os níveis e reunindo seus dados…" />}
    {error && <p role="alert" className="text-sm leading-relaxed">{error}</p>}
    {files && <div className="space-y-3">
      <p role="status" className="text-sm">{files.count.toLocaleString('pt-BR')} cartões prontos. Baixe os dois arquivos para guardar uma cópia completa.</p>
      <div className="flex flex-wrap gap-3">
        <a className="glass-field min-h-11 px-4 py-3 rounded-xl text-sm font-semibold" href={files.csv} download={`HSK-1-9-Anki-${files.date}.csv`}>Baixar CSV para Anki</a>
        <a className="glass-field min-h-11 px-4 py-3 rounded-xl text-sm font-semibold" href={files.backup} download={`HSK-backup-${files.date}.json`}>Baixar backup completo</a>
      </div>
    </div>}
    <details className="text-sm leading-relaxed">
      <summary className="cursor-pointer min-h-11 flex items-center font-semibold">Como importar e o que é preservado</summary>
      <p className="mt-2">No Anki para computador, escolha Arquivo → Importar e selecione o CSV. Use um tipo de nota com frente e verso (como Básico): associe Frente à frente e Verso ao verso. Mantenha HTML ativado; Tags e Baralho são indicados no arquivo. ID e DadosUsuario podem ser ignorados ou associados a campos extras.</p>
      <p className="mt-2">O CSV leva os intervalos, o estado FSRS, a suspensão e o histórico em DadosUsuario, mas o Anki importa cartões novos: esses dados não recriam o agendamento nem suspendem cartões automaticamente. O backup JSON guarda também preferências, provas e leituras; ele é um arquivo pessoal, não um pacote importável pelo Anki. Áudio sintetizado pelo navegador não é incluído.</p>
      <a className="underline inline-block mt-2" href="https://docs.ankiweb.net/importing/text-files.html" target="_blank" rel="noreferrer">Manual de importação do Anki</a>
    </details>
  </section>;
}
