# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Estudantes individuais que aprendem vocabulário chinês (Mandarim) pelos níveis HSK 1 a 9, estudando por conta própria em sessões curtas e frequentes. Interface em português.

## Product Purpose

App de repetição espaçada para memorizar vocabulário HSK. Cada cartão mostra hanzi, pinyin e tradução, com áudio via síntese de voz. O agendamento das revisões usa FSRS. Sucesso é o estudante revisar no dia certo e reter o vocabulário ao longo do tempo, com progresso visível em estatísticas.

## Positioning

Repetição espaçada com algoritmo FSRS calculado no próprio app, sem conta, sem servidor e sem banco externo: o progresso fica no navegador do estudante. Os cartões são estilizados como acrílico.

## Operating Context

- Uso em navegador desktop e celular, publicado como site estático no GitHub Pages.
- Sessão de estudo com botões de resposta, barra de progresso e atalhos de teclado.
- Escrita de ideogramas em lousa (canvas) e diagrama animado da ordem dos traços.
- Navegador e filtro de cartões por hanzi, pinyin e tradução.

## Capabilities and Constraints

- Stack existente: React 19, Vite, Tailwind CSS v4, Lucide React, TypeScript em modo estrito.
- Dados: vocabulário HSK 1 a 9 em `src/data/` (JSON e CSV).
- Persistência apenas em `localStorage`, por meio de `src/lib/storage.ts`, com tratamento de JSON inválido e cota.
- Síntese de voz pela Web Speech API.
- Fórmula FSRS em `src/lib/fsrs.ts` não deve mudar sem validação matemática.
- Nenhuma dependência de servidor ou rota de backend.

## Brand Commitments

- Nome: Hanzi Anki - FSRS Spaced Repetition.
- Interface sem emojis; ícones exclusivamente do pacote `lucide-react`.
- Texto objetivo e minimalista, com foco nos cartões e nas métricas de estudo.
- Suporte a tema claro e escuro em todos os componentes.

## Evidence on Hand

- Datasets oficiais HSK 1 a 9 em `src/data/` (hsk1.json a hsk7_9.json, hsk30.csv).
- Tipografia de caracteres chineses: Noto Serif SC (Google Fonts), já carregada em `index.html`.
- Nenhum depoimento, estudo de usuários ou métrica de uso foi fornecido; não criar prova social.

## Product Principles

- Estudo sem atrito: o estudante chega ao cartão e responde em poucos toques ou teclas.
- Privacidade por padrão: nada sai do navegador sem ação explícita.
- Métricas que ajudam a decidir o que estudar, sem poluir a tela.
- Visual de cartão acrílico como identidade; decoração só quando reforça a leitura do hanzi.
