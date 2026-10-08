# Bloco 2 — Integração e revisão geral

Nesta rodada foram integradas e revisadas as áreas que dependem entre si:

- Relatórios agora filtram por período, delivery/retirada, status, pagamento, categoria, produto e entregador.
- A tela de Promoções usa produtos e categorias reais da loja em vez de exigir IDs digitados manualmente.
- A promoção aplicada ao pedido fica registrada em `pedidos.codigo_cupom`, permitindo validar o limite por cliente corretamente.
- O contador de usos da promoção só é incrementado depois que o pedido é inserido dentro da mesma transação.
- O total do pedido é protegido para não ficar negativo.
- Central de entregadores, histórico e localização continuam vinculados à loja autenticada.
- Rotas ORS e geocodificação permanecem integradas ao pedido e à central de entregadores.

## Validação local

- `node --check app.js` — OK
- `node --check server.js` — OK
- Estrutura ZIP — validada

A validação contra um banco Supabase real ainda depende de executar o SQL no projeto do cliente e testar com dados reais.
