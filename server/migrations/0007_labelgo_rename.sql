-- 0007_labelgo_rename.sql — rename plan display names to the LabelGo brand.
-- 0004 was edited for fresh installs; existing databases (production) already
-- applied it, so the rename needs its own migration to take effect there.
-- Idempotent: safe to run multiple times, preserves ids/prices/contracts.

UPDATE "plans"
SET "name" = 'LabelGo Start',
    "features" = '["Conectar Mercado Livre","Visualizar envios","Gerar etiquetas","PDF","ZPL","Impressão em lote"]'
WHERE "id" = 'start';

UPDATE "plans"
SET "name" = 'LabelGo Pro',
    "features" = '["Todos os recursos Start","Impressão automática","LabelGo Agent","Fila automática","Monitoramento de impressão","Histórico","Retries"]'
WHERE "id" = 'pro';
