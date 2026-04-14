-- ================================================================
-- RESPEITA — SQL DEFINITIVO CONSOLIDADO
-- Execute TODO este bloco no Supabase > SQL Editor > Run
-- E seguro rodar multiplas vezes (usa IF NOT EXISTS / OR REPLACE)
-- ================================================================

-- ----------------------------------------------------------------
-- 1. TABELA: orders
-- ----------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status  TEXT DEFAULT 'created';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_id    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone   TEXT;

-- ----------------------------------------------------------------
-- 2. TABELA: order_items
-- ----------------------------------------------------------------
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url     TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_price NUMERIC(10,2);

-- ----------------------------------------------------------------
-- 3. TABELA: products
-- ----------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock      INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ----------------------------------------------------------------
-- 4. TABELA: profiles (necessaria para checkout/auth)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  name        TEXT,
  cep         TEXT,
  street      TEXT,
  number      TEXT,
  neighborhood TEXT,
  city        TEXT,
  state       TEXT,
  complement  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 5. TABELA: leads
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  source     TEXT DEFAULT 'newsletter',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 6. RLS — DESATIVAR para tabelas operacionais
--
-- O painel admin usa anon key no browser.
-- A seguranca real vem do Supabase Auth (login obrigatorio) +
-- endpoint /api/admin-update-order que valida x-admin-token.
-- ----------------------------------------------------------------
ALTER TABLE orders      DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE products    DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads       DISABLE ROW LEVEL SECURITY;

-- Profiles: habilitar RLS mas permitir leitura/escrita do proprio usuario
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self_select" ON profiles;
CREATE POLICY "profiles_self_select"
ON profiles FOR SELECT
USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_self_insert" ON profiles;
CREATE POLICY "profiles_self_insert"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_self_update" ON profiles;
CREATE POLICY "profiles_self_update"
ON profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------
-- 7. FUNCAO: decrement_stock (usada pelo webhook apos pagamento)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INTEGER)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products SET stock = GREATEST(0, stock - qty) WHERE id = product_id;
END;
$$;

-- ----------------------------------------------------------------
-- 8. REALTIME — habilitar para o painel admin
-- ----------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE leads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ================================================================
-- VERIFICACAO FINAL — rode para confirmar que tudo esta correto
-- ================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT id, external_reference, status, shipping_status, total FROM orders LIMIT 5;
-- SELECT id, name, price, stock FROM products LIMIT 5;

-- ================================================================
-- FIM — Execute e recarregue o painel admin
-- ================================================================
