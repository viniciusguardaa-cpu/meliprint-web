import { Activity } from 'lucide-react';
import type { GrowthMetrics } from './adminTypes';
import { MiniBars } from './AdminMiniBars';

export function AdminGrowthPanel({ growth, growthDays, onChangeDays }: {
  growth: GrowthMetrics | null;
  growthDays: number;
  onChangeDays: (days: number) => void;
}) {
  return (
    <>
        {growth && (
          <div className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Analytics</h2>
              </div>
              <div className="flex items-center gap-1">
                {([7, 30, 90, 0] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => onChangeDays(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${growthDays === d ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-border'}`}
                  >
                    {d === 0 ? 'Tudo' : `${d}d`}
                  </button>
                ))}
              </div>
            </div>

            {/* Traffic totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{growth.funnel.unique_visitors}</div>
                <div className="text-xs text-muted-foreground">Visitantes únicos</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{growth.funnel.page_views}</div>
                <div className="text-xs text-muted-foreground">Páginas vistas</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{growth.funnel.registered}</div>
                <div className="text-xs text-muted-foreground">Cadastros</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{growth.funnel.subscriptions_cancelled}</div>
                <div className="text-xs text-muted-foreground">Cancelamentos</div>
              </div>
            </div>

            {/* Funnel with step conversion */}
            <h3 className="text-sm font-semibold text-foreground mb-3">Funil de conversão</h3>
            <div className="space-y-2 mb-6">
              {(() => {
                const f = growth.funnel;
                const steps = [
                  { label: 'Visitaram a landing', value: f.landing_visitors },
                  { label: 'Se cadastraram', value: f.registered },
                  { label: 'Viram a página de preços', value: f.pricing_visitors },
                  { label: 'Iniciaram checkout', value: f.checkouts_started },
                  { label: 'Iniciaram trial', value: f.trials_started },
                  { label: 'Assinaram', value: f.subscriptions_activated },
                ];
                const top = Math.max(steps[0].value, 1);
                return steps.map((s, i) => {
                  const prev = i > 0 ? steps[i - 1].value : s.value;
                  const stepPct = prev > 0 ? Math.round((s.value / prev) * 100) : null;
                  const totalPct = Math.round((s.value / top) * 100);
                  return (
                    <div key={s.label} className="relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/10 rounded-lg transition-all"
                        style={{ width: `${Math.max(totalPct, 2)}%` }}
                      />
                      <div className="relative flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-foreground">{s.label}</span>
                        <span className="text-muted-foreground whitespace-nowrap ml-3">
                          <span className="font-bold text-foreground">{s.value}</span>
                          {i > 0 && stepPct !== null && (
                            <span className={`ml-2 text-xs ${stepPct < 50 ? 'text-danger' : 'text-success'}`}>
                              {stepPct}% do passo anterior
                            </span>
                          )}
                          <span className="ml-2 text-xs">{totalPct}% do topo</span>
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Abandonment */}
            <h3 className="text-sm font-semibold text-foreground mb-3">Abandono</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-danger/10 border border-red-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-danger">{growth.abandonment.pricing_no_checkout}</div>
                <div className="text-xs text-muted-foreground">Viram preços e não iniciaram checkout</div>
              </div>
              <div className="bg-danger/10 border border-red-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-danger">{growth.abandonment.checkout_abandoned}</div>
                <div className="text-xs text-muted-foreground">Iniciaram checkout e não assinaram</div>
              </div>
              <div className="bg-danger/10 border border-red-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-danger">{growth.abandonment.trials_not_converted}</div>
                <div className="text-xs text-muted-foreground">Trials que não viraram assinatura</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Visitors per day */}
              {growth.visitors_by_day.length > 0 && (
                <div className="bg-muted rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Visitantes únicos / dia</h3>
                  <MiniBars
                    color="bg-primary"
                    data={growth.visitors_by_day.map((d) => ({
                      label: `${new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: ${d.visitors} visitantes, ${d.views} views`,
                      value: d.visitors
                    }))}
                  />
                </div>
              )}

              {/* Top pages */}
              {growth.top_pages.length > 0 && (
                <div className="bg-muted rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Páginas mais acessadas</h3>
                  <div className="divide-y divide-border">
                    {growth.top_pages.map((p) => (
                      <div key={p.path} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-foreground truncate font-mono text-xs">{p.path}</span>
                        <span className="text-muted-foreground whitespace-nowrap ml-3">
                          {p.views} views · {p.visitors} únicos
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Traffic sources */}
            {growth.traffic_sources && growth.traffic_sources.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-foreground mb-2">Origem dos visitantes</h3>
                <div className="divide-y divide-border border border-border rounded-lg">
                  {(() => {
                    const total = growth.traffic_sources.reduce((acc, s) => acc + s.visitors, 0) || 1;
                    return growth.traffic_sources.map((s) => (
                      <div key={s.source} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-foreground font-medium capitalize">{s.source}</span>
                        <span className="text-muted-foreground whitespace-nowrap ml-3">
                          {s.visitors} visitantes · {s.signups} cadastros
                          <span className="ml-2 text-xs">{Math.round((s.visitors / total) * 100)}%</span>
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {growth.utm_performance.length > 0 && growth.utm_performance.some((u) => u.utm_campaign || (u.utm_medium && u.utm_medium.toLowerCase() !== 'organic')) && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Campanhas (UTM)</h3>
                <div className="divide-y divide-border border border-border rounded-lg">
                  {growth.utm_performance
                    .filter((u) => u.utm_campaign || (u.utm_medium && u.utm_medium.toLowerCase() !== 'organic'))
                    .map((u, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-foreground truncate">
                          {[u.utm_source, u.utm_medium, u.utm_campaign].filter(Boolean).join(' / ')}
                        </span>
                        <span className="text-muted-foreground whitespace-nowrap ml-3">
                          {u.visitors} visitas · {u.signups} contas
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

    </>
  );
}
