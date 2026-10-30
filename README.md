# PedeIA — versão consolidada atualizada

Esta versão reúne a base mestre e as funcionalidades adicionadas nesta rodada.

## Principais módulos

- Autenticação Supabase e bloqueio por assinatura.
- Painel do comerciante e vitrine pública.
- Pedidos ativos e histórico.
- Conversas de pedidos ativos.
- Suporte com anexos.
- Entregadores com link individual persistente, GPS e histórico.
- Localização dos entregadores no mapa.
- Relatórios de vendas.
- Promoções automáticas.
- Personalização da vitrine.
- Categorias e produtos com opções/adicionais.
- Impressoras e configurações de impressão.
- Tutorial interativo.
- Contato administrativo por WhatsApp.

## Banco

Execute `SUPABASE-CONSOLIDADO-FINAL.sql` no SQL Editor do Supabase.

O SQL é incremental e não usa `id = 1` para o contato administrativo. A tabela esperada é:

- `id` UUID
- `nome` text
- `whatsapp` text
- `ativo` boolean

## Render

Configure pelo menos:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PUBLIC_BASE_URL`
- `ORS_API_KEY` para otimização de rotas

## Observação

As novas rotas de relatórios, promoções, localização e otimização ficam protegidas pela sessão autenticada do comerciante.


## Instalação desta versão consolidada

Execute `SUPABASE-CONSOLIDADO-FINAL.sql` no Supabase. Para ativar a numeração sequencial das comandas, execute também `numeracao-comandas.sql` depois; ele adiciona e preenche os números dos pedidos existentes e cria o contador por loja. Os arquivos SQL marcados como LEGADO são apenas referência histórica e não devem ser executados isoladamente.

### Variáveis do Render
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ORS_API_KEY` (necessária para otimização ORS; sem ela o sistema ainda geocodifica e preserva a ordem original)

## Integracao oficial com WhatsApp Business

A caixa **Conversas** aceita uma conta WhatsApp Business por loja, conectada pelo fluxo oficial **Embedded Signup v4** da Meta. Cada comerciante autoriza os próprios ativos; o PedeIA não pede nem envia tokens pelo navegador.

### Preparacao do Meta for Developers

1. Crie/configure o app da Meta com WhatsApp Cloud API e Facebook Login for Business.
2. Crie uma configuracao de Embedded Signup v4 com o produto Cloud API e copie o App ID e o ID da configuracao.
3. Configure a URL HTTPS `https://SEU-DOMINIO/api/whatsapp/webhook`, o token de verificacao abaixo e assine o campo `messages` da conta WhatsApp Business.
4. Conclua as permissoes e revisao de app/acesso avancado exigidas pela Meta para os comerciantes que serao conectados.
5. Execute `whatsapp-integracao.sql` no SQL Editor do Supabase depois do schema principal.
6. Cadastre as variaveis no Render e reinicie o servico:

```text
WHATSAPP_META_APP_ID=ID_DO_APP_META
WHATSAPP_META_APP_SECRET=SEGREDO_DO_APP_META
WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=ID_DA_CONFIGURACAO_V4
WHATSAPP_WEBHOOK_VERIFY_TOKEN=SEGREDO_FORTE_GERADO_POR_VOCE
WHATSAPP_TOKEN_ENCRYPTION_KEY=64_CARACTERES_HEXADECIMAIS
WHATSAPP_GRAPH_API_VERSION=v25.0
```

Gere `WHATSAPP_TOKEN_ENCRYPTION_KEY` com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guarde a chave em um gerenciador de segredos e mantenha-a estavel: ela criptografa os tokens salvos no banco e perde-la impede o servidor de usar/desconectar as contas existentes. Nunca coloque estes valores em `index.html`, `app.js`, no SQL ou no chat.

O webhook valida a assinatura HMAC enviada pela Meta. Mensagens recebidas e enviadas sao vinculadas a loja; tokens sao armazenados criptografados com AES-256-GCM. O sistema permite resposta de texto apenas dentro da janela de atendimento de 24 horas. Fora dela, a Meta exige um modelo aprovado; o envio de modelos e anexos de midia ainda nao faz parte desta entrega.

**A ativacao nao e automatica ao publicar o codigo:** depende de configurar e aprovar o app no Meta for Developers, executar a migracao, configurar as variaveis e registrar o webhook. Consulte a [documentacao Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview), a [versao 4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4) e a [referencia de webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages).

## Privacidade e exclusao de dados

Paginas publicas para cadastrar na Meta:

- Politica de Privacidade: `https://SEU-DOMINIO/privacidade`
- Termos de Servico: `https://SEU-DOMINIO/termos`
- Instrucoes de exclusao: `https://SEU-DOMINIO/exclusao-de-dados`

Para ativar o fluxo e a rotina automatica:

1. Execute `privacidade-exclusao.sql` no SQL Editor do Supabase, depois do schema principal.
2. No Render, configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. A chave de service role deve ficar somente no servidor e nunca ser publicada no frontend.
3. Publique o servidor e teste as tres URLs publicas.
4. O comerciante abre a aba **Suporte** e envia o pedido de encerramento. Um administrador precisa confirmar explicitamente no painel.
5. A confirmacao suspende a loja e inicia o prazo de 30 dias. O servidor verifica a fila a cada 15 minutos e tenta novamente automaticamente se ocorrer uma falha.

A rotina apaga anexos da Central de Atendimento, mensagens de suporte e de pedidos, dados de conexao/conversas do WhatsApp e anonimiza dados pessoais conhecidos nos pedidos, clientes e entregadores. Totais e demais dados de negocio de pedidos sao mantidos para eventual obrigacao legal. A exclusao da conta de autenticacao e concluida pela API administrativa do Supabase; falhas ficam registradas na fila e sao tentadas novamente. A expiracao da assinatura, sozinha, nunca abre uma solicitacao nem inicia o prazo.

As paginas legais sao textos iniciais e devem ser revisadas por profissional juridico antes de serem usadas como documentos definitivos.
