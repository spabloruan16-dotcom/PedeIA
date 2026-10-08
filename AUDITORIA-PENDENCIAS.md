# Auditoria da versão consolidada atualizada

## Implementado nesta rodada

- Relatórios do comerciante com filtros de período, delivery/retirada, status e pagamento.
- KPIs de faturamento, pedidos, ticket médio, unidades, cancelamentos e descontos.
- Ranking de produtos, pagamentos, faturamento diário e pedidos por horário.
- Central de Promoções com criação, ativação/pausa, exclusão e escopos loja/produto/categoria.
- Tipos de promoção: percentual, valor fixo, preço promocional e compre X/pague Y.
- Agendamento, limite total e limite por cliente.
- Aplicação automática da melhor promoção elegível no checkout público, sem empilhar descontos concorrentes.
- Registro do desconto no pedido e contagem de uso da promoção.
- Tela administrativa de localização dos entregadores com OpenStreetMap/Leaflet.
- Endpoint de localização dos entregadores ativos e marcadores individuais.
- Endpoint de otimização de rota via OpenRouteService quando `ORS_API_KEY` estiver configurada, com fallback para a ordem original.
- SQL incremental para índices/colunas necessários.
- Mantida a tabela de contato administrativo com `id UUID`, `nome`, `whatsapp` e `ativo`.

## Validações realizadas

- `node --check app.js`
- `node --check server.js`
- Revisão das rotas novas e dos nomes das colunas usados no SQL.

## Dependências de ambiente

- `DATABASE_URL` deve estar configurada no Render para as rotas de banco.
- `ORS_API_KEY` deve estar configurada no Render para otimização real pelo OpenRouteService.
- O SQL `SUPABASE-CONSOLIDADO-FINAL.sql` deve ser executado no Supabase antes de usar as novas tabelas/índices.
- O mapa usa Leaflet e tiles do OpenStreetMap no navegador.

## Limites conhecidos

- A otimização de rota exige coordenadas dos pontos. O endpoint recebe pontos geográficos; ele não transforma automaticamente endereços em coordenadas.
- A disponibilidade real de Bluetooth/USB depende das APIs e permissões do navegador/dispositivo.
- A validação final contra o banco/Render do usuário depende das credenciais e ambiente de execução do projeto.
