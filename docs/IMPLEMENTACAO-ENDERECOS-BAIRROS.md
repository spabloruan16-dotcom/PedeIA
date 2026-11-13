# Endereços, bairros e histórico — etapa de implementação

Esta versão adiciona ao checkout campos separados de rua, número, complemento, bairro, cidade, estado e referência. O servidor ainda grava o endereço legível em `pedidos.endereco` para manter a compatibilidade com painéis e telas de entregadores, e também grava o objeto em `pedidos.endereco_partes`.

## Banco

Os campos de endereco, bairros, historico e conversas estao incluidos em `../sql/pedeia-consolidado.sql`. O arquivo requer o schema atual da aplicacao e nao usa o antigo `../sql/archive/schema.sql`. Faca backup antes de aplicar em producao.

## Bairros de atendimento e taxas

Os bairros são cadastrados manualmente na configuração da loja, com taxa individual. O cadastro é salvo em `personalizacao_vitrine.serviceNeighborhoods` como objetos `{ nome, taxa }`, mantendo leitura compatível com registros antigos que contenham apenas nomes. No checkout, o cliente escolhe um dos bairros cadastrados e a taxa correspondente é calculada no servidor.

## Rastreamento para retirada

O endpoint `/api/order-track` tambem retorna o endereco formatado da loja a partir dos campos `endereco_*`. Na pagina `../pages/acompanhar.html`, pedidos do tipo `pickup` exibem o endereco da loja e um link de rota do Google Maps (`/maps/dir/?api=1&destination=...`). A secao de localizacao do entregador fica oculta para retirada. Se o endereco da loja nao estiver preenchido, a pagina informa que o local precisa ser confirmado com o estabelecimento.

Esta função depende da migração de endereço da loja ter sido executada e dos dados de endereço da loja estarem preenchidos. Não foi possível testar contra o Supabase ou Render remoto neste ambiente.


O comerciante adiciona, edita e remove manualmente os bairros e suas taxas; o botão **Adicionar** salva o bairro imediatamente. A loja não consulta sugestões automáticas de bairros.

## Conversas dos pedidos

As mensagens do cliente e do comerciante sao associadas ao pedido e compartilhadas entre os dispositivos. A tabela necessaria esta em `../sql/pedeia-consolidado.sql`. O link/token de acompanhamento do pedido autoriza o cliente a consultar e enviar mensagens; o painel do comerciante usa a sessao autenticada.
