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

Execute **somente `SUPABASE-CONSOLIDADO-FINAL.sql`** no Supabase. Os arquivos SQL marcados como LEGADO são apenas referência histórica e não devem ser executados isoladamente.

### Variáveis do Render
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ORS_API_KEY` (necessária para otimização ORS; sem ela o sistema ainda geocodifica e preserva a ordem original)
