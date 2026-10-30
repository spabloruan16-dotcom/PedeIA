BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL UNIQUE REFERENCES public.lojas(id) ON DELETE CASCADE,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL UNIQUE,
  display_phone_number text,
  access_token_ciphertext text NOT NULL,
  access_token_iv text NOT NULL,
  access_token_tag text NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  customer_wa_id text NOT NULL,
  customer_name text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_customer_message_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loja_id, customer_wa_id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  provider_message_id text UNIQUE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text NOT NULL DEFAULT 'text',
  content text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_shop_recent_idx
  ON public.whatsapp_conversations (loja_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_recent_idx
  ON public.whatsapp_messages (conversation_id, created_at);

COMMIT;
