-- 0008_pro_web_features.sql — Pro web features + online-panel repositioning.
-- The product is a single online panel; installing the agent is optional and
-- only needed for automatic printing (Pro). Start prints via the browser.
-- Idempotent: safe to run multiple times, preserves ids/prices/contracts.

-- Feature flags per plan (same pattern as plans.auto_print).
ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "sla_queue" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "packing_check" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "print_history" BOOLEAN NOT NULL DEFAULT false;

-- Browser print history: labels printed via the browser (agent prints are
-- already tracked in print_queue). One row per shipment per print action.
CREATE TABLE IF NOT EXISTS "print_events" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "shipment_id" BIGINT NOT NULL,
  "source" VARCHAR(20) NOT NULL DEFAULT 'browser', -- browser | agent
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IDX_print_events_user_created" ON "print_events" ("user_id", "created_at" DESC);

-- Start: browser printing only — no install, ever.
UPDATE "plans"
SET "description" = 'Impressão de etiquetas em lote pelo navegador, sem instalar nada',
    "auto_print" = false,
    "sla_queue" = false,
    "packing_check" = false,
    "print_history" = false,
    "features" = '["Conectar Mercado Livre","Visualizar envios","Imprimir em lote pelo navegador","PDF e ZPL","Sem instalação — roda 100% no navegador"]',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'start';

-- Pro: expedition tools that work on the site, plus optional auto-print agent.
UPDATE "plans"
SET "description" = 'Ferramentas de expedição e impressão automática opcional para volume diário',
    "auto_print" = true,
    "sla_queue" = true,
    "packing_check" = true,
    "print_history" = true,
    "features" = '["Todos os recursos Start","Fila por prazo de despacho","Conferência antes de imprimir","Impressão automática (agente opcional)","Monitoramento de impressão","Histórico","Retries"]',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'pro';
