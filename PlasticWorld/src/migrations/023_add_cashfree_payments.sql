-- Migration: 023_add_cashfree_payments.sql
-- Description: Add premium account fields and Cashfree payment tracking tables
-- Created: 2026-03-29

-- Premium fields on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS premium_tier VARCHAR(32) NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS premium_status VARCHAR(32) NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS premium_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS verified_badge_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_premium_tier ON users(premium_tier);
CREATE INDEX IF NOT EXISTS idx_users_premium_status ON users(premium_status);
CREATE INDEX IF NOT EXISTS idx_users_premium_expires_at ON users(premium_expires_at);

COMMENT ON COLUMN users.premium_tier IS 'Current monetization tier (free, plus, etc)';
COMMENT ON COLUMN users.premium_status IS 'Current premium status (inactive, active, expired, cancelled)';
COMMENT ON COLUMN users.premium_started_at IS 'When premium was first activated';
COMMENT ON COLUMN users.premium_expires_at IS 'When current premium entitlement expires';
COMMENT ON COLUMN users.verified_badge_enabled IS 'Whether verified badge is enabled for this user';

-- Cashfree order tracking
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(24) NOT NULL DEFAULT 'cashfree',
  order_id VARCHAR(100) NOT NULL UNIQUE,
  cf_order_id VARCHAR(120),
  payment_session_id TEXT,
  plan_code VARCHAR(64) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  order_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  payment_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  cf_payment_id VARCHAR(120),
  payment_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_order_status ON payment_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_payment_status ON payment_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_created_at ON payment_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_cf_payment_id ON payment_orders(cf_payment_id) WHERE cf_payment_id IS NOT NULL;

COMMENT ON TABLE payment_orders IS 'All payment orders created via Cashfree';
COMMENT ON COLUMN payment_orders.order_id IS 'Merchant order id sent to Cashfree';
COMMENT ON COLUMN payment_orders.cf_order_id IS 'Cashfree generated order id';
COMMENT ON COLUMN payment_orders.payment_session_id IS 'Session token used by frontend checkout';
COMMENT ON COLUMN payment_orders.metadata IS 'Any plan and request metadata associated with the payment';

-- Webhook idempotency + audit trail
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(24) NOT NULL DEFAULT 'cashfree',
  event_id VARCHAR(160),
  order_id VARCHAR(100),
  event_type VARCHAR(80),
  signature TEXT,
  payload_raw TEXT NOT NULL,
  payload JSONB,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'skipped',
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_webhook_events_provider_event
  ON payment_webhook_events(provider, event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order_id ON payment_webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_created_at ON payment_webhook_events(created_at DESC);

COMMENT ON TABLE payment_webhook_events IS 'Raw webhook payloads for auditability and idempotent processing';
COMMENT ON COLUMN payment_webhook_events.verification_status IS 'verified, failed, or skipped (no secret configured)';

-- Keep updated_at current on payment_orders
CREATE OR REPLACE FUNCTION update_payment_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trigger_update_payment_orders_updated_at'
  ) THEN
    CREATE TRIGGER trigger_update_payment_orders_updated_at
      BEFORE UPDATE ON payment_orders
      FOR EACH ROW
      EXECUTE FUNCTION update_payment_orders_updated_at();
  END IF;
END $$;
