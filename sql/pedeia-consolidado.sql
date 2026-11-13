-- PedeIA: consolidacao de migracoes incrementais para o schema atual em portugues.
-- Requer as tabelas-base da aplicacao ja existentes no Supabase; nao e um schema vazio.
-- Fa?a backup e revise o plano antes de executar em producao.
-- O schema.sql antigo e os snapshots LEGADO foram arquivados e nao sao executaveis por este arquivo.
-- As secoes abaixo preservam a ordem de dependencias dos scripts ativos.


-- ===== Migracao de origem: recursos-avancados.sql =====

-- PedeIA: extensao incremental para vitrine, pedidos, estoque, financeiro e CRM.
-- Compatível com tabelas existentes em português. Não apaga dados nem tabelas.
BEGIN;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS opcoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS destaque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS etiqueta text,
  ADD COLUMN IF NOT EXISTS custo numeric(10,2),
  ADD COLUMN IF NOT EXISTS estoque_controlado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estoque_atual numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo numeric(12,3) NOT NULL DEFAULT 0;
ALTER TABLE public.itens_do_pedido
  ADD COLUMN IF NOT EXISTS personalizacoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS preco_total numeric(10,2);
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS taxa_entrega numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS codigo_cupom text,
  ADD COLUMN IF NOT EXISTS previsao_entrega timestamptz,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'vitrine';
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS cor_tema text,
  ADD COLUMN IF NOT EXISTS valor_minimo numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_entrega numeric(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.banners_promocionais (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
 titulo varchar(140) NOT NULL, descricao text, imagem_url text, link_url text,
 ativo boolean NOT NULL DEFAULT true, ordem smallint NOT NULL DEFAULT 0,
 inicia_em timestamptz, termina_em timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cupons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
 codigo varchar(40) NOT NULL, tipo varchar(20) NOT NULL CHECK(tipo IN ('percentual','valor','entrega_gratis')),
 valor numeric(10,2) NOT NULL DEFAULT 0 CHECK(valor >= 0), pedido_minimo numeric(10,2) NOT NULL DEFAULT 0,
 limite_usos integer, usos integer NOT NULL DEFAULT 0, ativo boolean NOT NULL DEFAULT true,
 inicia_em timestamptz, termina_em timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(loja_id,codigo)
);
CREATE TABLE IF NOT EXISTS public.enderecos_clientes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
 rotulo varchar(60) DEFAULT 'Casa', endereco text NOT NULL, complemento text, referencia text,
 principal boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ingredientes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
 nome varchar(140) NOT NULL, unidade varchar(20) NOT NULL DEFAULT 'un', quantidade numeric(12,3) NOT NULL DEFAULT 0,
 estoque_minimo numeric(12,3) NOT NULL DEFAULT 0, custo_unitario numeric(12,4) NOT NULL DEFAULT 0,
 ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(loja_id,nome)
);
CREATE TABLE IF NOT EXISTS public.fichas_tecnicas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
 ingrediente_id uuid NOT NULL REFERENCES public.ingredientes(id) ON DELETE CASCADE,
 quantidade numeric(12,3) NOT NULL CHECK(quantidade > 0), UNIQUE(produto_id,ingrediente_id)
);
CREATE TABLE IF NOT EXISTS public.movimentacoes_estoque (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
 ingrediente_id uuid REFERENCES public.ingredientes(id) ON DELETE SET NULL,
 produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
 tipo varchar(20) NOT NULL CHECK(tipo IN ('entrada','saida','desperdicio','ajuste')),
 quantidade numeric(12,3) NOT NULL CHECK(quantidade > 0), motivo text, pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.despesas_financeiras (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
 descricao varchar(180) NOT NULL, categoria varchar(80), valor numeric(12,2) NOT NULL CHECK(valor >= 0),
 vencimento date, pago_em timestamptz, status varchar(20) NOT NULL DEFAULT 'pendente', observacoes text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.fidelidade_config (
 loja_id uuid PRIMARY KEY REFERENCES public.lojas(id) ON DELETE CASCADE,
 ativo boolean NOT NULL DEFAULT false, pontos_por_real numeric(8,3) NOT NULL DEFAULT 1,
 valor_ponto numeric(10,4) NOT NULL DEFAULT 0.01, cashback_percentual numeric(5,2) NOT NULL DEFAULT 0,
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pontos_clientes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
 cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
 pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
 pontos integer NOT NULL, tipo varchar(20) NOT NULL CHECK(tipo IN ('credito','resgate','ajuste','expiracao')),
 descricao text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.campanhas_marketing (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
 nome varchar(140) NOT NULL, canal varchar(30) NOT NULL DEFAULT 'manual', segmento varchar(40) NOT NULL DEFAULT 'todos',
 mensagem text NOT NULL, status varchar(20) NOT NULL DEFAULT 'rascunho', agendada_para timestamptz,
 enviados integer NOT NULL DEFAULT 0, conversoes integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campanhas_marketing ALTER COLUMN canal SET DEFAULT 'manual';
CREATE TABLE IF NOT EXISTS public.consentimentos_marketing (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
 loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE, canal varchar(30) NOT NULL,
 autorizado boolean NOT NULL DEFAULT false, atualizado_em timestamptz NOT NULL DEFAULT now(), UNIQUE(cliente_id,loja_id,canal)
);
CREATE INDEX IF NOT EXISTS idx_pedidos_loja_status_data ON public.pedidos(loja_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_data ON public.pedidos(cliente_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_banners_loja_ativo_ordem ON public.banners_promocionais(loja_id,ativo,ordem);
CREATE INDEX IF NOT EXISTS idx_pontos_cliente_loja ON public.pontos_clientes(loja_id,cliente_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingredientes_loja ON public.ingredientes(loja_id,ativo);

-- Central de entregadores e acesso individual por link seguro.
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entregador_id uuid;
CREATE TABLE IF NOT EXISTS public.entregadores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
 nome varchar(120) NOT NULL, telefone varchar(40), veiculo varchar(80),
 token_hash text NOT NULL UNIQUE, ativo boolean NOT NULL DEFAULT true,
 ultima_latitude numeric(10,7), ultima_longitude numeric(10,7),
 localizacao_atualizada_em timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedidos_entregador_id_fkey') THEN
  ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_entregador_id_fkey FOREIGN KEY(entregador_id) REFERENCES public.entregadores(id) ON DELETE SET NULL;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_entregadores_loja_ativo ON public.entregadores(loja_id,ativo);
CREATE INDEX IF NOT EXISTS idx_pedidos_entregador_status ON public.pedidos(entregador_id,status,created_at);


COMMIT;

-- ===== Migracao de origem: SUPABASE-CONSOLIDADO-FINAL.sql =====

-- PedeIA - SQL consolidado incremental
-- Compatível com a tabela de contato administrativo existente:
-- id uuid, nome text, whatsapp text, ativo boolean, created_at, updated_at.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Contato administrativo: NÃO recria nem apaga a tabela existente.
CREATE TABLE IF NOT EXISTS public.pedeia_admin_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  whatsapp text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.pedeia_admin_contact (id, nome, whatsapp, ativo)
SELECT gen_random_uuid(), '', '', true
WHERE NOT EXISTS (SELECT 1 FROM public.pedeia_admin_contact);

-- Campos usados pelas funcionalidades desta versão, somente se ainda não existirem.
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS personalizacao_vitrine jsonb;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS opcoes jsonb;
ALTER TABLE public.mensagens_atendimento ADD COLUMN IF NOT EXISTS destacada boolean NOT NULL DEFAULT false;
ALTER TABLE public.mensagens_atendimento ADD COLUMN IF NOT EXISTS fixada boolean NOT NULL DEFAULT false;
ALTER TABLE public.mensagens_atendimento ADD COLUMN IF NOT EXISTS excluida boolean NOT NULL DEFAULT false;

-- Conversa entre o cliente e a loja vinculada ao pedido.
CREATE TABLE IF NOT EXISTS public.mensagens_pedidos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  remetente_tipo text NOT NULL CHECK (remetente_tipo IN ('cliente', 'comerciante')),
  conteudo text NOT NULL CHECK (char_length(conteudo) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensagens_pedidos_pedido_created_idx
  ON public.mensagens_pedidos (pedido_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pedeia_admin_contact_ativo_updated
  ON public.pedeia_admin_contact (ativo, updated_at DESC);

-- Não use INSERT com id=1: o id real é UUID.
-- Para cadastrar/alterar o contato, o próprio painel administrativo usa a linha existente.

-- PedeIA - módulo completo de promoções, relatórios e localização dos entregadores.
-- Incremental: não apaga dados existentes.
-- Estruturas de promoções (criadas somente se ainda não existirem).
CREATE TABLE IF NOT EXISTS public.promocoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  nome varchar(160) NOT NULL,
  descricao text,
  tipo varchar(40) NOT NULL CHECK (tipo IN ('percentual','valor_fixo','preco_promocional','compre_x_pague_y')),
  escopo varchar(30) NOT NULL CHECK (escopo IN ('produto','categoria','loja')),
  valor numeric(12,2) NOT NULL DEFAULT 0,
  quantidade_x integer,
  quantidade_y integer,
  inicio timestamptz NOT NULL DEFAULT now(),
  fim timestamptz,
  limite_total integer,
  limite_por_cliente integer,
  usos integer NOT NULL DEFAULT 0,
  ativa boolean NOT NULL DEFAULT true,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.promocoes_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promocao_id uuid NOT NULL REFERENCES public.promocoes(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  categoria_id uuid REFERENCES public.categorias(id) ON DELETE CASCADE
);

ALTER TABLE public.promocoes
  ADD COLUMN IF NOT EXISTS usos integer NOT NULL DEFAULT 0;

ALTER TABLE public.entregadores
  ADD COLUMN IF NOT EXISTS token_value text;

CREATE UNIQUE INDEX IF NOT EXISTS entregadores_token_value_key
  ON public.entregadores(token_value)
  WHERE token_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promocoes_loja_periodo_ativa
  ON public.promocoes(loja_id, ativa, inicio, fim);

CREATE INDEX IF NOT EXISTS idx_promocoes_itens_produto
  ON public.promocoes_itens(produto_id);

CREATE INDEX IF NOT EXISTS idx_promocoes_itens_categoria
  ON public.promocoes_itens(categoria_id);

CREATE INDEX IF NOT EXISTS idx_entregadores_loja_gps
  ON public.entregadores(loja_id, ativo, localizacao_atualizada_em DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_relatorios
  ON public.pedidos(loja_id, created_at DESC, status, tipo_entrega, pagamento);

-- Geocodificação de endereços e rotas ORS
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS latitude_entrega numeric(9,6);
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS longitude_entrega numeric(9,6);
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS latitude numeric(9,6);
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS longitude numeric(9,6);
CREATE INDEX IF NOT EXISTS idx_pedidos_entrega_coordenadas ON public.pedidos(loja_id, tipo_entrega, status, latitude_entrega, longitude_entrega);
CREATE INDEX IF NOT EXISTS idx_lojas_coordenadas ON public.lojas(latitude, longitude);

-- ===== Migracao de origem: entregadores.sql =====

-- Execute uma vez no Supabase SQL Editor para ativar a Central de Entregadores.
-- Incremental: não remove nem recria dados existentes.
BEGIN;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entregador_id uuid;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS public_token_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_public_token_hash ON public.pedidos(public_token_hash) WHERE public_token_hash IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.entregadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  nome varchar(120) NOT NULL,
  telefone varchar(40),
  veiculo varchar(80),
  token_hash text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  ultima_latitude numeric(10,7),
  ultima_longitude numeric(10,7),
  localizacao_atualizada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_entregador_id_fkey') THEN
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_entregador_id_fkey
      FOREIGN KEY (entregador_id) REFERENCES public.entregadores(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_entregadores_loja_ativo ON public.entregadores(loja_id, ativo);
CREATE INDEX IF NOT EXISTS idx_pedidos_entregador_status ON public.pedidos(entregador_id, status, created_at);
COMMIT;

-- ===== Migracao de origem: melhorias-endereco-bairros-historico.sql =====

-- Migração aditiva para endereços, bairros e histórico de entregas.
-- Não remove nem renomeia colunas existentes.
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS endereco_rua text,
  ADD COLUMN IF NOT EXISTS endereco_numero text,
  ADD COLUMN IF NOT EXISTS endereco_complemento text,
  ADD COLUMN IF NOT EXISTS endereco_bairro text,
  ADD COLUMN IF NOT EXISTS endereco_cidade text,
  ADD COLUMN IF NOT EXISTS endereco_estado text,
  ADD COLUMN IF NOT EXISTS endereco_cep text;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS endereco_partes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.bairros_atendimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  nome varchar(120) NOT NULL,
  taxa_entrega numeric(10,2) NOT NULL DEFAULT 0 CHECK (taxa_entrega >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loja_id, nome)
);
CREATE INDEX IF NOT EXISTS bairros_atendimento_loja_ativo_idx
  ON public.bairros_atendimento (loja_id, ativo, nome);

CREATE TABLE IF NOT EXISTS public.historico_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL UNIQUE REFERENCES public.pedidos(id) ON DELETE CASCADE,
  entregador_id uuid NOT NULL REFERENCES public.entregadores(id) ON DELETE RESTRICT,
  taxa_recebida numeric(10,2) NOT NULL DEFAULT 0 CHECK (taxa_recebida >= 0),
  concluida_em timestamptz NOT NULL DEFAULT now(),
  endereco text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS historico_entregas_entregador_data_idx
  ON public.historico_entregas (entregador_id, concluida_em DESC);
CREATE INDEX IF NOT EXISTS historico_entregas_loja_data_idx
  ON public.historico_entregas (loja_id, concluida_em DESC);

-- ===== Migracao de origem: historico-entregas.sql =====

-- Execute uma vez no Supabase SQL Editor antes de publicar a versão com histórico.
-- Mantém o registro mesmo se um pedido for removido, e impede excluir entregador com histórico.
CREATE TABLE IF NOT EXISTS public.historico_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL UNIQUE REFERENCES public.pedidos(id) ON DELETE CASCADE,
  entregador_id uuid NOT NULL REFERENCES public.entregadores(id) ON DELETE RESTRICT,
  taxa_recebida numeric(10,2) NOT NULL DEFAULT 0 CHECK (taxa_recebida >= 0),
  concluida_em timestamptz NOT NULL DEFAULT now(),
  endereco text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS historico_entregas_entregador_data_idx ON public.historico_entregas (entregador_id, concluida_em DESC);
CREATE INDEX IF NOT EXISTS historico_entregas_loja_data_idx ON public.historico_entregas (loja_id, concluida_em DESC);

-- ===== Migracao de origem: mensagens-pedidos.sql =====

CREATE TABLE IF NOT EXISTS public.mensagens_pedidos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  remetente_tipo text NOT NULL CHECK (remetente_tipo IN ('cliente', 'comerciante')),
  conteudo text NOT NULL CHECK (char_length(conteudo) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensagens_pedidos_pedido_created_idx
  ON public.mensagens_pedidos (pedido_id, created_at);

-- ===== Migracao de origem: numeracao-comandas.sql =====

BEGIN;

ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS comanda_reset_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS comanda_period_started_at timestamptz NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS comanda_next_number integer NOT NULL DEFAULT 1;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS numero_comanda integer;

WITH first_order AS (
  SELECT loja_id, MIN(created_at) AS started_at
  FROM public.pedidos
  GROUP BY loja_id
),
period_orders AS (
  SELECT p.id,
         FLOOR(EXTRACT(EPOCH FROM (p.created_at - f.started_at)) / (l.comanda_reset_days * 86400.0))::bigint AS period_index,
         ROW_NUMBER() OVER (
           PARTITION BY p.loja_id,
             FLOOR(EXTRACT(EPOCH FROM (p.created_at - f.started_at)) / (l.comanda_reset_days * 86400.0))::bigint
           ORDER BY p.created_at, p.id
         ) AS number
  FROM public.pedidos p
  JOIN first_order f ON f.loja_id = p.loja_id
  JOIN public.lojas l ON l.id = p.loja_id
)
UPDATE public.pedidos p
SET numero_comanda = period_orders.number
FROM period_orders
WHERE period_orders.id = p.id
  AND p.numero_comanda IS NULL;

WITH first_order AS (
  SELECT loja_id, MIN(created_at) AS started_at
  FROM public.pedidos
  GROUP BY loja_id
),
period_orders AS (
  SELECT p.loja_id, p.id, p.created_at, p.numero_comanda,
         FLOOR(EXTRACT(EPOCH FROM (p.created_at - f.started_at)) / (l.comanda_reset_days * 86400.0))::bigint AS period_index,
         f.started_at,
         l.comanda_reset_days
  FROM public.pedidos p
  JOIN first_order f ON f.loja_id = p.loja_id
  JOIN public.lojas l ON l.id = p.loja_id
),
latest_period AS (
  SELECT DISTINCT ON (loja_id)
         loja_id, period_index, started_at, comanda_reset_days
  FROM period_orders
  ORDER BY loja_id, created_at DESC, id DESC
),
next_values AS (
  SELECT l.id AS loja_id,
         COALESCE(
           lp.started_at + lp.period_index * lp.comanda_reset_days * INTERVAL '1 day',
           NOW()
         ) AS period_started_at,
         COALESCE(MAX(po.numero_comanda), 0) + 1 AS next_number
  FROM public.lojas l
  LEFT JOIN latest_period lp ON lp.loja_id = l.id
  LEFT JOIN period_orders po ON po.loja_id = l.id AND po.period_index = lp.period_index
  GROUP BY l.id, lp.started_at, lp.period_index, lp.comanda_reset_days
)
UPDATE public.lojas l
SET comanda_period_started_at = next_values.period_started_at,
    comanda_next_number = next_values.next_number
FROM next_values
WHERE next_values.loja_id = l.id;

COMMIT;

-- ===== Migracao de origem: personalizacao-vitrine.sql =====

-- PedeIA: personalizacao da vitrine, migração incremental e não destrutiva.
-- Execute no Supabase SQL Editor antes de publicar a versão correspondente.
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS personalizacao_vitrine jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ===== Migracao de origem: vitrine-opcoes.sql =====

-- Execute no Supabase SQL Editor antes de publicar a versão com personalização.
-- Armazena as regras e opções configuradas pelo comerciante para cada produto.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS opcoes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ===== Migracao de origem: privacidade-exclusao.sql =====

-- PedeIA: fluxo auditável de encerramento e exclusão/anonimização de dados.
-- Execute no Supabase SQL Editor depois do schema principal.

CREATE TABLE IF NOT EXISTS public.solicitacoes_exclusao_dados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comerciante_id uuid,
  status text NOT NULL DEFAULT 'solicitada'
    CHECK (status IN ('solicitada', 'aprovada', 'recusada', 'cancelada', 'processando', 'falhou', 'concluida')),
  motivo text,
  status_assinatura_anterior text,
  fim_assinatura_anterior timestamptz,
  solicitada_em timestamptz NOT NULL DEFAULT now(),
  confirmada_por uuid,
  confirmada_em timestamptz,
  executar_em timestamptz,
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_exclusao_abertas_comerciante_idx
  ON public.solicitacoes_exclusao_dados (comerciante_id)
  WHERE comerciante_id IS NOT NULL
    AND status IN ('solicitada', 'aprovada', 'processando', 'falhou');

CREATE INDEX IF NOT EXISTS solicitacoes_exclusao_pendentes_idx
  ON public.solicitacoes_exclusao_dados (executar_em)
  WHERE status IN ('aprovada', 'falhou');

ALTER TABLE public.solicitacoes_exclusao_dados
  ADD COLUMN IF NOT EXISTS status_assinatura_anterior text,
  ADD COLUMN IF NOT EXISTS fim_assinatura_anterior timestamptz;

REVOKE ALL ON public.solicitacoes_exclusao_dados FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_exclusao_dados TO service_role;

CREATE TABLE IF NOT EXISTS public.solicitacoes_exclusao_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_code text NOT NULL,
  confirmation_code_hash text NOT NULL UNIQUE,
  user_id_hash text NOT NULL,
  status text NOT NULL DEFAULT 'recebida'
    CHECK (status IN ('recebida', 'em_analise', 'concluida', 'sem_dados', 'recusada')),
  observacao_admin text,
  solicitada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  atualizada_por uuid
);

ALTER TABLE public.solicitacoes_exclusao_meta
  ADD COLUMN IF NOT EXISTS confirmation_code text;

UPDATE public.solicitacoes_exclusao_meta
SET confirmation_code=replace(gen_random_uuid()::text,'-','')
WHERE confirmation_code IS NULL;

ALTER TABLE public.solicitacoes_exclusao_meta
  ALTER COLUMN confirmation_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_exclusao_meta_confirmation_code_idx
  ON public.solicitacoes_exclusao_meta (confirmation_code);

CREATE INDEX IF NOT EXISTS solicitacoes_exclusao_meta_status_data_idx
  ON public.solicitacoes_exclusao_meta (status, solicitada_em);

REVOKE ALL ON public.solicitacoes_exclusao_meta FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_exclusao_meta TO service_role;

CREATE TABLE IF NOT EXISTS public.historico_solicitacoes_exclusao_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes_exclusao_meta(id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('recebida', 'em_analise', 'concluida', 'sem_dados', 'recusada')),
  observacao text,
  ator_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historico_solicitacoes_exclusao_meta_data_idx
  ON public.historico_solicitacoes_exclusao_meta (solicitacao_id, criado_em);

REVOKE ALL ON public.historico_solicitacoes_exclusao_meta FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_solicitacoes_exclusao_meta TO service_role;

-- ===== Migracao de origem: atendimento-storage.sql =====

-- PedeIA: bucket privado para anexos da Central de Atendimento.
-- Execute no Supabase > SQL Editor. Seguro para executar novamente.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'atendimento-arquivos',
  'atendimento-arquivos',
  false,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS "PedeIA atendimento anexos visualizar" ON storage.objects;
CREATE POLICY "PedeIA atendimento anexos visualizar"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'atendimento-arquivos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'admin'
    )
  )
);

DROP POLICY IF EXISTS "PedeIA atendimento anexos enviar" ON storage.objects;
CREATE POLICY "PedeIA atendimento anexos enviar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'atendimento-arquivos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'admin'
    )
  )
);
