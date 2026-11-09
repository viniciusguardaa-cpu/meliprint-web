import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Download, Mail, MapPin, Newspaper } from 'lucide-react';
import Header from '../components/Header';

const ASSETS = [
  { name: 'Logo principal (PNG)', href: '/press/logo.png', desc: '1024×341 px, para materiais claros' },
  { name: 'Logo horizontal (PNG)', href: '/press/logo-wordmark.png', desc: 'Versão horizontal para cabeçalhos' },
  { name: 'Imagem Open Graph (PNG)', href: '/press/og-image.png', desc: '1200×630 px, para cards e redes' },
  { name: 'Screenshot do produto (JPG)', href: '/press/2-labelgo-demo-poster.jpg', desc: '1280×720 px, demonstração ilustrativa' },
];

const FACTS = [
  ['Produto', 'LabelGo'],
  ['O que faz', 'Impressão de etiquetas do Mercado Livre em lote (PDF e ZPL)'],
  ['Público', 'Vendedores do Mercado Livre no Brasil'],
  ['Fundador', 'Vinicius Guarda'],
  ['Empresa', 'Guarda & Guarda Ltda (Companhia do Papel)'],
  ['CNPJ', '00.397.452/0001-59'],
  ['Sede', 'Rua Humaitá, 895, Sala 05/06/07 — Kennedy, Londrina/PR, CEP 86060-060'],
  ['Site', 'labelgo.com.br'],
  ['Contato', 'suporte@labelgo.com.br'],
];

export default function Press() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <nav aria-label="breadcrumb" className="mb-6 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">Início</Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground/80">Imprensa</span>
        </nav>

        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Newspaper className="w-5 h-5" />
          </span>
          <h1 className="text-3xl font-bold text-foreground">Imprensa</h1>
        </div>
        <p className="text-lg text-muted-foreground mb-8">
          Materiais para jornalistas, criadores e parceiros que querem falar sobre o LabelGo.
          Se precisar de algo que não está aqui, fale com a gente.
        </p>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Sobre o LabelGo</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            <strong className="text-foreground">Boilerplate curto:</strong> o LabelGo é um SaaS
            brasileiro que ajuda vendedores do Mercado Livre a imprimir etiquetas de envio em lote,
            em PDF pelo navegador ou em ZPL na impressora térmica.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Boilerplate longo:</strong> o LabelGo conecta a conta
            do vendedor ao Mercado Livre via OAuth oficial, lista os envios prontos e permite
            selecionar vários pedidos para gerar um único PDF com todas as etiquetas. Também gera
            ZPL para impressoras térmicas e, no plano Completo, imprime automaticamente com um
            agente para Windows. O LabelGo é um produto da Guarda &amp; Guarda Ltda (Companhia do
            Papel), com sede em Londrina/PR, e não é afiliado ao Mercado Livre.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Fatos rápidos</h2>
          <dl className="bg-surface border border-border rounded-2xl p-6 grid sm:grid-cols-[140px_1fr] gap-x-4 gap-y-3 text-sm">
            {FACTS.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="font-semibold text-foreground">{label}</dt>
                <dd className="text-muted-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Fundador</h2>
          <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col sm:flex-row gap-4 sm:items-start">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-lg font-bold">
              VG
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Vinicius Guarda</h3>
              <p className="text-sm text-muted-foreground">Fundador do LabelGo</p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                Empreendedor de Londrina/PR, criou o LabelGo para simplificar a expedição de quem
                vende no Mercado Livre: menos tempo abrindo pedido por pedido, mais tempo para
                vender. Também é sócio-administrador da Guarda &amp; Guarda Ltda.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Logo e imagens</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {ASSETS.map((asset) => (
              <a
                key={asset.href}
                href={asset.href}
                download
                className="block bg-surface border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all"
              >
                <span className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <Download className="w-4 h-4 text-primary" /> {asset.name}
                </span>
                <span className="block text-muted-foreground text-sm mt-1">{asset.desc}</span>
              </a>
            ))}
          </div>
          <a
            href="/press/labelgo-press-kit.zip"
            download
            className="mt-4 inline-flex items-center gap-2 bg-primary text-white font-semibold px-5 py-3 rounded-xl hover:bg-primary-hover transition-all duration-150 hover:-translate-y-px"
          >
            <Download className="w-4 h-4" />
            Baixar kit completo (ZIP)
          </a>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Temas para pauta</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
            <li>Quanto tempo vendedores do Mercado Livre perdem imprimindo etiquetas por dia.</li>
            <li>ZPL × PDF: quando a impressora térmica vale a pena e quando o PDF resolve.</li>
            <li>Erros que fazem a etiqueta ser recusada na coleta — e como evitar.</li>
            <li>Automação de expedição para pequenos e médios sellers: o que muda na rotina.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Contato</h2>
          <p className="text-muted-foreground leading-relaxed">
            Para entrevistas, dados ou materiais adicionais, fale com{' '}
            <a href="mailto:suporte@labelgo.com.br" className="text-primary font-medium hover:underline">
              suporte@labelgo.com.br
            </a>
            . Respondemos em até um dia útil.
          </p>
          <p className="mt-3 text-sm text-muted-foreground flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Londrina/PR ·{' '}
            <Building2 className="w-4 h-4" /> Guarda &amp; Guarda Ltda ·{' '}
            <Mail className="w-4 h-4" /> suporte@labelgo.com.br
          </p>
        </section>

        <nav className="border-t border-border pt-8" aria-label="Páginas relacionadas">
          <h2 className="text-lg font-semibold text-foreground mb-4">Veja também</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            <li>
              <Link to="/sobre/" className="block bg-surface border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all">
                <span className="block font-semibold text-foreground text-sm">Sobre o LabelGo</span>
                <span className="block text-muted-foreground text-sm mt-1">História, fundador e dados da empresa</span>
              </Link>
            </li>
            <li>
              <Link to="/pricing/" className="block bg-surface border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all">
                <span className="block font-semibold text-foreground text-sm">Planos e preços</span>
                <span className="block text-muted-foreground text-sm mt-1">Teste grátis por 7 dias, sem cartão</span>
              </Link>
            </li>
          </ul>
        </nav>

        <div className="bg-primary rounded-2xl p-6 text-white text-center mt-8">
          <h2 className="text-xl font-bold mb-2">Quer conhecer o produto?</h2>
          <p className="text-white/80 mb-4">Conecte seu Mercado Livre e imprima etiquetas em segundos.</p>
          <Link
            to="/cadastro"
            className="bg-white text-primary font-semibold px-6 py-3 rounded-xl hover:bg-secondary hover:text-foreground transition-all duration-150 hover:-translate-y-px inline-flex items-center gap-2"
          >
            Testar grátis por 7 dias
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
