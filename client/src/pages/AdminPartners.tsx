import { useCallback, useEffect, useState } from 'react';
import { Share2, Copy, Check, Plus, KeyRound, Lock } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { brl2, copyText, type AdminPartner } from './partnerTypes';

export function AdminPartners() {
  const [partners, setPartners] = useState<AdminPartner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pct, setPct] = useState('20');
  const [months, setMonths] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<{ partner: string; key: string; link: string; username?: string | null; password?: string | null } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editPct, setEditPct] = useState('');
  const [editMonths, setEditMonths] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/partners');
      if (!res.ok) throw new Error('Não foi possível carregar os parceiros.');
      setPartners((await res.json()).partners);
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const copy = async (id: string, text: string) => {
    if (await copyText(text)) { setCopied(id); setTimeout(() => setCopied(null), 1500); }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/admin/partners', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ref_code: code, username: username || undefined, password: password || undefined, commission_pct: pct === '' ? null : Number(pct), commission_months: months === '' ? null : Number(months) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar parceiro');
      setNewKey({ partner: data.partner.name, key: data.access_key, link: data.partner.link, username: data.partner.username, password: data.initial_password });
      setName(''); setCode(''); setUsername(''); setPassword(''); setMonths('');
      await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const patch = async (id: number, body: Record<string, unknown>) => {
    setError(null);
    const res = await fetch(`/api/admin/partners/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) setError((await res.json()).error || 'Erro ao salvar');
    await load();
  };

  const rotate = async (p: AdminPartner) => {
    if (!window.confirm(`Gerar nova chave para ${p.name}? A chave antiga deixa de funcionar.`)) return;
    const res = await fetch(`/api/admin/partners/${p.id}/rotate-key`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) setNewKey({ partner: p.name, key: data.access_key, link: p.link });
    else setError(data.error || 'Erro ao gerar chave');
  };

  const resetPassword = async (p: AdminPartner) => {
    if (!window.confirm(`Gerar nova senha para ${p.name}? A senha antiga deixa de funcionar.`)) return;
    const res = await fetch(`/api/admin/partners/${p.id}/reset-password`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) setNewKey({ partner: p.name, key: '', link: p.link, username: p.username, password: data.password });
    else setError(data.error || 'Erro ao gerar senha');
  };

  const saveTerms = async (id: number) => {
    await patch(id, { commission_pct: editPct === '' ? null : Number(editPct), commission_months: editMonths === '' ? null : Number(editMonths) });
    setEditId(null);
  };

  const portal = `${window.location.origin}/parceiro`;

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-8">
      <div className="flex items-center gap-2 mb-1">
        <Share2 className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Parceiros</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Cada parceiro entra no painel dele em {portal} com usuário e senha (a chave de acesso serve como recuperação) e só enxerga as próprias indicações, sem dados pessoais.
        Comissão = % do faturamento bruto contratado, estimada a partir das assinaturas ativas.
      </p>

      {error && <p role="alert" className="text-sm text-danger mb-3">{error}</p>}

      {newKey && (
        <div className="rounded-lg border border-border bg-muted p-4 mb-4" data-testid="new-key">
          <p className="text-sm font-semibold text-foreground mb-1">Acesso de {newKey.partner}</p>
          <p className="text-xs text-muted-foreground mb-2">Aparece só agora. Envie ao parceiro por um canal seguro; depois não dá para ver de novo (só gerar outro). Ele pode trocar a senha no próprio painel.</p>
          <div className="flex flex-wrap items-center gap-2">
            {newKey.username && (
              <>
                <span className="text-xs text-muted-foreground">Usuário:</span>
                <code className="text-xs bg-surface border border-border rounded px-2 py-1 break-all">{newKey.username}</code>
              </>
            )}
            {newKey.password && (
              <>
                <span className="text-xs text-muted-foreground">Senha:</span>
                <code className="text-xs bg-surface border border-border rounded px-2 py-1 break-all">{newKey.password}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => copy('pwd', newKey.password!)}>
                  {copied === 'pwd' ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}Copiar senha
                </Button>
              </>
            )}
            {newKey.key && (
              <>
                <span className="text-xs text-muted-foreground">Chave (recuperação):</span>
                <code className="text-xs bg-surface border border-border rounded px-2 py-1 break-all">{newKey.key}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => copy('key', newKey.key)}>
                  {copied === 'key' ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}Copiar chave
                </Button>
              </>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => setNewKey(null)}>Fechar</Button>
          </div>
        </div>
      )}

      <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-6">
        <Input placeholder="Nome (ex.: Ecommerce Free)" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Nome do parceiro" />
        <Input placeholder="Código do link (ex.: ecommercefree)" value={code} onChange={(e) => setCode(e.target.value)} required aria-label="Código do link" />
        <Input placeholder="Usuário (padrão: código)" value={username} onChange={(e) => setUsername(e.target.value)} aria-label="Usuário de acesso" />
        <Input placeholder="Senha (vazio gera uma)" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Senha inicial" />
        <Input placeholder="% comissão" type="number" step="0.5" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} aria-label="Percentual de comissão" />
        <Input placeholder="Meses (opcional)" type="number" min="1" value={months} onChange={(e) => setMonths(e.target.value)} aria-label="Duração em meses" />
        <Button type="submit" disabled={busy} className="sm:col-span-2"><Plus className="w-4 h-4 mr-1" />Criar parceiro</Button>
      </form>

      {partners && partners.length === 0 && <p className="text-sm text-muted-foreground">Nenhum parceiro ainda.</p>}
      <div className="space-y-3">
        {partners?.map((p) => (
          <div key={p.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{p.name}</span>
                <Badge variant={p.is_active ? 'success' : 'neutral'}>{p.is_active ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copy(`l${p.id}`, p.link)}>
                  {copied === `l${p.id}` ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}Copiar link
                </Button>
                <Button size="sm" variant="outline" onClick={() => resetPassword(p)}><Lock className="w-4 h-4 mr-1" />Nova senha</Button>
                <Button size="sm" variant="outline" onClick={() => rotate(p)}><KeyRound className="w-4 h-4 mr-1" />Nova chave</Button>
                <Button size="sm" variant="ghost" onClick={() => patch(p.id, { is_active: !p.is_active })}>{p.is_active ? 'Desativar' : 'Ativar'}</Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground break-all mb-1">{p.link}</p>
            <p className="text-xs text-muted-foreground mb-3">Usuário de acesso: <code className="bg-muted border border-border rounded px-1">{p.username ?? 'não definido'}</code></p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center mb-3">
              {[['Visitantes', p.visitors], ['Cadastros', p.signups], ['Testes', p.trials], ['Assinaturas', p.paid], ['Canceladas', p.cancelled]].map(([l, v]) => (
                <div key={String(l)} className="bg-muted rounded-lg p-2"><div className="text-lg font-bold">{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
              ))}
            </div>
            {editId === p.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input className="w-28" type="number" step="0.5" min="0" max="100" value={editPct} onChange={(e) => setEditPct(e.target.value)} aria-label="Percentual" />
                <Input className="w-28" type="number" min="1" placeholder="meses" value={editMonths} onChange={(e) => setEditMonths(e.target.value)} aria-label="Meses" />
                <Button size="sm" onClick={() => saveTerms(p.id)}>Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  Comissão: <strong>{p.commission_pct === null ? 'não definida' : `${p.commission_pct}%`}</strong>
                  {' · '}duração: <strong>{p.commission_months === null ? 'a definir' : `${p.commission_months} meses`}</strong>
                  {' · '}por mês (estim.): <strong>{brl2(p.commission.monthly)}</strong>
                  {' · '}acumulada (estim.): <strong>{brl2(p.commission.accrued)}</strong>
                </span>
                <Button size="sm" variant="ghost" onClick={() => { setEditId(p.id); setEditPct(p.commission_pct === null ? '' : String(p.commission_pct)); setEditMonths(p.commission_months === null ? '' : String(p.commission_months)); }}>Editar comissão</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
