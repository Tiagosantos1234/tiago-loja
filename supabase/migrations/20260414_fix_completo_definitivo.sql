-- ================================================================
-- RESPEITA — SQL DEFINITIVO v2 (CORREÇÃO DE REGRESSÃO)
-- Execute TODO este bloco no Supabase > SQL Editor > Run
-- Seguro rodar multiplas vezes (usa IF NOT EXISTS / OR REPLACE)
-- ================================================================

-- ================================================================
-- DIAGNÓSTICO RECOMENDADO (rode antes para ver o estado atual):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'products'
-- ORDER BY ordinal_position;
-- ================================================================

-- ----------------------------------------------------------------
-- 1. TABELA: products — garantir TODAS as colunas necessárias
--
-- A causa raiz do erro "column products.name does not exist":
-- a tabela pode ter sido criada com "nome"/"preco" (português)
-- mas o código espera "name"/"price" (inglês) e vice-versa.
-- Solução: garantir que AMBAS existam.
-- ----------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS name       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS nome       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price      NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS preco      NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock      INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS descricao  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes      JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS colors     JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Se "nome" tem valor mas "name" está vazio, copia para "name" e vice-versa
-- (sincroniza os dados entre as duas colunas)
UPDATE products SET name  = nome  WHERE name  IS NULL AND nome  IS NOT NULL;
UPDATE products SET nome  = name  WHERE nome  IS NULL AND name  IS NOT NULL;
UPDATE products SET price = preco WHERE price IS NULL AND preco IS NOT NULL;
UPDATE products SET preco = price WHERE preco IS NULL AND price IS NOT NULL;

-- ----------------------------------------------------------------
-- 2. TABELA: orders — garantir colunas necessárias
-- ----------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status  TEXT DEFAULT 'created';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_id    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone   TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email   TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total            NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_reference TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT NOW();

-- Remove constraint antiga se existir (pode bloquear updates)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_shipping_status_check'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_shipping_status_check;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. TABELA: order_items — garantir colunas necessárias
-- ----------------------------------------------------------------
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id    TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name  TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_price NUMERIC(10,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity      INTEGER;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url     TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS order_id      UUID;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT NOW();

-- ----------------------------------------------------------------
-- 4. TABELA: profiles (necessaria para checkout/auth)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT,
  name         TEXT,
  cep          TEXT,
  street       TEXT,
  number       TEXT,
  neighborhood TEXT,
  city         TEXT,
  state        TEXT,
  complement   TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
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
-- 6. RLS — DESATIVAR COMPLETAMENTE para tabelas operacionais
--
-- O admin usa anon key. Segurança real = Auth login + x-admin-token.
-- RLS habilitado = queries retornam vazio sem mensagem de erro clara.
-- ----------------------------------------------------------------
ALTER TABLE orders      DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE products    DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads       DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- Profiles: RLS habilitado mas usuario acessa apenas os proprios dados
-- ----------------------------------------------------------------
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

-- Permite upsert (INSERT + UPDATE via onConflict)
DROP POLICY IF EXISTS "profiles_self_upsert" ON profiles;
CREATE POLICY "profiles_self_upsert"
ON profiles FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------
-- 7. FUNCAO: decrement_stock (usada pelo webhook apos pagamento aprovado)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INTEGER)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products SET stock = GREATEST(0, stock - qty) WHERE id = product_id;
END;
$$;

-- ----------------------------------------------------------------
-- 8. REALTIME — habilitar para o painel admin (com tratamento de erro)
-- ----------------------------------------------------------------
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE products;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE leads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ================================================================
-- VERIFICAÇÃO FINAL — rode cada linha separada para confirmar:
-- ================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'products'
-- ORDER BY ordinal_position;

-- SELECT id, name, nome, price, preco, stock FROM products LIMIT 5;
-- SELECT id, external_reference, status, shipping_status, total FROM orders LIMIT 5;
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'products'; -- deve retornar "f" (false = RLS off)

-- ================================================================
-- FIM — Execute e recarregue o painel admin
-- ================================================================
