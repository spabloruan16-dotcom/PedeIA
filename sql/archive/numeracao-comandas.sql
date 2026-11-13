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
