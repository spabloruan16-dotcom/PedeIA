# Endereços, bairros e histórico — etapa de implementação

Esta versão adiciona ao checkout campos separados de rua, número, complemento, bairro, cidade, estado e referência. O servidor ainda grava o endereço legível em `pedidos.endereco` para manter a compatibilidade com painéis e telas de entregadores, e também grava o objeto em `pedidos.endereco_partes`.

## Banco

Execute `melhorias-endereco-bairros-historico.sql` no Supabase para os campos de endereço. Para habilitar as conversas entre clientes e a loja, execute também `mensagens-pedidos.sql`. Os scripts são aditivos e não usam o `schema.sql` antigo do projeto. Faça backup antes de qualquer migração em produção.

## Bairros de atendimento e taxas

Os bairros são cadastrados manualmente na configuração da loja, com taxa individual. O cadastro é salvo em `personalizacao_vitrine.serviceNeighborhoods` como objetos `{ nome, taxa }`, mantendo leitura compatível com registros antigos que contenham apenas nomes. No checkout, o cliente escolhe um dos bairros cadastrados e a taxa correspondente é calculada no servidor.

## Rastreamento para retirada

O endpoint `/api/order-track` também retorna o endereço formatado da loja a partir dos campos `endereco_*`. Na página `acompanhar.html`, pedidos do tipo `pickup` exibem o endereço da loja e um link de rota do Google Maps (`/maps/dir/?api=1&destination=...`). A seção de localização do entregador fica oculta para retirada. Se o endereço da loja não estiver preenchido, a página informa que o local precisa ser confirmado com o estabelecimento.

Esta função depende da migração de endereço da loja ter sido executada e dos dados de endereço da loja estarem preenchidos. Não foi possível testar contra o Supabase ou Render remoto neste ambiente.


O comerciante adiciona, edita e remove manualmente os bairros e suas taxas; o botão **Adicionar** salva o bairro imediatamente. A loja não consulta sugestões automáticas de bairros.

## Conversas dos pedidos

As mensagens do cliente e do comerciante são associadas ao pedido e compartilhadas entre os dispositivos. Antes de usar o chat, execute `mensagens-pedidos.sql` no Supabase para criar a tabela de mensagens. O link/token de acompanhamento do pedido autoriza o cliente a consultar e enviar mensagens; o painel do comerciante usa a sessão autenticada.
