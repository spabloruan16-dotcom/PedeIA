-- PedeIA — migração mestre incremental das alterações solicitadas.
-- NÃO apaga dados. Execute no SQL Editor do Supabase.

-- Produto: opções/adicionais estruturados
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS opcoes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Vitrine personalizada
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS personalizacao_vitrine jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Entregadores: localização e link persistente
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS ultima_latitude numeric(10,7);
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS ultima_longitude numeric(10,7);
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS localizacao_atualizada_em timestamptz;
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS token_value text;
CREATE UNIQUE INDEX IF NOT EXISTS entregadores_token_value_key ON public.entregadores(token_value) WHERE token_value IS NOT NULL;

-- Contato único do administrador.
-- Compatível tanto com uma instalação nova quanto com a tabela criada pela versão anterior,
-- que pode ter usado os nomes nome/whatsapp em vez de name/phone.
CREATE TABLE IF NOT EXISTS public.pedeia_admin_contact (
  id smallint PRIMARY KEY DEFAULT 1,
  name varchar(100),
  phone varchar(30),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedeia_admin_contact_singleton CHECK (id = 1)
);

ALTER TABLE public.pedeia_admin_contact ADD COLUMN IF NOT EXISTS name varchar(100);
ALTER TABLE public.pedeia_admin_contact ADD COLUMN IF NOT EXISTS phone varchar(30);
ALTER TABLE public.pedeia_admin_contact ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO public.pedeia_admin_contact(id,name,phone)
VALUES (1,'','')
ON CONFLICT (id) DO NOTHING;

-- Progresso do tutorial por comerciante/tela.
CREATE TABLE IF NOT EXISTS public.pedeia_tutorial_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  screen_key text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  skipped boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_id,screen_key)
);
CREATE INDEX IF NOT EXISTS pedeia_tutorial_progress_merchant_idx ON public.pedeia_tutorial_progress(merchant_id);

-- Promoções: estrutura base para produto, categoria, loja, agendamento,
-- preço promocional, percentual, valor fixo e compra X/paga Y.
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
  ativa boolean NOT NULL DEFAULT true,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promocoes_loja_periodo_idx ON public.promocoes(loja_id,inicio,fim,ativa);

CREATE TABLE IF NOT EXISTS public.promocoes_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promocao_id uuid NOT NULL REFERENCES public.promocoes(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  categoria_id uuid REFERENCES public.categorias(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS promocoes_itens_promocao_idx ON public.promocoes_itens(promocao_id);

-- Mensagens de atendimento: metadados para destacar/fixar quando o servidor
-- já estiver preparado para esses campos.
ALTER TABLE public.mensagens_atendimento ADD COLUMN IF NOT EXISTS destacada boolean NOT NULL DEFAULT false;
ALTER TABLE public.mensagens_atendimento ADD COLUMN IF NOT EXISTS fixada boolean NOT NULL DEFAULT false;
ALTER TABLE public.mensagens_atendimento ADD COLUMN IF NOT EXISTS excluida boolean NOT NULL DEFAULT false;

-- Índices úteis para pedidos e relatórios.
CREATE INDEX IF NOT EXISTS pedidos_loja_created_idx ON public.pedidos(loja_id,created_at DESC);
CREATE INDEX IF NOT EXISTS pedidos_loja_status_idx ON public.pedidos(loja_id,status);

-- RLS do tutorial: adapte merchant_id se sua tabela comerciantes não usar auth.uid().
ALTER TABLE public.pedeia_tutorial_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pedeia_tutorial_progress_own" ON public.pedeia_tutorial_progress;
CREATE POLICY "pedeia_tutorial_progress_own"
ON public.pedeia_tutorial_progress FOR ALL TO authenticated
USING (merchant_id = auth.uid())
WITH CHECK (merchant_id = auth.uid());
