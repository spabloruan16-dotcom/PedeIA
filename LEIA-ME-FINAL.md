# PedeIA — versão consolidada

Esta pasta é a raiz do projeto.

## Contato administrativo
A tabela existente usa `id` UUID, `nome`, `whatsapp` e `ativo`. O servidor desta versão foi ajustado para esse formato e não usa mais `id=1`, `name` ou `phone`.

## Banco
Execute `SUPABASE-CONSOLIDADO-FINAL.sql` no Supabase. O SQL é incremental e não apaga dados existentes.

## Execução
1. `npm install`
2. configure as variáveis de ambiente do Supabase/Render
3. `npm start`

## Bloco 1 — Endereço → coordenadas → rota
- Pedidos delivery passam a tentar geocodificar o endereço no servidor.
- Com `ORS_API_KEY`, a geocodificação prioriza OpenRouteService.
- Sem chave ORS, há fallback para Nominatim/OpenStreetMap com intervalo entre consultas.
- As coordenadas ficam salvas em `pedidos.latitude_entrega` e `pedidos.longitude_entrega`.
- A loja pode ter `latitude` e `longitude` salvas para servir como origem da rota.
- A Central de Entregadores ganhou **Otimizar rota dos pedidos**.
- A rota usa OpenRouteService Optimization quando `ORS_API_KEY` está configurada no Render.
- Se a chave não estiver configurada, os endereços continuam sendo geocodificados e a ordem original é preservada.
- A rota otimizada pode ser aberta no mapa.
