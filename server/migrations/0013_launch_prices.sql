-- One product, two offers: Complete regular and its locked Founder promotion.
-- Keep legacy Start contracts, checkout sessions and MP preapprovals unchanged.
UPDATE "plans" SET "is_active" = false WHERE "id" = 'start';
UPDATE "plans" SET "name" = 'LabelGo Completo',
"features" = '["Conectar marketplaces","Impressão em lote pelo navegador","PDF e ZPL","Fila por prazo de despacho","Conferência antes de imprimir","Impressão automática (agente opcional)","Monitoramento de impressão","Histórico","Retries"]'  WHERE "id" = 'pro';
UPDATE "prices" SET "amount" = 19.90
WHERE "plan_id" = 'pro' AND "billing_period" = 'monthly';

-- Internal offer id, not a second product tier. Same entitlements as Pro.
INSERT INTO "plans" ("id", "name", "description", "auto_print", "sla_queue", "packing_check", "print_history", "is_active", "sort_order", "features")
SELECT 'founder', 'LabelGo Completo - Fundador', "description", "auto_print", "sla_queue", "packing_check", "print_history", true, 1, "features"
FROM "plans" WHERE "id" = 'pro'
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "prices" ("plan_id", "billing_period", "amount", "currency", "is_active")
VALUES ('founder', 'monthly', 7.90, 'BRL', true)
ON CONFLICT ("plan_id", "billing_period") DO NOTHING;

-- Old experiment variants must not override these offers.
UPDATE "pricing_experiments" SET "is_active" = false
WHERE "plan_id" IN ('start', 'pro', 'founder');
