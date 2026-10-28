# Selos e checagem FSRS — 2026-10-28

Impeccable colorize: manter o selo de laca/cera e tornar o resultado inequívoco. Selos avaliados em Operate.

## Selos

88px, preenchimento opaco verde (Bom/Fácil) ou vermelho (Novamente/Difícil), contorno branco e ícone lucide check/cross com texto em português. Mesma semântica nos três cursos. O selo permanece 420ms com opacidade integral antes da saída de160ms; movimento reduzido mantém feedback estático por580ms. Anúncio no aria-live da sessão. Guardas existentes impedem respostas duplicadas e cancelamento ao sair impede registro tardio.

Chromium390px:16 estados grade/curso/tema/movimento verificados por relógio virtual; tamanho88px, cor esperada, texto e opacidade1 aos250ms. Capturas seal-light-1/3 e seal-dark-1/3. Navegação de entrada sem ViewTransition no teste para isolar o feedback da resposta. Fallback sem Web Animations mantém registro imediato, sem selo temporizado. Safari/Firefox/aparelhos físicos não testados.

## FSRS

Curva R(t,S)=(1+factor*t/S)^decay, decay=-w20, factor=0.9^(1/decay)-1. Invariantes R(0)=1 e R(S)=0.9 testadas. Inversa usada no intervalo, dificuldade, estabilidade de acerto/erro, atualizações no mesmo dia e passos10/15min comparados com ts-fsrs5.4.2 com fuzz desligado.

2304 comparações em retenções0.70/0.85/0.90/0.99, tetos1/30/36500, estabilidades0.1/1/20/36500, dificuldades1/5/10, tempos0/1/30/365dias e quatro respostas. Mais200 respostas encadeadas e24 casos com pesos customizados em aprendizado/reaprendizado. Comparam estado, estabilidade/dificuldade (tolerância1e-8), reps, lapses, dias e data de vencimento.

Correção: ordenação Hard/Good/Easy antes incrementava good=hard+1 e easy=good+1 mesmo ao atingir maximum_interval. Agora o teto é aplicado após ordenar; no teto, intervalos podem coincidir. A referência5.4.2 também excede esse teto; o teste diferencial normaliza SOMENTE o teto do resultado esperado e um teste independente exige intervalos<=máximo e data correspondente. Nenhuma fórmula de memória alterada.

Compatibilidade deliberada: migração19→21 acrescenta[0,0.5]; o expoente zero preserva o comportamento legado. ts-fsrs normaliza esse zero a0.01 ao construir seu motor; por isso a migração é validada por equação independente, sem declarar identidade nessa exceção. O motor legado FSRS-5 é preservado, não certificado como equivalente ao FSRS-6.

Validação:22 testes de FSRS;99 testes totais;TypeScript e build aprovados. Avisos de chunks de vocabulário grandes permanecem. Alterações locais na branch fix/visible-grade-seals-fsrs-review, sem publicação.
