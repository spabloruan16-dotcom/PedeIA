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
