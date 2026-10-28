# Impeccable Layout — resultado

Branch local: fix/impeccable-layout-review. Sem push ou publicação.

Tese: Hoje e Estudar lideram; detalhes por estado apoiam; objetivo e inventário são grupos separados. Preservar vidro, paletas e tipografia. Em telas estreitas, marca e seletor quebram linha; resumo usa largura completa abaixo da contagem e pilha; linhas reservam mais largura ao texto.

Alterações: cabeçalho flexível; resumo em grade adaptativa a 420px; pilha menor no celular estreito; índice do inventário 36px no celular e 56px no desktop; texto de estado sem truncamento; data e filtros com quebra; controles revisados de 44px; barra inferior e conteúdo respeitam safe-area.

Verificação:
- Hierarquia: capturas after-320 e after-1440 preservam contagem, pilha, CTA e grupos.
- Agrupamento: detalhes do dia abaixo de contagem/pilha em <420px; objetivo e inventário continuam em folhas distintas.
- Ritmo: intervalos de 8–16px nas linhas e 24–32px nas folhas; 44px nos controles revisados.
- Densidade: inventário recupera +300 novas em 320px; objetivo expandido permanece como oportunidade separada.
- Adaptação: Decks, Dicionário e Configurações em 320,390,768,1440px sem rolagem horizontal. Baseline320: scrollWidth341; final320:320.
- Temas/cursos: dashboard320 em zh/fr/it claro/escuro sem overflow, seletor com44px.
- Ordem: DOM sem order ou tabindex positivo; grade estreita põe pilha na primeira linha como ilustração aria-hidden, CTA segue resumo.
- Extremos: safe-area tratada; quebras substituem truncamento. Zoom200%, textos extremos, aparelhos físicos e motores fora do Chromium não foram validados.
- Detector layout antes/depois: [] (nenhum achado). Não comprova hierarquia por si só.
- npm run lint OK; npm run test94/94; npm run build OK, com aviso de chunks de vocabulário grandes.
- npm ci padrão falhou por conflito preexistente esbuild/Vite; instalação local com --legacy-peer-deps. Dependências não alteradas.

Audit e Critique refletem a baseline; nenhuma nota posterior foi inventada. Próxima etapa recomendada: /impeccable polish após resolver as prioridades restantes.
