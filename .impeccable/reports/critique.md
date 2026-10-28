Method: dual-agent (A: /root/design_review · B: /root/technical_audit)

# Impeccable Critique — HSK-Flashcards

Data: 2026-10-28. Alvo: src/App.tsx e superfícies de navegação. Commit avaliado: 16d5c1d46ac65ecd81f6f97f273c8628520074ff. Notas anteriores aos ajustes de layout.

## Design Health Score

| Heurística | Nota | Evidência |
|---|---:|---|
| Visibilidade do estado | 3 | Contagens e estados de estudo claros; falha de download só no console |
| Correspondência com mundo real | 3 | Estudar e níveis claros; Leech e FSRS exigem familiaridade |
| Controle e liberdade | 3 | Desfazer, atalhos e saída na sessão |
| Consistência | 3 | Vidro e temas coerentes; alvos variam entre 36 e 60px |
| Prevenção de erros | 3 | Validações e limites presentes |
| Reconhecimento | 2 | Navegação móvel esconde rótulos |
| Eficiência | 3 | Estudo em um toque, atalhos e estudo por nível |
| Minimalismo | 3 | Editor de objetivo longo antes dos níveis |
| Recuperação de erros | 3 | Busca vazia sem ação contextual; downloads silenciosos |
| Ajuda | 2 | Termos especializados sem orientação suficiente |
| Total | 28/40 | Bom |

## Especificidade e impressão geral

Aprovada: hanzi serifado, selo e inventário em linhas formam um sistema próprio do estudo de vocabulário. A principal oportunidade é proteger o foco na revisão diária em telas pequenas. Não substituir a identidade.

Detector independente: 84 avisos consultivos em 14 arquivos, sendo 39 de tamanho de fonte, 36 de cor e 9 de raio. Não são 84 defeitos: várias ocorrências são permitidas no texto do DESIGN.md ou pertencem aos cursos francês/italiano. Scanner injetado no Chromium: No anti-patterns found. Sem overlay visual para apresentar.

## O que funciona

- CTA Estudar de 56px com contagens por estado e estudo direto por nível.
- Sessão com atalhos, desfazer e resumo final com próximo passo.
- Temas pareados, foco e tratamento de movimento/transparência reduzidos.

## Prioridades

1. P1: cabeçalho não quebra linha em 320px (DeckDashboard.tsx, bloco da marca). scrollWidth 341 contra viewport 320, último idioma cortado. Layout: permitir quebra mantendo a marca agrupada. Corrigido nesta execução.
2. P2: editor do objetivo domina o painel (StudyPlanner.tsx, formulário principal). Níveis começam por volta de 1144px em 390px. Layout/onboard: resumo compacto com edição explícita. Pendente, pois altera a apresentação do fluxo de planejamento.
3. P2: inventário comprimido em 320px (DeckDashboard.tsx, linhas de nível): +300 novas truncado. Layout: reduzir índice e intervalos no menor breakpoint, permitir texto em mais de uma linha. Corrigido.
4. P2: navegação móvel apenas por ícones (App.tsx, nav). Iniciante visual precisa adivinhar destinos; aria-label atende leitor de tela. Clarify/layout: avaliar rótulos curtos visíveis. Pendente.
5. P2: controles secundários de 36–40px, abaixo do piso de 44px do projeto (CourseSwitch, CardBrowser, StudyPlanner). Layout/adapt: ampliar área de toque. Corrigido nas áreas citadas; sliders e outras telas requerem revisão adicional.

## Personas e carga cognitiva

Jordan, iniciante: encontra Estudar rapidamente, mas precisa interpretar ícones e termos como Leech. Casey, móvel: cabeçalho cortado, inventário estreito e rolagem longa até níveis. Alex, experiente: atalhos e desfazer ajudam; o planejamento ocupa espaço mesmo quando não é a tarefa do dia.

O objetivo expõe sete decisões: níveis, data, ritmo, tempo, retenção, previsão e ativação. O início é claro; o planejamento cria um vale de complexidade; a conclusão da sessão oferece encerramento positivo.

Observações: busca vazia não oferece limpar filtros; label da dica mnemônica não está associado ao textarea. Data da prova quebra em duas linhas em 320px, mas não transborda no baseline — não é falha funcional comprovada.

## Próximas decisões

Priorizar contraste/recuperação ou descoberta/planejamento? Para planejamento, escolher resumo expansível ou editor sempre aberto. O layout já solicitado foi executado sem depender dessas decisões.
