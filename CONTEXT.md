# CONTEXT.md

Guia de contexto e arquitetura para desenvolvimento no projeto.

---

## 1. Visão Geral do Projeto

Aplicação web progressiva (SPA) de flashcards para aprendizado de Mandarim (HSK 1 a 9) com repetição espaçada moderna:
- **Algoritmo FSRS nativo**: Cálculo de estabilidade, dificuldade e retrievabilidade baseado no FSRS (Free Spaced Repetition Scheduler).
- **Recursos principais**: Sessão de estudos com botões de resposta e barra de progresso, lousa de escrita de ideogramas (Hanzi canvas), sintetizador de voz (Web Speech API TTS), navegador/filtro de cartões (busca por Hanzi, Pinyin e tradução) e painel estatístico com curva de retenção, projeção de revisões e histórico.
- **Stack**:
  - **Linguagem**: TypeScript (modo estrito)
  - **Frontend**: React 19, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), Lucide React
  - **Armazenamento**: `localStorage` no navegador (100% client-side, sem dependência de banco de dados externo)
  - **Deploy**: Otimizado para build estático no **GitHub Pages**

---

## 2. Comandos Principais

```bash
# Iniciar servidor de desenvolvimento (porta 3000)
npm run dev

# Checagem de tipos e linting
npm run lint

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
    │   ├── CardBrowser.tsx         # Busca, filtragem e inspeção do vocabulário
    │   ├── DeckDashboard.tsx       # Visão geral de baralhos e progresso HSK
    │   ├── HanziWritingCanvas.tsx  # Canvas interativo para treino de traçado de ideogramas
    │   ├── MandarinCardView.tsx    # Exibição do cartão de estudo (frente/verso, pinyin, áudio)
    │   ├── SettingsModal.tsx       # Configurações gerais (FSRS, retenção alvo, áudio, tema)
    │   ├── StatsView.tsx           # Painel de estatísticas, curva FSRS e projeção de revisões
    │   └── StudySession.tsx        # Fluxo de revisão de cartões com barra de progresso e atalhos
    │
    ├── data/               # Vocabulários e listas HSK
    │   ├── defaultDecks.ts         # Baralhos padrão pré-carregados
    │   ├── hsk1.json a hsk7_9.json # Datasets oficiais de vocabulário HSK
    │   └── hskParser.ts            # Parser para importação de CSV/TSV
    │
    ├── lib/                # Lógica de negócio e utilitários
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
- **Sem emojis na UI**: A interface deve ser estritamente minimalista e limpa. Use exclusivamente ícones vetoriais do pacote `lucide-react`.
- **Tipagem Estrita**: Manter interfaces e tipos centralizados em `src/types/card.ts`. Evitar `any`.
- **Design & Tailwind v4**: Utilizar utilitários Tailwind com suporte completo a tema escuro/claro (`theme === 'dark' ? '...' : '...'`).
- **Persistência Segura**: Qualquer nova funcionalidade de dados deve passar por métodos em `src/lib/storage.ts` com tratamento contra JSON inválido ou cotas de armazenamento.
- **Verificação**: Sempre rodar `npm run lint` e testar `npm run build` antes de finalizar alterações.

### O que NÃO fazer
- **NÃO usar emojis** em textos, botões, cabeçalhos ou tooltips.
- **NÃO adicionar bancos de dados de servidor ou rotas backend** que quebrem a hospedagem estática no GitHub Pages.
- **NÃO alterar a fórmula do FSRS** em `src/lib/fsrs.ts` sem validação matemática rigorosa.
- **NÃO poluir a UI com copy verbosa**: Manter textos objetivos, foco nos cartões e nas métricas de estudo.
