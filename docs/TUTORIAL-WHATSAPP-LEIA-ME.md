# PedeIA — contato administrativo

## 1. Supabase

No SQL Editor do Supabase, a tabela de contato administrativo e criada pelo script principal:

`../sql/pedeia-consolidado.sql`

Ele cria/atualiza:

- `public.pedeia_admin_contact`: nome e WhatsApp usados no botão **Falar com o administrador**.
- `public.entregadores.token_value`: permite copiar novamente o link individual do entregador sem precisar cadastrar outro entregador.

## 2. Contato via WhatsApp do administrador

Entre no painel administrativo e preencha:

- Nome para atendimento
- Número com DDD, com ou sem formatacao. Tambem e aceito o codigo do pais.

Exemplo Brasil: `(81) 99999-9999` ou `+55 81 99999-9999`

Depois de salvar, quando uma assinatura estiver pendente, suspensa ou expirada, o botão **Falar com o administrador** abre o WhatsApp configurado. O sistema remove a pontuacao e acrescenta `55` aos numeros brasileiros que tenham apenas DDD e telefone. O envio e confirmado pelo usuario no WhatsApp.

Esse e o unico recurso WhatsApp do sistema. A conexao de contas de loja, caixa de entrada e envio de mensagens pela API nao estao disponiveis.

## 3. Tutorial do comerciante

O robô aparece automaticamente na primeira visita de cada tela. O comerciante pode:

- avançar pelos passos;
- pular o tutorial;
- abrir o tutorial novamente pelo robô;
- arrastar o robô pela tela;
- ocultar o robô pelo pequeno `×`.

O tutorial concluído/pulado fica marcado por tela e por comerciante. O robô volta a aparecer quando o site é aberto novamente.

## 4. Entregadores

O botão **Atribuir pedido** foi removido da ficha do entregador. Cada entregador ativo tem **Copiar link**. Para entregadores antigos que ainda não possuam um token recuperável, o primeiro clique gera um novo link e passa a mantê-lo para os próximos usos.

## 5. Observação sobre a base

As alterações desta versão foram aplicadas sobre o ZIP mais recente disponibilizado na conversa. O arquivo SQL deve ser executado uma vez no Supabase antes de usar os novos recursos que dependem dessas colunas/tabelas.
