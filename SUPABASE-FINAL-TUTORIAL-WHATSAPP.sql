-- PedeIA - alterações finais desta versão
-- Execute este arquivo no Supabase SQL Editor.

-- 1) Link persistente do entregador.
-- O sistema já usava token_hash; token_value permite recuperar o mesmo link
-- para o botão "Copiar link" sem precisar cadastrar o entregador novamente.
ALTER TABLE public.entregadores
  ADD COLUMN IF NOT EXISTS token_value TEXT;

-- Preenche apenas os novos cadastros. Não inventamos tokens para cadastros antigos.
-- Se um entregador antigo não tiver token_value, ao clicar em "Copiar link"
-- o servidor gera um novo token e passa a armazená-lo.

-- 2) Contato de WhatsApp do administrador.
CREATE TABLE IF NOT EXISTS public.pedeia_admin_contact (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  name VARCHAR(100) NOT NULL DEFAULT '',
  phone VARCHAR(30) NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pedeia_admin_contact_singleton CHECK (id = 1)
);

INSERT INTO public.pedeia_admin_contact (id, name, phone)
VALUES (1, '', '')
ON CONFLICT (id) DO NOTHING;

-- 3) Garante que o campo de atualização automática possa ser usado sem
-- depender de um valor manual de created_at/updated_at.
CREATE INDEX IF NOT EXISTS idx_pedeia_admin_contact_updated
  ON public.pedeia_admin_contact (updated_at DESC);

-- Observação:
-- O painel administrativo grava o nome e o número nesta tabela.
-- O botão "Falar com o administrador" usa esse número para abrir:
-- https://wa.me/<numero>?text=...
-- Informe o número com DDD e, de preferência, com código do país.
-- Exemplo Brasil: 5581999999999
