# PedeIA

Aplicacao de pedidos com painel do comerciante, vitrine publica, acompanhamento de pedidos e painel administrativo.

## Estrutura

- `pages/`: paginas HTML publicas.
- `css/`: folhas de estilo separadas por funcao. A ordem no `pages/index.html` preserva a cascata atual.
- `js/`: aplicacao frontend.
- `server.js`: ponto de entrada do servidor Node e APIs.
- `server/`: dados locais e arquivos de apoio do servidor.
- `sql/pedeia-consolidado.sql`: migracao ativa unica para o Supabase.
- `sql/archive/`: scripts anteriores e schema legado, guardados apenas como referencia. Nao execute esses arquivos isoladamente.
- `docs/`: tutoriais, notas de implementacao e auditorias.
- `assets/`: imagens e outros recursos estaticos.

O servidor preserva as URLs publicas existentes (`/`, `/app.js`, `/acompanhar`, `/motoboy`, `/privacidade`, `/termos` e `/exclusao-de-dados`) apesar da organizacao fisica em pastas.

## Executar localmente

Requer Node.js 20 ou superior.

```powershell
npm install
npm start
```

O servidor inicia em `http://localhost:4173` por padrao. Defina `PORT` para usar outra porta.

## Banco de dados

O script [sql/pedeia-consolidado.sql](./sql/pedeia-consolidado.sql) reune as migracoes incrementais ativas. Ele pressupoe que as tabelas-base atuais da aplicacao ja existem no Supabase; nao e um instalador para um banco vazio. Antes de aplica-lo em producao, faca backup e revise as mudancas.

Os arquivos em `sql/archive/`, incluindo o antigo `schema.sql`, nao fazem parte da migracao consolidada e nao devem ser executados.

## Variaveis de ambiente

Configure no ambiente do servidor, nunca no navegador:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` para rotinas administrativas que exijam acesso privilegiado
- `PUBLIC_BASE_URL` para links publicos e callback de exclusao de dados
- `ORS_API_KEY` para otimizacao de rotas
- `PORT` (opcional)

Nunca publique senhas, `DATABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY`.

## WhatsApp

O unico uso mantido e o botao **Falar com o administrador**: o comerciante inicia a conversa no proprio WhatsApp usando o telefone informado no painel administrativo. O PedeIA nao conecta contas de loja nem recebe ou envia mensagens pela API do WhatsApp.

## Paginas publicas

- Vitrine: `/`
- Acompanhamento: `/acompanhar`
- Entregadores: `/motoboy`
- Privacidade: `/privacidade`
- Termos: `/termos`
- Exclusao de dados: `/exclusao-de-dados`

As paginas HTML tambem continuam acessiveis pelos caminhos antigos com extensao `.html`.

## Privacidade e exclusao de dados

Paginas publicas para configurar no provedor:

- Politica de privacidade: `/privacidade`
- Termos de servico: `/termos`
- Instrucoes de exclusao: `/exclusao-de-dados`
- Callback de exclusao (opcional): `/api/meta/data-deletion`

O fluxo de exclusao usa as tabelas criadas por `sql/pedeia-consolidado.sql`. Para habilitar o callback, configure `PUBLIC_BASE_URL` e `META_APP_SECRET` no servidor. Esse segredo e usado para validar o callback de exclusao da Meta, nao para integrar o PedeIA ao WhatsApp.

Uma solicitacao recebida pelo callback nao apaga dados automaticamente. O administrador deve verificar e tratar a solicitacao no painel. A rotina de encerramento remove anexos e mensagens cobertos pelo fluxo e anonimiza dados pessoais conhecidos, mantendo dados de negocio quando necessario. As tabelas e mensagens antigas de integracoes anteriores com WhatsApp tambem nao sao removidas automaticamente; avalie e faca backup antes de qualquer limpeza manual.

Os textos das paginas legais sao iniciais e devem ser revisados por profissional juridico antes de uso definitivo.
