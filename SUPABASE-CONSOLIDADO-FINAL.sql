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
