import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Link2, Users, Timer, BadgeCheck, Wallet, LogOut, TrendingUp } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { brl2, copyText, type PartnerDashboardData } from './partnerTypes';

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '-');

function StatusBadge({ s }: { s: 'paid' | 'trial' | 'cancelled' | 'none' }) {
  if (s === 'paid') return <Badge variant="success">Assinante</Badge>;
  if (s === 'trial') return <Badge variant="processing">Em teste</Badge>;
  if (s === 'cancelled') return <Badge variant="error">Cancelada</Badge>;
  return <Badge variant="neutral">Cadastro</Badge>;
}

export default function Partner() {
  const [data, setData] = useState<PartnerDashboardData | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/partner/dashboard');
    if (res.status === 401) { setAuthed(false); setData(null); return; }
    if (!res.ok) { setError('Não foi possível carregar o painel.'); return; }
    setData(await res.json()); setAuthed(true);
  }, []);
  useEffect(() => { load().catch(() => setAuthed(false)); }, [load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    const res = await fetch('/api/partner/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_key: key }) });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Não foi possível entrar'); return; }
    setKey(''); await load();
  };
  const logout = async () => { await fetch('/api/partner/logout', { method: 'POST' }); setAuthed(false); setData(null); };
  const copy = async () => { if (data && await copyText(data.partner.link)) { setCopied(true); setTimeout(() => setCopied(false), 1800); } };

  if (authed === null) return <div className="min-h-screen bg-muted" />;

  if (!authed || !data) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4">
        <form onSubmit={login} className="bg-surface rounded-2xl border border-border shadow-sm p-8 w-full max-w-sm">
          <img src="/logo-wordmark.png" alt="LabelGo" className="h-8 mb-6" />
          <h1 className="text-xl font-bold text-foreground mb-1">Painel do parceiro</h1>
          <p className="text-sm text-muted-foreground mb-5">Entre com a chave de acesso que a LabelGo te enviou.</p>
          <Input type="password" autoComplete="off" placeholder="Chave de acesso" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Chave de acesso" required />
          {error && <p role="alert" className="text-sm text-danger mt-3">{error}</p>}
          <Button type="submit" className="w-full mt-4">Entrar</Button>
        </form>
      </div>
    );
  }

  const { partner, summary, referrals } = data;
  const conv = summary.signups ? Math.round((summary.paid / summary.signups) * 100) : 0;
  const cards = [
    { label: 'Visitantes pelo seu link', value: summary.visitors, icon: Link2 },
    { label: 'Cadastros', value: summary.signups, icon: Users },
    { label: 'Em teste', value: summary.trials, icon: Timer },
    { label: 'Assinaturas ativas', value: summary.paid, icon: BadgeCheck },
  ];

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-surface border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-wordmark.png" alt="LabelGo" className="h-7" />
            <span className="text-sm text-muted-foreground hidden sm:inline">Painel do parceiro</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4 mr-1" />Sair</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Olá, {partner.name}</h1>
          <p className="text-sm text-muted-foreground">Acompanhe as assinaturas que vieram do seu link.</p>
        </div>

        <section className="bg-surface rounded-xl border border-border shadow-sm p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">Seu link de indicação</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm break-all" data-testid="partner-link">{partner.link}</code>
            <Button onClick={copy}>{copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}{copied ? 'Copiado!' : 'Copiar link'}</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Quem entrar por esse link e criar conta nos próximos 30 dias fica ligado a você.</p>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-surface rounded-xl border border-border shadow-sm p-4">
              <Icon className="w-5 h-5 text-primary mb-2" />
              <div className="text-2xl font-bold text-foreground">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
            <Wallet className="w-5 h-5 text-primary mb-2" />
            <div className="text-2xl font-bold">{brl2(summary.commission.monthly)}</div>
            <div className="text-xs text-muted-foreground">Comissão estimada por mês</div>
          </div>
          <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
            <TrendingUp className="w-5 h-5 text-primary mb-2" />
            <div className="text-2xl font-bold">{brl2(summary.commission.accrued)}</div>
            <div className="text-xs text-muted-foreground">Comissão acumulada (estimativa)</div>
          </div>
          <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
            <div className="text-2xl font-bold">{conv}%</div>
            <div className="text-xs text-muted-foreground">Cadastros que viraram assinatura</div>
            <div className="text-xs text-muted-foreground mt-2">
              Condições: {partner.commission_pct === null ? 'a definir' : `${partner.commission_pct}% do faturamento bruto`}
              {' · '}{partner.commission_months === null ? 'prazo a definir' : `por ${partner.commission_months} meses`}
            </div>
          </div>
        </section>
        <p className="text-xs text-muted-foreground">Valores de comissão são estimativas calculadas sobre as assinaturas ativas. O pagamento segue o combinado com a LabelGo.</p>

        <section className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border"><h2 className="font-semibold text-foreground">Suas indicações</h2>
            <p className="text-xs text-muted-foreground">Por privacidade, os clientes aparecem sem nome nem e-mail.</p></div>
          {referrals.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Ainda não há cadastros pelo seu link. Compartilhe o link acima para começar.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground bg-muted"><th className="px-5 py-2">Cliente</th><th className="px-5 py-2">Cadastro</th><th className="px-5 py-2">Situação</th><th className="px-5 py-2">1ª assinatura</th></tr></thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.label} className="border-t border-border">
                    <td className="px-5 py-2.5 font-medium">{r.label}</td>
                    <td className="px-5 py-2.5">{fmtDate(r.signed_up_at)}</td>
                    <td className="px-5 py-2.5"><StatusBadge s={r.status} /></td>
                    <td className="px-5 py-2.5">{fmtDate(r.first_paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
