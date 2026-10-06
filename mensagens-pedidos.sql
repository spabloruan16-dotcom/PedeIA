CREATE TABLE IF NOT EXISTS public.mensagens_pedidos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  remetente_tipo text NOT NULL CHECK (remetente_tipo IN ('cliente', 'comerciante')),
  conteudo text NOT NULL CHECK (char_length(conteudo) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensagens_pedidos_pedido_created_idx
  ON public.mensagens_pedidos (pedido_id, created_at);
