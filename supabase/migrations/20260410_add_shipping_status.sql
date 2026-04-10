-- Migration: adicionar coluna shipping_status na tabela orders
-- Executar no Supabase SQL Editor (Dashboard > SQL Editor)
-- É seguro rodar mesmo se a coluna já existir (IF NOT EXISTS)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_status TEXT
  DEFAULT 'created'
  CHECK (shipping_status IN ('created', 'preparing', 'shipped', 'delivered'));

-- Comentário: os valores possíveis são:
-- 'created'   = Pedido criado (padrão)
-- 'preparing' = Em preparação
-- 'shipped'   = Enviado
-- 'delivered' = Entregue
