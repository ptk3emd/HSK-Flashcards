# Correções das auditorias — 2026-10-28

Aplicadas na branch local fix/impeccable-layout-review; sem push/publicação.

- Cabeçalho quebra linha em320px; resumo diário usa grade; inventário recupera espaço e permite texto integral.
- Texto terciário: alpha0.85 no claro e0.78 no escuro; preservadas paletas dos cursos.
- Navegação com rótulos curtos visíveis no celular e safe-area.
- Planejador recolhido por padrão com controle aria-expanded/aria-controls; rascunhos permanecem montados ao recolher.
- Controles revisados têm44px; sliders mantêm trilho de4px e área de44px.
- Campos editáveis móveis16px para evitar o risco de zoom de foco no iOS.
- Busca sem resultados oferece limpar consulta, campo, nível e estado.
- Dica mnemônica tem label associado; Leech passa a Erros frequentes.
- Falhas de download anunciam alerta, oferecem nova tentativa e recarregar página. A recarga é necessária quando o navegador retém uma importação dinâmica rejeitada.
- esbuild atualizado para0.28.2 compatível com Vite8; package-lock e bun.lock atualizados.
- Documentação e sidecar alinhados às regras alteradas; nenhum aviso mecânico foi usado para remover cores intencionais dos cursos.

Validação: npm ci padrão OK; bun install --frozen-lockfile OK; TypeScript OK;94/94 testes; build OK; diff --check OK. Playwright Chromium:24 combinações (3cursos×2temas×4larguras320/390/768/1440), incluindo expandir/recolher sem perder data e reset da busca. Decks e configurações sem overflow em todas as combinações. Capturas final-light-320.png e final-dark-320.png.

Limites: não certifica WCAG. Safari, Firefox e aparelhos físicos não testados; a prevenção de zoom iOS é baseada no tamanho de fonte. Build ainda avisa sobre chunks grandes de vocabulário, já carregados sob demanda. Detector continua com avisos consultivos de valores literais e variantes intencionais; não equivalem a defeitos verificados. Não atualizamos a versão do Impeccable durante a sessão.
