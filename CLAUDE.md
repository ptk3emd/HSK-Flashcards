# CONTEXT.md

Guia de contexto e arquitetura para desenvolvimento no projeto.

---

## 1. Visão Geral do Projeto

Aplicação web progressiva (SPA) de flashcards com repetição espaçada moderna, em três cursos:
- **Lóutī Mandarim** (`zh`): vocabulário oficial HSK 3.0 (HSK 1 a 7–9), com hanzi, pinyin, escrita, ordem dos traços e aba Aprender.
- **Palier Français** (`fr`): o mesmo vocabulário nos mesmos níveis, com o equivalente francês na frente do cartão (adaptação cultural onde cabe), sem hanzi. Paleta marinière (bleu de France, écru, selo de cera vermelho) e Garamond.
- **Scalino Italiano** (`it`): o mesmo vocabulário nos mesmos níveis, com o equivalente italiano, sem hanzi. Paleta pietra e cipreste (verde, selo de cera verde) e Bodoni.

O curso ativo fica em `src/lib/courseId.ts` (lido uma vez; trocar de curso recarrega o app) e tudo o que difere entre eles em `src/lib/course.ts` (`COURSE`, `levelLabel`). Cada curso tem as próprias chaves no `localStorage` (os estrangeiros usam o prefixo do curso: `fr_`, `it_`). As paletas vivem em `src/styles/course-fr.css` e `course-it.css`, sob `html.course-fr` e `html.course-it`, e remapeiam a escala `red` do Tailwind para a cor de cada curso.

O vocabulário estrangeiro fica em `src/data/fr/` e `src/data/it/`, e o Supabase recebe o mesmo conteúdo por `npm run seed:fr` e `npm run seed:it` (`scripts/seed-course.ts`).

- **Algoritmo FSRS nativo**: Cálculo de estabilidade, dificuldade e retrievabilidade baseado no FSRS (Free Spaced Repetition Scheduler).
- **Recursos principais**: Sessão de estudos com botões de resposta e barra de progresso, lousa de escrita de ideogramas (Hanzi canvas), sintetizador de voz (Web Speech API TTS), navegador/filtro de cartões (busca por Hanzi, Pinyin e tradução) e painel estatístico com curva de retenção, projeção de revisões e histórico.
- **Stack**:
  - **Linguagem**: TypeScript (modo estrito)
  - **Frontend**: React 19, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), Lucide React
  - **Armazenamento**: `localStorage` no navegador como fonte da verdade (o app funciona offline e sem conta)
  - **Conta e nuvem (opcional)**: Supabase Auth + tabelas `user_progress` e `review_logs` com RLS (`supabase/migrations/`). Ativo só quando o build recebe `VITE_SUPABASE_PUBLISHABLE_KEY`; a sincronização fica em `src/lib/sync.ts` (mescla em `src/lib/syncMerge.ts`)
  - **Deploy**: Otimizado para build estático no **GitHub Pages**

---

## 2. Comandos Principais

```bash
# Iniciar servidor de desenvolvimento (porta 3000)
npm run dev

# Checagem de tipos e linting
npm run lint

# Executar os testes unitários (node:test via tsx)
npm run test

# Gerar build de produção otimizado para GitHub Pages
npm run build

# Pré-visualizar o build localmente
npm run preview

# Limpar artefatos de build
npm run clean
```

---

## 3. Mapa de Diretórios

```
/
├── .env.example            # Variáveis de ambiente de exemplo
├── index.html              # Ponto de entrada HTML (SPA estática)
├── package.json            # Dependências e scripts npm
├── tsconfig.json           # Configuração do TypeScript
├── vite.config.ts          # Configuração do Vite com plugin Tailwind e React
└── src/
    ├── App.tsx             # Componente raiz, controle de abas e estado global
    ├── main.tsx            # Inicialização e montagem do React DOM
    ├── index.css           # Estilos globais e importação do Tailwind CSS v4
    │
    ├── components/         # Componentes visuais modulares
    │   ├── AudioVoiceSettings.tsx  # Configurações de voz/TTS (velocidade, pitch, dialeto)
    │   ├── AnkiExportSettings.tsx  # Exportação do vocabulário e do backup para o Anki
    │   ├── CardBrowser.tsx         # Busca, filtragem e inspeção do vocabulário
    │   ├── DeckDashboard.tsx       # Visão geral de baralhos e progresso HSK
    │   ├── HanziWritingCanvas.tsx  # Canvas interativo para treino de traçado de ideogramas
    │   ├── MandarinCardView.tsx    # Exibição do cartão de estudo (frente/verso, pinyin, áudio)
    │   ├── SettingsModal.tsx       # Configurações gerais (FSRS, retenção alvo, áudio, tema)
    │   ├── StatsView.tsx           # Painel de estatísticas, curva FSRS e projeção de revisões
    │   ├── StrokeOrderDiagram.tsx  # Diagrama animado interativo de ordem dos traços (Bǐshùn)
    │   └── StudySession.tsx        # Fluxo de revisão de cartões com barra de progresso e atalhos
    │
    ├── data/               # Vocabulários e listas HSK
    │   ├── defaultDecks.ts         # Baralhos padrão pré-carregados
    │   ├── hsk1.json a hsk7_9.json # Datasets oficiais de vocabulário HSK
    │   ├── fr/fr1.json a fr7_9.json # Curso de francês: mesmos ids (F-xxxxx), mesmos níveis
    │   ├── it/it1.json a it7_9.json # Curso de italiano: mesmos ids (I-xxxxx), mesmos níveis
    │   └── hskParser.ts            # Parser para importação de CSV/TSV
    │
    ├── lib/                # Lógica de negócio e utilitários
    │   ├── ankiExport.ts           # Geração do CSV do Anki e do backup JSON (com testes)
    │   ├── fsrs.ts                 # Implementação matemática do algoritmo FSRS
    │   ├── speech.ts               # Utilitários de síntese de voz (TTS Web Speech API)
    │   └── storage.ts              # Persistência e sincronização via localStorage
    │
    ├── styles/             # Estilos auxiliares e temas
    └── types/              # Definições de interfaces e tipos TypeScript
        └── card.ts                 # Interfaces: Card, Deck, ReviewLog, FSRSOptions, etc.
```

---

## 4. Convenções de Código e Diretrizes

### O que FAZER
- **Compatibilidade GitHub Pages**: Manter toda a arquitetura como Client-Side SPA estática (sem rotas de servidor dinâmicas obrigatórias, imports e caminhos relativos).
- **Dois cursos**: recurso novo que dependa de hanzi/pinyin deve checar `COURSE.hasCharacters`; nível mostrado ao aluno passa por `levelLabel`; cor de marca usa as utilidades `red-*` ou `var(--brand)` (nunca o hex fixo), para o francês herdar o azul.
- **Sem emojis na UI**: A interface deve ser estritamente minimalista e limpa. Use exclusivamente ícones vetoriais do pacote `lucide-react`.
- **Tipagem Estrita**: Manter interfaces e tipos centralizados em `src/types/card.ts`. Evitar `any`.
- **Design & Tailwind v4**: Utilizar utilitários Tailwind com suporte completo a tema escuro/claro (`theme === 'dark' ? '...' : '...'`).
- **Persistência Segura**: Qualquer nova funcionalidade de dados deve passar por métodos em `src/lib/storage.ts` com tratamento contra JSON inválido ou cotas de armazenamento.
- **Nuvem**: Dados novos de estudo que devem seguir o aluno entre aparelhos precisam entrar no upsert de `CloudSync.pushProgress` e na mescla de `CloudSync.start`. Nunca use a chave `service_role`/secret no app; só a publicável.
- **Verificação**: Sempre rodar `npm run lint` e `npm run test`, e testar `npm run build` antes de finalizar alterações.

### O que NÃO fazer
- **NÃO usar emojis** em textos, botões, cabeçalhos ou tooltips.
- **NÃO adicionar bancos de dados de servidor ou rotas backend** que quebrem a hospedagem estática no GitHub Pages.
- **NÃO alterar a fórmula do FSRS** em `src/lib/fsrs.ts` sem validação matemática rigorosa.
- **NÃO poluir a UI com copy verbosa**: Manter textos objetivos, foco nos cartões e nas métricas de estudo.
