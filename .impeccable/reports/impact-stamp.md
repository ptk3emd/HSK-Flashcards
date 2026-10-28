# Revisão visual posterior: selos orientais e idiomas

A direção retangular foi substituída a pedido do usuário. O componente agora usa selo quadrado de laca com caracteres chineses no Mandarim, e cera circular com iniciais e palavras francesas/italianas nos outros cursos. Mantém o arraste progressivo e a ancoragem que evita sair da tela. Ver DESIGN.md para a especificação vigente.99 testes, TypeScript e build aprovados; toque/cancelamento/gestos invertidos e movimento reduzido verificados em320×568.

O registro abaixo descreve a versão anterior e serve apenas como histórico.

# Overdrive + Bolder — carimbo de impacto

Direção escolhida pelo usuário: carimbo grande com textura de tinta, aparição dinâmica no arraste e correção de Bom fora da tela. Escopo: feedback de resposta; FSRS sem alterações.

Implementação: GradeStamp.tsx usa SVG leve com duas regras retangulares, lucide check/cross, texto em português e máscara determinística de tinta gasta. Verde/vermelho em ambos os temas, fundo opaco de papel. O carimbo é irmão do cartão transformado e fica ancorado à área visível do estudo. Sua largura é limitada pela largura e altura dessa área, incluindo margem para rotação e pressão.

Durante o arraste, progresso=(distância-10)/(70-10), limitado a0..1; opacidade e escala seguem esse progresso. O retorno à origem retira a prévia. O significado vem da ação configurada, não da direção física. Soltar antes de70px ou cancelar não registra resposta. Na confirmação, pressão de200ms; mantém o tempo de feedback anterior420ms e saída160ms. Movimento reduzido retém opacidade progressiva, sem transformar ou animar o carimbo. Feedback se limpa também quando uma fila curta reapresenta o mesmo id de cartão.

Verificação Chromium/Playwright:18 combinações (320/390/1440px × zh/fr/it × claro/escuro). Opacidade medida0.333 a30px e0.833 a60px. Acerto e erro dentro do viewport durante arraste e confirmação; cancelamento abaixo do limiar sem carimbo residual.

Toque sintetizado via Chromium CDP em320×568, movimento normal/reduzido: gestos invertidos respeitados; voltar à origem e touchCancel removem tinta; histórico de respostas permanece vazio durante a prévia. Caixa do carimbo dentro do viewport. Não substitui teste em aparelho físico ou Safari/Firefox.

Capturas locais: impact-light-1-drag.png, impact-light-3-drag.png, impact-dark-1-drag.png, impact-dark-3-drag.png. Revisão visual realizada: carimbo cruza a região de leitura, ícone/texto têm hierarquia clara, Bom fica centralizado enquanto o cartão segue à direita.

TypeScript,99 testes e build aprovados. Documentação DESIGN.md e sidecar atualizados. Branch local fix/impact-stamp-swipe; sem commit/push nesta execução.
