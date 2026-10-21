/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Card, DeckConfig, FSRSOptions } from './types/card';
import {
  loadCards,
  saveCards,
  loadDeckConfig,
  saveDeckConfig,
  loadFSRSOptions,
  saveFSRSOptions,
  getStoredTheme,
  saveStoredTheme,
  loadAuthSkipped,
  saveAuthSkipped,
} from './lib/storage';
import { CloudSync, Session, SyncStatus, getSupabase, isCloudEnabled } from './lib/sync';
import { migrateToFSRS6 } from './lib/fsrs';
import { parseUserProfile } from './lib/profile';
import { AuthScreen } from './components/AuthScreen';
import { CourseSwitch } from './components/CourseSwitch';
import { COURSE } from './lib/course';
import { ChangePasswordScreen } from './components/ChangePasswordScreen';
import { AccountSettings } from './components/AccountSettings';
import { StudySession } from './components/StudySession';
import { DeckDashboard } from './components/DeckDashboard';
import { ViewLoading, DecksSkeleton } from './components/ViewLoading';
import { AudioVoiceSettings } from './components/AudioVoiceSettings';
import { AnkiExportSettings } from './components/AnkiExportSettings';
import { FSRSSettings } from './components/FSRSSettings';
import { FSRSMigrationDialog } from './components/FSRSMigrationDialog';
import { StudyOptionsSettings } from './components/StudyOptionsSettings';
import { useSystemBarHidden } from './components/useSystemBarHidden';
import { usePrefetched } from './components/usePrefetched';
import {
  Layers,
  Search,
  BarChart3,
  GraduationCap,
  Settings2,
} from 'lucide-react';

// Views opened from the bottom bar are split out, keeping the first screen light. They are
// fetched when the browser is idle; lazy() only covers a tap that comes before that.
const loadCardBrowser = () => import('./components/CardBrowser').then((m) => m.CardBrowser);
const loadStatsView = () => import('./components/StatsView').then((m) => m.StatsView);
const CardBrowserLazy = lazy(() => loadCardBrowser().then((c) => ({ default: c })));
const StatsViewLazy = lazy(() => loadStatsView().then((c) => ({ default: c })));
const loadLearnView = () => import('./components/LearnView').then((m) => m.LearnView);
const LearnViewLazy = lazy(() => loadLearnView().then((c) => ({ default: c })));

const NAV_ITEMS = [
  { tab: 'decks', label: 'Decks', Icon: Layers },
  { tab: 'browser', label: 'Dicionário', Icon: Search },
  { tab: 'learn', label: 'Aprender', Icon: GraduationCap },
  { tab: 'stats', label: 'Estatísticas', Icon: BarChart3 },
  { tab: 'settings', label: 'Configurações', Icon: Settings2 },
] as const;

// The Learn tab (HSK grammar lessons and practice) exists only in the Mandarin course
const COURSE_NAV = NAV_ITEMS.filter((item) => item.tab !== 'learn' || COURSE.hasLearn);

export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [deckConfig, setDeckConfig] = useState<DeckConfig>(loadDeckConfig());
  const [fsrsOptions, setFSRSOptions] = useState<FSRSOptions>(loadFSRSOptions());
  const [fsrsMigrationOpen, setFSRSMigrationOpen] = useState(false);
  const migrationPrompted = useRef(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(getStoredTheme());
  const [activeTab, setActiveTab] = useState<'study' | 'decks' | 'browser' | 'learn' | 'stats' | 'settings'>('decks');
  const [isolatedStudyLevel, setIsolatedStudyLevel] = useState<string | null>(null);
  const [studyStartsFree, setStudyStartsFree] = useState(false);
  const [studyStartsAhead, setStudyStartsAhead] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Cloud account: off entirely when the build has no Supabase key
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isCloudEnabled);
  const [authSkipped, setAuthSkipped] = useState(loadAuthSkipped);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const userId = session?.user.id ?? null;
  const profile = session ? parseUserProfile(session.user.user_metadata) : null;

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => active && setSession(data.session))
      .catch((e) => console.error('Failed to restore the session', e))
      .finally(() => active && setAuthReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // The latest study state, read once when a sync session starts
  const latestRef = useRef({ cards, deckConfig, fsrsOptions });
  latestRef.current = { cards, deckConfig, fsrsOptions };

  // One sync session per signed-in user: merge the cloud copy in, then mirror local saves
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId || !isLoaded) return;
    const sync = new CloudSync(supabase, userId, setSyncStatus);
    sync
      .start(latestRef.current)
      .then((merged) => {
        setCards(merged.cards);
        setDeckConfig(merged.deckConfig);
        setFSRSOptions(merged.fsrsOptions);
      })
      .catch((e) => {
        console.error('Cloud sync could not start', e);
        setSyncStatus(navigator.onLine ? 'error' : 'offline');
      });
    return () => {
      sync.stop();
      setSyncStatus('idle');
    };
  }, [userId, isLoaded]);

  useSystemBarHidden(deckConfig.hideSystemBar);

  const CardBrowser = usePrefetched(loadCardBrowser, 'idle') ?? CardBrowserLazy;
  const StatsView = usePrefetched(loadStatsView, 'idle') ?? StatsViewLazy;
  const LearnView = usePrefetched(loadLearnView, 'idle') ?? LearnViewLazy;

  // Load cards on initial mount
  useEffect(() => {
    let cancelled = false;
    loadCards().then((initialCards) => {
      if (cancelled) return;
      setCards(initialCards);
      // A vocabulary migration can activate the levels its studied words moved to
      setDeckConfig(loadDeckConfig());
      setIsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdateCards = (updatedCards: Card[]) => {
    setCards(updatedCards);
    saveCards(updatedCards);
  };

  const handleAddCards = (newCards: Card[]) => {
    const existingIds = new Set(cards.map(c => c.id));
    const toAdd = newCards.filter(c => !existingIds.has(c.id));
    const merged = [...cards, ...toAdd];
    handleUpdateCards(merged);
  };

  const handleUpdateDeckConfig = (config: DeckConfig) => {
    setDeckConfig(config);
    saveDeckConfig(config);
  };

  const handleUpdateFSRSOptions = (options: FSRSOptions) => {
    setFSRSOptions(options);
    saveFSRSOptions(options);
  };

  useEffect(() => {
    if (!isLoaded || fsrsOptions.fsrsVersion !== 5 || migrationPrompted.current) return;
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem('fsrs6-migration-dismissed') === '1';
    } catch {
      // Storage can be unavailable; showing the prompt is still safe.
    }
    if (dismissed) return;
    migrationPrompted.current = true;
    setFSRSMigrationOpen(true);
  }, [isLoaded, fsrsOptions.fsrsVersion]);

  useEffect(() => {
    if (fsrsOptions.fsrsVersion !== 5) setFSRSMigrationOpen(false);
  }, [fsrsOptions.fsrsVersion]);

  const handleCloseFSRSMigration = () => {
    try {
      window.sessionStorage.setItem('fsrs6-migration-dismissed', '1');
    } catch {
      // Ignore storage failures.
    }
    setFSRSMigrationOpen(false);
  };

  const handleMigrateFSRS = () => {
    handleUpdateFSRSOptions(migrateToFSRS6(fsrsOptions));
    setFSRSMigrationOpen(false);
  };

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    saveStoredTheme(nextTheme);
  };

  const handleStartStudy = (
    isolatedLevel?: string | null,
    freePractice = false,
    ahead = false
  ) => {
    setIsolatedStudyLevel(isolatedLevel || null);
    setStudyStartsFree(freePractice);
    setStudyStartsAhead(ahead && !freePractice);
    setActiveTab('study');
  };

  const handleUpdateSingleCard = (updated: Card) => {
    const nextCards = cards.map(c => (c.id === updated.id ? updated : c));
    handleUpdateCards(nextCards);
  };

  const isLight = theme === 'light';

  // Sign-in comes first when the cloud is available, unless the student chose to stay offline
  if (isCloudEnabled && authReady && !session && !authSkipped) {
    return (
      <AuthScreen
        theme={theme}
        onSkip={() => {
          saveAuthSkipped(true);
          setAuthSkipped(true);
        }}
      />
    );
  }

  // First paint while the deck loads: the dashboard's shape in the saved theme
  if (!isLoaded || !authReady) {
    return (
      <div className={`min-h-screen w-full font-sans ${isLight ? 'card-theme-light text-ink' : 'night_mode card-theme-dark bg-night text-white'}`}>
        <main className="max-w-5xl mx-auto px-4 pt-6 pb-28">
          <DecksSkeleton />
        </main>
      </div>
    );
  }

  // Dedicated change-password screen, reached from Settings > Conta
  if (passwordOpen && session) {
    return (
      <ChangePasswordScreen
        theme={theme}
        email={session.user.email ?? ''}
        onBack={() => setPasswordOpen(false)}
      />
    );
  }

  // Full-screen focused study mode
  if (activeTab === 'study') {
    return (
      <StudySession
        cards={cards}
        deckConfig={deckConfig}
        fsrsOptions={fsrsOptions}
        theme={theme}
        isolatedLevel={isolatedStudyLevel}
        onSelectIsolatedLevel={setIsolatedStudyLevel}
        onAddCards={handleAddCards}
        onToggleTheme={handleToggleTheme}
        onUpdateCards={handleUpdateCards}
        onUpdateDeckConfig={handleUpdateDeckConfig}
        startFreePractice={studyStartsFree}
        startAhead={studyStartsAhead}
        onExit={() => {
          setStudyStartsFree(false);
          setStudyStartsAhead(false);
          setActiveTab('decks');
        }}
      />
    );
  }

  return (
    <div
      className={`app-ground min-h-screen w-full transition-colors duration-300 font-sans ${
        isLight
          ? 'card-theme-light text-ink'
          : 'night_mode card-theme-dark bg-night text-white'
      }`}
    >
      {/* Main Content Area without Topbar */}
      <main className="max-w-5xl mx-auto px-4 pt-6 pb-28 sm:pb-28">
        {activeTab === 'decks' && (
          <DeckDashboard
            cards={cards}
            deckConfig={deckConfig}
            fsrsOptions={fsrsOptions}
            onUpdateDeckConfig={handleUpdateDeckConfig}
            onStartStudy={handleStartStudy}
            onAddCards={handleAddCards}
            onRequestMigration={() => setFSRSMigrationOpen(true)}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'browser' && (
          <Suspense fallback={<ViewLoading variant="browser" />}>
            <CardBrowser
              cards={cards}
              theme={theme}
              deckConfig={deckConfig}
              speechSpeed={deckConfig.speechSpeed}
              onUpdateCard={handleUpdateSingleCard}
              onAddCards={handleAddCards}
            />
          </Suspense>
        )}

        {activeTab === 'learn' && COURSE.hasLearn && (
          <Suspense fallback={<ViewLoading variant="learn" />}>
            <LearnView />
          </Suspense>
        )}

        {activeTab === 'stats' && (
          <Suspense fallback={<ViewLoading variant="stats" />}>
            <StatsView
              cards={cards}
              fsrsOptions={fsrsOptions}
              deckConfig={deckConfig}
            />
          </Suspense>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-4 animate-in fade-in duration-200">
            <h1 className="px-2 pt-2 pb-1 text-2xl font-semibold tracking-tight">Configurações</h1>

            <section className="sheet px-5 sm:px-7 py-3" aria-labelledby="settings-course">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 id="settings-course" className="text-base font-semibold">Idioma de estudo</h2>
                  <p className="text-xs ink-tertiary">Cada idioma tem os próprios cartões e progresso.</p>
                </div>
                <CourseSwitch />
              </div>
            </section>

            {isCloudEnabled && (
              <AccountSettings
                email={session?.user.email ?? null}
                status={syncStatus}
                profile={profile}
                onSignIn={() => {
                  saveAuthSkipped(false);
                  setAuthSkipped(false);
                }}
                onChangePassword={() => setPasswordOpen(true)}
              />
            )}

            <section className="sheet px-5 sm:px-7 pt-5 pb-2">
              <AudioVoiceSettings
                deckConfig={deckConfig}
                onUpdateDeckConfig={handleUpdateDeckConfig}
                theme={theme}
              />
            </section>

            <section className="sheet px-5 sm:px-7 pt-5 pb-3" aria-labelledby="settings-session">
              <h2 id="settings-session" className="pb-3 text-base font-semibold">Sessão de estudo</h2>
              <StudyOptionsSettings
                deckConfig={deckConfig}
                onUpdateDeckConfig={handleUpdateDeckConfig}
                theme={theme}
              />
            </section>

            <section className="sheet px-5 sm:px-7 pt-5 pb-2" aria-labelledby="settings-fsrs">
              <h2 id="settings-fsrs" className="pb-3 text-base font-semibold">Repetição espaçada</h2>

              <FSRSSettings
                fsrsOptions={fsrsOptions}
                onUpdateFSRSOptions={handleUpdateFSRSOptions}
                onRequestMigration={() => setFSRSMigrationOpen(true)}
                theme={theme}
              />

              {/* Daily limits as ledger rows */}
              <div className="ledger border-t border-[var(--separator)]">
                {(
                  [
                    { id: 'daily-new-limit', label: 'Novos cartões por dia', key: 'dailyNewLimit', min: 5, max: 100, fallback: 20 },
                    { id: 'daily-review-limit', label: 'Revisões por dia', key: 'dailyReviewLimit', min: 20, max: 500, fallback: 100 },
                  ] as const
                ).map(({ id, label, key, min, max, fallback }) => (
                  <div key={id} className="flex items-center justify-between gap-4 py-3">
                    <label htmlFor={id} className="text-sm">
                      {label}
                    </label>
                    <input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={min}
                      max={max}
                      value={deckConfig[key]}
                      onChange={(e) =>
                        handleUpdateDeckConfig({ ...deckConfig, [key]: parseInt(e.target.value, 10) || fallback })
                      }
                      className="w-24 min-h-11 px-3 rounded-xl text-right text-sm font-semibold tabular glass-field focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                    />
                  </div>
                ))}
              </div>
            </section>

            <AnkiExportSettings cards={cards} deckConfig={deckConfig} fsrsOptions={fsrsOptions} />

            <section className="sheet px-5 sm:px-7 py-3" aria-labelledby="settings-look">
              <div className="flex items-center justify-between gap-4">
                <h2 id="settings-look" className="text-base font-semibold">Tema</h2>
                <div role="group" aria-label="Tema" className="flex p-1 rounded-xl bg-black/5 dark:bg-white/10">
                  {(['light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={theme === t}
                      onClick={() => theme !== t && handleToggleTheme()}
                      className={`min-h-10 px-4 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                        theme === t ? 'bg-white text-ink shadow-sm' : 'ink-secondary hover:text-[var(--text-fg)]'
                      }`}
                    >
                      {t === 'light' ? 'Claro' : 'Escuro'}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      <FSRSMigrationDialog
        open={fsrsMigrationOpen}
        onClose={handleCloseFSRSMigration}
        onMigrate={handleMigrateFSRS}
      />

      {/* Floating bottom bar, in the cards' glass */}
      <nav
        aria-label="Principal"
        className="sheet sheet-float rounded-2xl fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-2 py-2 flex items-center gap-1"
      >
        {COURSE_NAV.map(({ tab, label, Icon }) => {
          const isCurrent = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              aria-label={label}
              aria-current={isCurrent ? 'page' : undefined}
              onClick={() => setActiveTab(tab)}
              className={`min-h-11 min-w-11 flex items-center justify-center gap-1.5 px-3 rounded-xl text-sm font-semibold cursor-pointer transition-colors ${
                isCurrent ? 'bg-red-600 text-white' : 'ink-secondary hover:text-[var(--text-fg)] hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
