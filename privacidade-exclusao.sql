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
