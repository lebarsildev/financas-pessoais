# Finanças Pessoais

Painel web das minhas finanças, em dois módulos:

- **Conta**: entradas × saídas, gastos por categoria, saldo diário, lançamentos e orçamento.
- **Investimentos**: carteira com preço médio e cotação do dia ([brapi.dev](https://brapi.dev)), proventos recebidos e a receber, histórico de negociações, resultado realizado e Tesouro Direto.

Modo claro e escuro. A mesma senha abre os dois módulos.

**Os dados ficam cifrados.** O repositório só guarda `data/vault.json`, cifrado com AES‑256‑GCM e uma chave derivada da senha (PBKDF2‑SHA256, 600 mil iterações). O site baixa esse arquivo e o decifra no navegador, na memória da aba. A senha e as planilhas nunca vão para o GitHub.

## Estrutura

```
index.html            página do painel
assets/style.css      visual (tokens de cor, tema claro/escuro, animações)
assets/app.js         lógica: decifrar, filtrar, gráficos (Chart.js)
investimentos.html    módulo de investimentos (assets/investimentos.*)
data/vault.json       conta, cifrado (gerado pelo script)
data/investimentos.json  investimentos, cifrado (gerado pelo script)
tools/gerar_cofre.py  lê os extratos .xlsx, categoriza e cifra
tools/b3.py           lê os relatórios da B3 e calcula posição, preço médio e proventos
tools/categorias.exemplo.json  exemplo de regras (as suas ficam em extratos/categorias.json, fora do Git)
extratos/             extratos da conta (.xlsx, fora do Git)
extratos/b3/          relatórios da Área do Investidor B3 (.xlsx, fora do Git)
extratos/faturas/     faturas do cartão: .xlsx (PDF convertido) ou .json transcrito (fora do Git)
atualizar.sh          gera o cofre e publica num passo só
```

## Extrato da conta

Use de preferência o **.txt exportado pelo banco** (`DD/MM/AAAA;DESCRIÇÃO;VALOR`), salvo em `extratos/`. Ele vira a base da conta. Uma planilha .xlsx na mesma pasta só completa os dias depois do fim do .txt e serve de referência para o saldo: o script calcula o saldo dia a dia pelos lançamentos e confere com os saldos da planilha.

## Primeira vez

```bash
pip3 install --user openpyxl cryptography
python3 tools/gerar_cofre.py
```

O script lê todos os `.xlsx` de `extratos/`, mostra o total por categoria e pede a senha (mínimo 12 caracteres). Como o arquivo cifrado fica público, use uma senha forte: uma frase com 3 ou 4 palavras funciona bem.

## Orçamento e previsão do mês

- **Previsão:** saldo previsto para o fim do mês atual = saldo de hoje + entradas que se repetem − contas que se repetem − fatura estimada (parcelas já lançadas + mediana das compras à vista) − gastos do dia a dia (média diária dos últimos 3 meses).
- Algo "se repete" quando o mesmo valor (±10%) aparece em pelo menos 3 dos últimos 4 meses. Contas fixas com valor variável entram por `extratos/categorias.json` → `fixos`.
- **Metas:** começam pela mediana mensal de cada categoria. Edite na aba Orçamento, clique em "Baixar metas.json", salve em `extratos/metas.json` e gere o cofre para valer em todos os aparelhos.

## Faturas do cartão

Salve as faturas em `extratos/faturas/`. O script lê:

- `.xlsx` gerado a partir do PDF da fatura (o texto pode vir bagunçado; a leitura confere a soma com o total impresso);
- `.json` com a fatura transcrita (por exemplo, a partir de uma foto), no formato de `faturas_2026_jan-ago.json`.

Cada fatura é ligada ao débito "FATURA ..." do mesmo mês no extrato. No painel, o lançamento da fatura abre o detalhe das compras, e "Detalhar cartão" distribui a fatura pelas categorias. Nomes e categorias dos estabelecimentos ficam em `extratos/categorias.json` → `cartao`.

## Investimentos (B3)

Na [Área do Investidor B3](https://www.investidor.b3.com.br), em Extratos, exporte em Excel os relatórios de **Negociação**, **Movimentação** e **Eventos** (proventos a receber) e salve em `extratos/b3/`. Pode exportar períodos que se sobrepõem: linhas repetidas entre arquivos contam uma vez. O preço médio considera desdobros, bonificações e trocas de código.

As cotações vêm da brapi.dev, que libera PETR4, VALE3, ITUB4 e MGLU3 sem chave. Para outros ativos, digite a cotação no cartão do ativo; ela fica salva no navegador.

## Todo mês

1. Exporte o extrato e salve o `.xlsx` em `extratos/`. Pode deixar os meses anteriores lá: lançamentos repetidos entre arquivos são contados uma vez só.
2. Rode `./atualizar.sh`.

A planilha precisa de uma aba com as colunas **Data**, **Lançamentos** (ou Descrição), **Valor** e, se tiver, **Saldo**. Uma aba **Revisar** é mostrada no painel como "Para revisar".

## Publicar sozinho (uma vez)

Para o `atualizar.sh` publicar direto, sem pedir ao Claude, ligue a pasta ao GitHub:

1. No GitHub: foto do perfil → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
   - **Repository access:** Only select repositories → `financas-pessoais`.
   - **Permissions → Repository permissions → Contents:** Read and write.
   - Validade de até 1 ano. Copie o token (começa com `github_pat_`); ele só aparece uma vez.
2. No Terminal, dentro da pasta do projeto: `bash ligar_github.sh`. Quando pedir, **Username** é `lebarsildev` e **Password** é o token. O Mac guarda no Chaveiro.

Depois disso, todo mês: `bash atualizar.sh`. Ele busca as melhorias do painel, gera os dados cifrados (pede a senha do cofre) e publica.

O token só serve para este repositório, que é público e só tem dados cifrados. Nunca cole o token nem a senha do cofre em conversas.

## Conferência e cópia de segurança

- O gerador pede a senha uma vez e confere se ela abre o cofre atual. Assim, um erro de digitação não troca a senha do site.
- Antes de gravar, ele mostra o que mudou desde o cofre anterior: lançamentos novos, saldo e um **ATENÇÃO** se um mês já fechado mudou (sinal de extrato lido errado ou corrigido).
- `metas.json` e `plano.json` baixados pelo site são trazidos sozinhos da pasta Downloads para `extratos/`.
- Uma cópia de `categorias.json`, `metas.json`, `plano.json` e das faturas transcritas vai cifrada dentro do cofre. Para recuperar num computador novo: `python3 tools/gerar_cofre.py --restaurar`.

## Categorias

Edite `extratos/categorias.json` (fica só no seu computador; o repositório público tem apenas `tools/categorias.exemplo.json`). Cada regra é `[categoria, padrão]`, onde o padrão é uma expressão regular aplicada à descrição em maiúsculas; vale a primeira que bater. Depois rode o script de novo.

`Transferência própria` (movimentação entre suas contas) não conta como entrada nem como saída.

## Conferir a senha

```bash
python3 tools/gerar_cofre.py --verificar
```

Não existe recuperação de senha: se esquecer, gere o cofre de novo a partir dos extratos.

## Versão dos arquivos

`index.html` e `investimentos.html` carregam `assets/*.js|css?v=AAAAMMDDHHMM`. Ao mudar o código, atualize esse número (o Claude faz isso ao publicar) para o navegador não usar a versão antiga em cache.

## Meta e reserva na Conta

- **Visão geral:** cartão "Meta dos investimentos" com o valor da carteira, o percentual da meta e a data prevista no plano e no ritmo dos últimos 12 meses. Usa o cofre de investimentos já aberto na aba e o plano salvo em Investimentos → Meta 1 milhão.
- **Orçamento → Sobra do mês e aporte:** sobra da conta, valor aplicado (relatórios da B3) e aporte do plano, mês a mês.
- **Orçamento → Reserva de emergência:** você informa quanto tem guardado; o painel compara com N meses do seu gasto típico. O valor vai junto no `metas.json`.

## Virada do ano

Com dados de mais de um ano, a Conta mostra o seletor "‹ ano ›": a barra lista os meses daquele ano e "Ano todo" soma só ele. Comparações entre meses (média, mês anterior, previsão) continuam atravessando a virada.

## Segurança do site

- O Chart.js é servido pelo próprio site (`assets/vendor/chart-4.4.1.umd.min.js`), com verificação de integridade (SRI). Nenhum código de terceiros roda junto com os dados decifrados.
- Uma política de segurança (CSP) só deixa a página rodar scripts do próprio site e se conectar à brapi.dev (cotações).
- O painel bloqueia sozinho depois de 10 minutos sem uso, ou quando a aba fica 10 minutos em segundo plano. Para mudar o tempo, rode no console do navegador: `localStorage.setItem('fin-bloqueio-min', '5')`.

## Investimentos: comparação e meta

- **Carteira × CDI × inflação** (aba Carteira): refaz cada compra, venda e provento de ações como se o dinheiro tivesse ido para o CDI ou só acompanhado o IPCA, e compara com o valor de hoje.
- **Meta 1 milhão**: simulador com dois caminhos (CDI e IPCA + juros), em reais de hoje, tabela de aportes e acompanhamento do plano salvo (fica no navegador).
- `data/indices.json` é público (CDI e IPCA mensais, sem dados pessoais). O `tools/gerar_cofre.py` atualiza pelo Banco Central (SGS 4391 e 433); sem internet, mantém o arquivo.
- Botão de olho no topo dos dois módulos: troca os valores por "R$ ••••" e esconde a escala dos gráficos.

## Fontes

As fontes (Bricolage Grotesque, Figtree, IBM Plex Mono; licença OFL) ficam em `assets/fonts/`. O site não busca nada no Google; a única chamada externa é a cotação em brapi.dev.
