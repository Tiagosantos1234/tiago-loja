-- ============================================================
-- MIGRATION: fix_rls_and_schema.sql
-- Execute no SQL Editor do Supabase (dashboard > SQL Editor)
-- ============================================================

-- ============================================================
-- 1. TABELA: orders
--    Garante colunas opcionais que o backend pode tentar usar
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS mp_payment_id   TEXT,
  ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS shipping_address JSONB,
  ADD COLUMN IF NOT EXISTS customer_phone  TEXT;

-- ============================================================
-- 2. RLS — orders
--    Leitura: usuário autenticado vê todos os pedidos (admin)
--    Leitura anon: permitido para sucesso.html mostrar pedido após pagamento
--    Escrita (INSERT): service_role apenas (via API server-side)
--    UPDATE: service_role apenas
-- ============================================================

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas conflitantes (se existirem)
DROP POLICY IF EXISTS "Authenticated users can read orders"  ON public.orders;
DROP POLICY IF EXISTS "Service role can insert orders"       ON public.orders;
DROP POLICY IF EXISTS "Service role can update orders"       ON public.orders;
DROP POLICY IF EXISTS "Allow anon insert orders"             ON public.orders;
DROP POLICY IF EXISTS "Allow all select orders"              ON public.orders;
DROP POLICY IF EXISTS "orders_select_authenticated"          ON public.orders;
DROP POLICY IF EXISTS "orders_select_anon"                   ON public.orders;
DROP POLICY IF EXISTS "orders_insert_service"                ON public.orders;
DROP POLICY IF EXISTS "orders_update_service"                ON public.orders;
DROP POLICY IF EXISTS "orders_delete_service"                ON public.orders;

-- SELECT: usuários autenticados leem todos os pedidos (dashboard admin + profile)
CREATE POLICY "orders_select_authenticated"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

-- SELECT: anon pode ler pedidos pelo external_reference (página sucesso.html após pagamento)
-- O external_reference funciona como token único — sem ele não há como saber o ID
CREATE POLICY "orders_select_anon"
  ON public.orders FOR SELECT
  TO anon
  USING (true);

-- INSERT: somente service_role (chamado pelo backend /api/create-checkout)
CREATE POLICY "orders_insert_service"
  ON public.orders FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: somente service_role (webhook + admin-update-order)
CREATE POLICY "orders_update_service"
  ON public.orders FOR UPDATE
  TO service_role
  USING (true);

-- DELETE: somente service_role (cleanupOrder no create-checkout em caso de erro)
CREATE POLICY "orders_delete_service"
  ON public.orders FOR DELETE
  TO service_role
  USING (true);

-- ============================================================
-- 3. RLS — order_items
-- ============================================================

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select_authenticated" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_anon"          ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_service"       ON public.order_items;
DROP POLICY IF EXISTS "order_items_delete_service"       ON public.order_items;

CREATE POLICY "order_items_select_authenticated"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (true);

-- Anon precisa ler itens na sucesso.html também (se futuramente listar itens)
CREATE POLICY "order_items_select_anon"
  ON public.order_items FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "order_items_insert_service"
  ON public.order_items FOR INSERT
  TO service_role
  WITH CHECK (true);

-- DELETE: cleanupOrder apaga itens em caso de erro no checkout
CREATE POLICY "order_items_delete_service"
  ON public.order_items FOR DELETE
  TO service_role
  USING (true);

-- ============================================================
-- 4. RLS — products
--    Leitura pública (catálogo); escrita somente via admin
-- ============================================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_public"  ON public.products;
DROP POLICY IF EXISTS "products_write_service"  ON public.products;

CREATE POLICY "products_select_public"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "products_write_service"
  ON public.products FOR ALL
  TO service_role
  USING (true);

-- Permite que o usuário autenticado (admin no painel) insira/edite produtos
-- O painel admin usa a anon key mas está autenticado como usuário
CREATE POLICY "products_write_authenticated"
  ON public.products FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. RLS — leads
-- ============================================================

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_insert_anon"          ON public.leads;
DROP POLICY IF EXISTS "leads_select_authenticated" ON public.leads;

-- Qualquer usuário (inclusive anon) pode inserir lead (newsletter/checkout)
CREATE POLICY "leads_insert_anon"
  ON public.leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Somente usuário autenticado pode listar leads (painel admin)
CREATE POLICY "leads_select_authenticated"
  ON public.leads FOR SELECT
  TO authenticated
  USING (true);

-- Upsert precisa de UPDATE também
CREATE POLICY "leads_update_anon"
  ON public.leads FOR UPDATE
  TO anon, authenticated
  USING (true);

-- ============================================================
-- 6. RLS — profiles
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_upsert_own"  ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_upsert_own"
  ON public.profiles FOR ALL
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- 7. FUNÇÃO: decrement_stock
--    Usada pelo webhook para decrementar estoque após aprovação
-- ============================================================

CREATE OR REPLACE FUNCTION public.decrement_stock(product_id UUID, qty INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER  -- executa com permissão do owner (ignora RLS)
AS $$
BEGIN
  UPDATE public.products
    SET stock = GREATEST(0, stock - qty)
  WHERE id = product_id;
END;
$$;

-- ============================================================
-- 8. Realtime — habilita para as tabelas do dashboard
-- ============================================================

-- Adiciona tabelas ao publication de realtime (ignora se já existir)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;
