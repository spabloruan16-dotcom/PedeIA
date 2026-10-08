# PedeIA — LISTA MESTRA DE TODAS AS ALTERAÇÕES SOLICITADAS

Este arquivo foi criado para não perder nenhuma solicitação feita durante as várias versões do projeto. Ele separa o que já existe no pacote-base do que ainda precisa ser implementado de verdade.

## 1. Acesso, autenticação e assinatura
- Supabase Auth como autenticação principal.
- Somente contas autenticadas e com assinatura ativa podem entrar no painel.
- Assinatura `ativa` libera acesso.
- `pendente`, `suspensa`, cancelada ou expirada bloqueia o painel imediatamente após login.
- Tela de assinatura bloqueada deve aparecer já no login, e não somente ao clicar em “Ver minha loja”.
- A mesma proteção deve continuar valendo quando o sistema for transformado em aplicativo instalável.
- Separação completa entre administrador e comerciante.
- Conta administrativa autenticada pelo Supabase deve abrir somente o painel administrativo.
- Conta de comerciante deve abrir somente o fluxo de comerciante.

## 2. Painel administrativo
- Lista de comerciantes e status da assinatura.
- Ativar assinatura por período.
- Suspender assinatura.
- Marcar como pendente.
- Visualizar vencimento.
- Enviar mensagem individual para comerciante.
- Central de suporte administrativo.
- Alterar status do chamado: novo, em andamento, resolvido.
- Excluir chamado.
- Configurar nome e telefone/WhatsApp do administrador.
- Botão “Falar com o administrador” deve usar esse número automaticamente.
- Possibilidade de enviar cobrança/mensagem individual.
- Suporte a QR Code, imagem e PDF em conversas de cobrança/suporte.

## 3. Histórico de pedidos
- Histórico independente da lista de pedidos ativos.
- Não depender de cache/lista limitada de pedidos.
- Filtros: Hoje, 7 dias, 30 dias, 90 dias, 1 ano e Todos.
- Filtro Delivery.
- Filtro Retirada.
- Busca por cliente ou número do pedido.
- Separar contagem de pedidos ativos e históricos.
- Mostrar pedidos concluídos/entregues/cancelados no histórico.

## 4. Conversas cliente x loja
- Mostrar somente conversas de pedidos ativos.
- Pedidos entregues/finalizados/cancelados não podem continuar acessíveis pelo chat.
- Conversas inicialmente fechadas/compactas.
- Abrir somente ao clicar.
- Mostrar nome, pedido, modalidade, status, prévia e quantidade de mensagens.
- Filtro Delivery/Retirada.
- Atualização automática das conversas.
- Cliente deve conseguir enviar mensagem.
- Comerciante deve conseguir responder.
- Bloqueio no backend para impedir mensagens em pedidos encerrados.

## 5. Atualização automática
- Atualização automática depois que o comerciante estiver autenticado.
- Não iniciar polling antes do login.
- Parar polling no logout.
- Atualizar novos pedidos, mudanças de status, mensagens e contadores.
- Evitar destruir texto que o usuário esteja digitando.
- Atualização automática também para os fluxos de entrega quando aplicável.

## 6. Foto/avatar da loja e interface
- Foto da loja deve permanecer dentro do quadrado, sem ultrapassar limites.
- Fallback quando não houver foto.
- Melhorias visuais de avatar, campos e botões.
- Revisão de responsividade das telas.
- Não reintroduzir os erros de carregamento do Supabase nem os erros visuais já corrigidos.

## 7. Entregadores
- Cadastro de motoboy/entregador.
- Remover o botão “Atribuir pedido” da ficha principal do entregador.
- Botão “Localizar entregador”.
- Nova entrada de navegação para localização imediatamente abaixo de Entregadores.
- Tela com mapa mostrando entregadores ativos.
- Marcadores com cores diferentes por entregador.
- Lista lateral com nome, telefone e quantidade de pedidos ativos.
- Atualização automática da localização.
- Link individual persistente por entregador.
- Botão “Copiar link do entregador”.
- Link continua válido enquanto o entregador estiver ativo.
- Desativar entregador bloqueia o link.
- Reativar devolve o acesso.
- Possibilidade de renovar/regenerar o link quando necessário.
- Histórico de entregas.
- Não exigir novo cadastro diário.
- Entregador deve visualizar pedidos disponíveis/atribuídos.
- Entregador deve aceitar pedido.
- Entregador deve alterar status para “Saiu para entrega” e “Entregue”.
- Status do entregador deve sincronizar com o painel da loja.
- Registrar GPS do entregador.

## 8. Mapas e rotas
- Preferência por OpenStreetMap + openrouteservice em vez de depender de Google Maps Platform.
- Corrigir permissão/GPS no celular e desktop.
- GPS deve informar claramente HTTPS, permissão, sinal e erro.
- Rastrear posição do entregador.
- Cliente deve conseguir acompanhar pedido e localização do entregador quando disponível.
- Preparar rota inteligente/otimizada por proximidade.
- Resolver configuração da `ORS_API_KEY` no servidor/Render.
- Endereço do cliente separado em rua, número, bairro, cidade e ponto de referência.

## 9. Endereço/checkout
- Campos separados para rua, número, bairro, cidade e ponto de referência.
- Sugestão/seleção de bairros quando aplicável.
- Validação de bairro atendido pela loja.
- Taxa por bairro quando cadastrada.
- Dados adequados para mapas/roteamento.

## 10. Produtos, categorias e adicionais
- Cadastro de categorias.
- Produto pode ter opções configuráveis.
- Botão para adicionar adicional.
- Cada adicional deve ter nome.
- Cada adicional deve ter quantidade máxima que o cliente pode escolher.
- Cada adicional deve ter preço unitário.
- Exemplo: preço R$2,00 e máximo 3; escolhendo 3 acrescenta R$6,00.
- Adicionais opcionais: cliente pode comprar sem selecionar.
- Vários adicionais no mesmo produto.
- Opções para sabores, bordas e extras quando aplicável.
- Limites de seleção devem ser respeitados no checkout.
- Preço final deve considerar corretamente os adicionais.
- Snapshot das opções escolhidas deve permanecer no pedido.

## 11. Vitrine do cliente
- Vitrine pública não deve mostrar tela de configuração/acesso destinada ao comerciante.
- Vitrine moderna e dinâmica, estilo aplicativos de pedidos.
- Banner/capa.
- Cor/tema configurável.
- Produtos em destaque.
- Categorias de navegação rápida.
- Busca.
- Etiquetas como novidades, promoções e mais vendidos.
- Layout responsivo para celular, tablet e desktop.
- Separar “Personalizar Vitrine” de “Promoções”.
- Campo de personalização da vitrine persistido no banco.

## 12. Promoções
- Nova aba “Promoções”, separada da personalização visual.
- Criar promoção/oferta.
- Promoção por produto.
- Promoção por tamanho/variação.
- Promoção por categoria.
- Promoção para toda a loja.
- Promoção envolvendo vários produtos/categorias.
- Desconto percentual.
- Desconto em valor fixo.
- Preço promocional.
- Compre X e pague Y.
- Oferta relâmpago com início/fim.
- Limite de estoque/unidades.
- Limite por cliente.
- Promoções agendadas.
- Pausar/reativar promoção.
- Estados: ativa, agendada, encerrada, pausada.
- Aplicar automaticamente no carrinho.
- Exibir preço original, desconto e preço final de forma clara.
- Impedir combinações incompatíveis de promoções.
- Relatório de desempenho de promoções.

## 13. Relatórios
- Nova aba “Relatórios”.
- Gráficos de colunas.
- Filtros: hoje, ontem, 7 dias, 30 dias, 90 dias, mês atual, mês anterior, ano e período personalizado.
- Filtro Delivery/Retirada.
- Filtro por status.
- Filtro por categoria.
- Filtro por produto.
- Filtro por forma de pagamento.
- Filtro por entregador.
- Filtro por promoção.
- Faturamento.
- Quantidade de pedidos.
- Ticket médio.
- Unidades vendidas.
- Cancelamentos.
- Descontos.
- Taxas de entrega.
- Lucro quando houver custo cadastrado.
- Comparação com período anterior.
- Faturamento por período.
- Pedidos por período.
- Delivery x Retirada.
- Status dos pedidos.
- Produtos mais vendidos.
- Produtos que mais faturam.
- Categorias com melhor desempenho.
- Formas de pagamento.
- Horários de pico.
- Métricas de entrega.
- Desempenho de promoções.
- Preparar exportação futura para PDF/Excel.

## 14. Suporte comerciante x administrador
- Contador de conversas não lidas.
- Botão “Iniciar conversa”/“Chamar suporte”.
- Ao clicar, abrir escolha do tipo de atendimento.
- Tipos: técnico, cobrança/mensalidade e outros.
- Assunto e mensagem.
- Campos não devem aparecer todos abertos sem necessidade.
- Conversas organizadas por assunto/tipo/status/data.
- Indicador de nova mensagem.
- Envio de texto.
- Envio de JPG/JPEG/PNG/WEBP.
- Envio de PDF.
- Visualização de imagem com possibilidade de zoom.
- PDF deve abrir corretamente.
- Destacar mensagem.
- Fixar/pinar mensagem.
- Excluir mensagem quando permitido.
- Administrador pode responder e alterar status do chamado.
- Comerciante pode responder e enviar comprovante de pagamento.

## 15. Impressoras
- Excluir equipamento cadastrado.
- Adicionar impressora.
- Testar conexão.
- Imprimir teste.
- Suporte a cabo/USB quando o navegador permitir.
- Suporte a Bluetooth BLE quando o navegador/dispositivo permitir.
- Rede/IP.
- Fallback de impressão do navegador/PDF.
- Configurar quantidade de vias.
- Imprimir automaticamente ao aceitar pedido.
- Evitar afirmar que Bluetooth foi enviado quando não houve conexão real.
- Mostrar claramente limitações de Bluetooth Classic/SPP dos navegadores.

## 16. Assinatura e WhatsApp
- Administrador configura nome e número.
- Ao usuário bloqueado clicar em “Falar com administrador”, abrir WhatsApp.
- Número deve vir do painel administrativo.
- Mensagem inicial pode informar que a assinatura está pendente/suspensa/expirada.

## 17. Tutorial/robô
- Robô tutorial aparece ao entrar em cada tela.
- Tutorial explica a tela de forma interativa.
- Avançar pelos passos.
- Pular.
- Depois de concluído/pulado, não abrir automaticamente novamente naquela tela.
- Ícone flutuante permite reabrir quando quiser.
- Ícone pode ser ocultado quando atrapalhar.
- Ao entrar novamente no site, robô volta a ficar disponível.
- Robô arrastável por toda a tela.
- Não deve bloquear ou deslocar o conteúdo.

## 18. Live/social commerce — solicitações feitas no projeto
- Corrigir ausência de áudio no live para o cliente.
- Corrigir movimentação da página de fundo ao mexer no player/miniplayer.
- Permitir player pequeno/miniplayer para continuar navegando.
- Corrigir responsividade das telas de live/social.
- Compartilhamento de tela pelo dispositivo.
- Chat entre vendedor e cliente.
- Solicitação para cliente entrar na live.
- Curtidas, comentários e compartilhamento.
- Feed de lives/posts com comportamento semelhante a redes sociais.
- Filtro/busca por loja para lives/posts.
- Estudar integração/simultaneidade com Instagram/Facebook/YouTube.
- Melhorar experiência para desktop e celular.
- Transformar em aplicativo instalável como etapa posterior, preservando permissões de câmera, microfone, localização e compartilhamento de tela quando o ambiente suportar.

## 19. Problemas técnicos que também foram relatados e devem permanecer corrigidos
- Erro de inicialização/carregamento do Supabase.
- Erro de parâmetro/status em atualização de pedidos.
- Erro de tipos inconsistentes em parâmetro SQL.
- Erro ao alterar status do entregador.
- Status “Entregue” do entregador não atualizando no painel da loja.
- Pedidos que só apareciam depois de Ctrl+R.
- GPS sem prompt/permissão efetiva.
- `ORS_API_KEY` ausente no Render.
- `produtos.opcoes` ausente no banco em versões anteriores.
- `lojas.personalizacao_vitrine` ausente em versão anterior.
- Tela de vitrine bloqueando cliente indevidamente.
- Fluxo de configuração de nova loja em loop em versões anteriores.
- Login administrativo sendo enviado para fluxo de comerciante em versões anteriores.
- Contador de pedidos contando histórico como ativo.
- Histórico sem pedidos antigos.
- Anexos do suporte enviados mas não aparecendo.

## Auditoria desta versão
O ZIP-base mais recente contém implementações reais de várias partes: histórico com filtros, conversas de pedidos ativos, atualização automática de pedidos/chat, central de entregadores, link persistente, suporte com anexos, impressoras, adicionais de produtos, personalização da vitrine, rastreamento, tutorial e contato WhatsApp.

Ainda NÃO está correto afirmar que todos os itens desta lista estão implementados. Em especial, a versão-base ainda registra como pendentes a rota inteligente ORS e vários recursos avançados de Promoções/Relatórios/Localização administrativa. Este documento existe justamente para impedir que uma nova versão seja entregue dizendo “tudo pronto” quando ainda houver itens faltando.
