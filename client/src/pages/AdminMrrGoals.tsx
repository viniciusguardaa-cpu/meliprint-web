import { useEffect, useState } from 'react';
import { Check, Pencil, Target, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export interface MrrGoals { achievable: number; ideal: number }

const brl = (n: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0
}).format(n);

export function AdminMrrGoals({ mrr }: { mrr: number | null }) {
  const [goals, setGoals] = useState<MrrGoals | null>(null);
  const [reload, setReload] = useState(0);
  const [edit, setEdit] = useState(false);
  const [achievable, setAchievable] = useState('');
  const [ideal, setIdeal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/mrr-goals').then(async (res) => {
      if (!res.ok) throw new Error('Não foi possível carregar as metas.');
      return res.json() as Promise<MrrGoals>;
    }).then((data) => { if (active) setGoals(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [reload]);

  const beginEdit = () => {
    if (!goals) return;
    setAchievable(String(goals.achievable));
    setIdeal(String(goals.ideal));
    setError(null);
    setEdit(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = { achievable: Number(achievable), ideal: Number(ideal) };
    if (!Number.isSafeInteger(next.achievable) || !Number.isSafeInteger(next.ideal) ||
        next.achievable < 1 || next.ideal <= next.achievable || next.ideal > 1000000000) {
      setError('Use valores inteiros em reais, com a meta ideal maior que a alcançável.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/mrr-goals', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar metas.');
      setGoals(data);
      setEdit(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar metas.');
    } finally { setBusy(false); }
  };

  const current = Math.max(0, mrr ?? 0);
  const achievablePct = goals ? Math.min(100, current / goals.achievable * 100) : 0;
  const idealPct = goals ? Math.min(100, current / goals.ideal * 100) : 0;

  return (
    <section className="bg-surface rounded-xl border border-border shadow-sm p-5 sm:p-6 mb-8" aria-label="Metas de MRR">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Metas de MRR</h2>
            <p className="text-xs text-muted-foreground">Receita mensal recorrente de assinaturas pagas</p>
          </div>
        </div>
        {goals && !edit && <Button type="button" variant="outline" onClick={beginEdit} className="text-sm">
          <Pencil className="w-4 h-4" /> Editar metas
        </Button>}
      </div>

      {goals && <>
        <div className="flex items-baseline gap-2 mb-5">
          <span className="text-3xl font-bold text-foreground">{brl(current)}</span>
          <span className="text-sm text-muted-foreground">MRR atual</span>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="flex justify-between gap-3 text-sm mb-2">
              <span className="font-medium text-foreground">Alcançável <span className="text-muted-foreground font-normal">· {brl(goals.achievable)}</span></span>
              <span className="font-semibold text-primary">{Math.round(current / goals.achievable * 100)}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden" role="progressbar" aria-label="Progresso da meta alcançável" aria-valuenow={Math.min(100, Math.round(achievablePct))} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${achievablePct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between gap-3 text-sm mb-2">
              <span className="font-medium text-foreground">Super ideal <span className="text-muted-foreground font-normal">· {brl(goals.ideal)}</span></span>
              <span className="font-semibold text-success">{Math.round(current / goals.ideal * 100)}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden" role="progressbar" aria-label="Progresso da meta super ideal" aria-valuenow={Math.min(100, Math.round(idealPct))} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-success rounded-full transition-all" style={{ width: `${idealPct}%` }} />
            </div>
          </div>
        </div>
      </>}

      {!goals && !error && <p className="text-sm text-muted-foreground">Carregando metas...</p>}
      {edit && <form onSubmit={save} className="mt-6 border-t border-border pt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-foreground">Meta alcançável (R$)
            <Input type="number" min="1" step="1" required value={achievable} onChange={e => setAchievable(e.target.value)} className="mt-1" />
          </label>
          <label className="text-sm font-medium text-foreground">Meta super ideal (R$)
            <Input type="number" min="2" step="1" required value={ideal} onChange={e => setIdeal(e.target.value)} className="mt-1" />
          </label>
        </div>
        <div className="flex gap-2 mt-4">
          <Button type="submit" disabled={busy}><Check className="w-4 h-4" />{busy ? 'Salvando...' : 'Salvar metas'}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setEdit(false); setError(null); }}><X className="w-4 h-4" />Cancelar</Button>
        </div>
      </form>}
      {error && <div role="alert" className="text-sm text-danger mt-4">{error}{!goals && <button type="button" className="ml-2 underline" onClick={() => { setError(null); setReload(n => n + 1); }}>Tentar novamente</button>}</div>}
    </section>
  );
}
