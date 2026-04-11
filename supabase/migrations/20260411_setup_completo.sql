-- ================================================================
-- RESPEITA — Script SQL Completo para o Supabase
-- Executar no Supabase Dashboard > SQL Editor
-- É SEGURO rodar múltiplas vezes (usa IF NOT EXISTS / OR REPLACE)
-- ================================================================

-- ----------------------------------------------------------------
-- 1. TABELA: orders — garantir colunas necessárias
-- ----------------------------------------------------------------

-- Coluna shipping_status (status de envio do pedido)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'created';

-- Constraint de valores válidos (adiciona apenas se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_shipping_status_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_shipping_status_check
      CHECK (shipping_status IN ('created', 'preparing', 'shipped', 'delivered'));
  END IF;
END $$;

-- Coluna mp_payment_id (ID do pagamento no Mercado Pago)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;

-- Coluna shipping_address (JSON com endereço de entrega)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_address JSONB;

-- ----------------------------------------------------------------
-- 2. TABELA: order_items — garantir colunas necessárias
-- ----------------------------------------------------------------
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS product_price NUMERIC(10,2);

-- ----------------------------------------------------------------
-- 3. TABELA: leads
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  source     TEXT DEFAULT 'newsletter',  -- 'newsletter' | 'checkout'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 4. TABELA: products — garantir colunas
-- ----------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ----------------------------------------------------------------
-- 5. FUNÇÃO: decrement_stock (necessária para o webhook)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INTEGER)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE products
  SET stock = GREATEST(0, stock - qty)
  WHERE id = product_id;
END;
$$;

-- ----------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------

-- ORDERS: habilitar RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policy: leitura pública (para o webhook e checkout conseguirem ler)
DROP POLICY IF EXISTS "orders_select_anon" ON orders;
CREATE POLICY "orders_select_anon"
ON orders FOR SELECT
USING (true);

-- Policy: inserção pública (checkout cria pedidos)
DROP POLICY IF EXISTS "orders_insert_anon" ON orders;
CREATE POLICY "orders_insert_anon"
ON orders FOR INSERT
WITH CHECK (true);

-- Policy: update público (webhook + admin atualizam status)
DROP POLICY IF EXISTS "orders_update_anon" ON orders;
CREATE POLICY "orders_update_anon"
ON orders FOR UPDATE
USING (true)
WITH CHECK (true);

-- ORDER_ITEMS: habilitar RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select_anon" ON order_items;
CREATE POLICY "order_items_select_anon"
ON order_items FOR SELECT
USING (true);

DROP POLICY IF EXISTS "order_items_insert_anon" ON order_items;
CREATE POLICY "order_items_insert_anon"
ON order_items FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "order_items_delete_anon" ON order_items;
CREATE POLICY "order_items_delete_anon"
ON order_items FOR DELETE
USING (true);

-- LEADS: habilitar RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_anon" ON leads;
CREATE POLICY "leads_select_anon"
ON leads FOR SELECT
USING (true);

DROP POLICY IF EXISTS "leads_insert_anon" ON leads;
CREATE POLICY "leads_insert_anon"
ON leads FOR INSERT
WITH CHECK (true);

-- PRODUCTS: habilitar RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_anon" ON products;
CREATE POLICY "products_select_anon"
ON products FOR SELECT
USING (true);

DROP POLICY IF EXISTS "products_insert_anon" ON products;
CREATE POLICY "products_insert_anon"
ON products FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "products_update_anon" ON products;
CREATE POLICY "products_update_anon"
ON products FOR UPDATE
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "products_delete_anon" ON products;
CREATE POLICY "products_delete_anon"
ON products FOR DELETE
USING (true);

-- ----------------------------------------------------------------
-- 7. REALTIME — habilitar para as tabelas do admin
-- ----------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE leads;

-- ================================================================
-- FIM DO SCRIPT — Copie e cole tudo no SQL Editor do Supabase
-- ================================================================
