**LabelGo — implementação para chegar a R$ 10 mil MRR**

Auditoria em 17/09/2026, implementação executada na sequência. Meta assumida: receita recorrente mensal bruta em reais. Não é previsão de faturamento nem lucro.

**Conclusão:** a fundação foi corrigida e os bloqueios de lançamento implementados. A prioridade seguinte é o piloto com sellers reais e as validações externas listadas ao final.

**Estado de implementação**

| Prioridade | Problema confirmado | Estado |
|---|---|---|
| P0 — inicialização | `0005_growth.sql` declarava `"UNIQUE" ("referred_user_id")` como coluna — SQL inválido. | ✅ Corrigido (constraint de tabela). Validado em PostgreSQL 14/15 descartável: instalação nova, upgrade preservando dados e re-execução idempotente (`server/scripts/test-migrations.sh`, CI). |
| P0 — agente | `agent/agent.js` usava `require` em pacote ESM; `adapter.js` continha sintaxe TS em `.js`. | ✅ Corrigido (`import { randomUUID }`, typedef em JSDoc). `agent.js --check` passa e roda na CI. |
| P0 — vender Pro | Pricing só iniciava trial; checkout barrava pagamento durante trial; sem trial único. | ✅ Checkout pago implementado com `checkout_sessions` persistente (idempotência por `(user_id, idempotency_key)`, recuperação após falha, dedup de concorrentes). Trial único via `users.trial_started_at` — sobrevive a cancelamento/expiração. Conversão trial→pago reutiliza a assinatura existente. UI mostra dias restantes e CTA de assinatura. |
| P0 — cobrança | Webhooks deduplicavam por ID da assinatura (eventos posteriores descartados); reconciler preso nas mesmas 50 linhas. | ✅ Dedup por entrega com estado `received/processed/failed` — falhas retentáveis, nada perdido. Tópicos atuais do MP aceitos (`subscription_preapproval`, `subscription_authorized_payment`, `payment`). Reconciler pagina por `last_reconciled_at` e atualiza período mesmo sem mudança de status. Trials expirados e períodos findos viram `trial_expired`/`expired`. |
| P0 — acesso pago | Jobs entregues sem verificar assinatura vigente; cancelado perdia acesso na hora. | ✅ `getEntitledSubscription`/`hasProAccess` centralizam: autorizada, trial dentro do prazo ou cancelada dentro do período pago têm acesso; após `current_period_end`/`trial_ends_at`, agente recebe `403 subscription_required` e nenhum job novo. |
| P0 — impressão confiável | Confirmação HTTP ignorada; falha ao confirmar tratava-se como falha de impressão → reimpressão duplicada. | ✅ Agente grava recibo local atômico após aceite do spooler; falha de confirmação só retenta a confirmação (`flushPendingConfirmations`), nunca reimprime. Claim expirado → `needs_review` (decisão humana na UI). Spooler aceito ≠ impressão física confirmada. |
| P1 — notificações ML | `UNIQUE(topic, resource)` bloqueava mudanças posteriores do mesmo envio. | ✅ Dedup por `delivery_key` (por entrega); `attempts`/`last_error` persistidos; sweeper no poller retenta falhas; polling continua como fallback. |
| P1 — preço consistente | Catálogo mostrava preço experimental; checkout cobrava preço padrão. | ✅ Checkout usa o preço validado no servidor para a variante atribuída; `contracted_amount` persistido preserva preços de contratos antigos. Experimento permanece inativo. |
| P1 — instalação simples | Exigia Node, `.env` manual e terminal. | ✅ Fluxo por código de pareamento (`POST /api/agent/pair` + `agent.js --setup` com wizard: pareamento → impressora → etiqueta de teste → autostart). Instalador Windows via `@yao-pkg/pkg` + Inno Setup (`agent/installer/`). ⚠️ Compilação/validação do exe exige Windows real — pendente. |
| P1 — medir aquisição | Frontend nunca chamava `/api/analytics/*`; MRR incluía trials. | ✅ `client/src/lib/analytics.ts` + eventos em Landing/Login/Pricing (`landing_view`, `ml_oauth_started`, `pricing_view`, `checkout_started`, `trial_started`); `ml_connected`/`subscription_activated` no backend. Funil e UTM no painel admin (`/api/admin/growth`). MRR exclui trials e gratuidades. |

Os caminhos sem prefixo na tabela são relativos a `server/src/`.

**Sequência prática e critérios de conclusão**

1. ✅ P0 corrigido: migrations válidas, agente inicia, checkout idempotente, trial único, reconciliação completa, entitlement por período, impressão sem duplicar.
2. ⏳ Validar com contas de teste (sandbox MP + conta ML de teste): webhook real, renovação de token, emissão PDF/ZPL.
3. ⏳ Validar em Windows real + impressora física: compilar `LabelGoAgent-Setup.exe`, instalar, imprimir teste, reiniciar, dois agentes, queda de rede.
4. ⏳ Piloto com 10 sellers: primeira etiqueta, uso na semana seguinte, conversão paga, minutos de suporte.
5. ⏳ Após pagamento recorrente observado: completar funil e ampliar aquisição.

**Oferta e meta comercial**

Manter Start R$29,90 e Pro R$59,90. Exemplo: 60 Start + 140 Pro = **R$10.180 MRR**, com 200 pagantes. Descontos, taxas, impostos, infraestrutura, comissões e cancelamentos reduzem o resultado líquido. Ainda não foram consultados números reais de clientes, conversão ou retenção.

Adiar novos marketplaces, ERP, financeiro, comissões automáticas e otimização automática de preços até validar o núcleo com pagantes.

**Verificação realizada**

- Build client + server: ✅
- Testes server: 67 passando + 1 gated por `TEST_DATABASE_URL` (regressão: trial único, idempotência de checkout, dedup de webhooks/notificações, needs_review, migrations). Agent: 8 testes `node:test` (queda de rede pós-spooler, restart, recibo pendente, órfão 404).
- Migrations em Postgres descartável: instalação nova, upgrade com dados preservados, idempotência — ✅ via `server/scripts/test-migrations.sh` e smoke SQL real (12 verificações).
- Agente: `--check`, `--setup`, `--list-printers`, `--test-print` implementados; startup verificado.

**Bloqueios restantes (exigem ambiente externo)**

- Windows real: compilar/rodar o instalador, autostart, impressora física.
- Conta Mercado Pago sandbox: checkout real, webhooks reais com assinatura.
- Conta Mercado Livre de teste: OAuth, pedidos, etiquetas reais.
- Deploy/produção: fora do escopo.
