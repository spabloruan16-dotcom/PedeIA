# Extensão avançada do PedeIA

As migracoes de recursos estao reunidas em `../sql/pedeia-consolidado.sql` e sao incrementais para a estrutura atual em portugues. Elas nao removem nem recriam tabelas nem apagam registros. Faca backup antes de executar em producao.

## Incluído na migração
- Campos-base de vitrine (banner, tema, destaque e etiquetas) e opções JSON de produto.
- Snapshot JSON das personalizações no item do pedido e campos para taxa, desconto, cupom e previsão.
- Tabelas para banners, cupons, endereços salvos, ingredientes, fichas técnicas, movimentações de estoque, despesas, fidelidade, pontos, campanhas e consentimento de marketing.
- Índices para consultas comuns de pedidos, estoque e pontos.

## Aplicação
1. Faça backup no Supabase.
2. Abra **SQL Editor** no projeto correto.
3. Revise e execute `../sql/pedeia-consolidado.sql`.
4. Confira o resultado e teste em ambiente de desenvolvimento antes de publicar.

## Importante
A migração prepara o modelo de dados; não habilita sozinha telas, automações, gateway de pagamento, envio de WhatsApp, baixa automática de ingredientes ou notificações. Esses fluxos exigem integração no frontend/backend, validação de autorização por loja, políticas RLS e credenciais de provedores. Não coloque `service_role` no navegador. O checkout existente também não deve ser anunciado como pagamento online integrado sem conectar e testar um gateway.

## Personalização visual da vitrine (versão atualizada)
- O painel Minha loja permite configurar imagem de capa, cor principal e um aviso de oferta com título, descrição e data final.
- O cadastro/edição de produto permite marcar itens em destaque e definir uma etiqueta curta.
- A vitrine pública exibe o banner, a cor, o aviso ativo e uma seção de produtos destacados.
- A coluna `lojas.personalizacao_vitrine` tambem esta incluida no script consolidado.
- O aviso de oferta é promocional/informativo: ainda não aplica desconto no preço nem limita unidades no checkout. Não anunciar redução de preço até implementar validação do desconto no servidor.
