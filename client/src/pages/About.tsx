import { Link } from 'react-router-dom';
import { ArrowRight, Building2, ChevronRight, Mail, MapPin, ShieldCheck } from 'lucide-react';
import Header from '../components/Header';

const COMPANY = {
  legalName: 'Guarda & Guarda Ltda (Companhia do Papel)',
  cnpj: '00.397.452/0001-59',
  address: 'Rua Humaitá, 895, Sala 05/06/07 — Kennedy, Londrina/PR — CEP 86060-060',
  email: 'suporte@labelgo.com.br',
  instagram: 'https://www.instagram.com/labelgo_print/',
};

const FAQS = [
  {
    q: 'O LabelGo é afiliado ao Mercado Livre?',
    a: 'Não. O LabelGo é um produto independente. A conexão usa o acesso oficial do Mercado Livre via OAuth: você autoriza no site deles e o LabelGo nunca vê nem armazena sua senha.',
  },
  {
    q: 'Preciso instalar algum programa para imprimir?',
    a: 'Não para imprimir pelo navegador. Você gera o PDF ou o arquivo ZPL e imprime com a impressora que já tem. A impressão automática é opcional e usa um agente para Windows no plano Completo.',
  },
  {
    q: 'Meus dados e minha senha ficam seguros?',
    a: 'A senha do Mercado Livre nunca passa pelo LabelGo. O acesso é autorizado no site do Mercado Livre e pode ser revogado a qualquer momento. Os dados são tratados conforme a LGPD — veja a Política de Privacidade.',
  },
];

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <nav aria-label="breadcrumb" className="mb-6 text-sm text-muted-foreground flex items-center gap-1.5">
          <Link to="/" className="hover:text-foreground transition-colors">Início</Link>
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-foreground/80">Sobre</span>
        </nav>

        <h1 className="text-3xl font-bold text-foreground mb-4">Sobre o LabelGo</h1>
        <p className="text-xl text-muted-foreground mb-8">
          O LabelGo é um SaaS brasileiro para vendedores do Mercado Livre: conecta sua conta,
          lista os envios prontos e imprime as etiquetas 10x15 em lote — em PDF pelo navegador
          ou em ZPL na impressora térmica.
        </p>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Por que o LabelGo existe</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            A rotina de expedição de quem vende online tem uma etapa repetitiva: abrir pedido por
            pedido para gerar a etiqueta de envio. Em dias de muitas vendas, isso vira horas de
            trabalho operacional — e atrasa o despacho.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            O LabelGo nasceu para tirar essa etapa do caminho: reunir os envios prontos em uma
            única tela, selecionar vários de uma vez e gerar todas as etiquetas em um PDF — ou
            enviar o ZPL direto para a impressora térmica. Sem instalar nada para imprimir pelo
            navegador.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Como funciona</h2>
          <ol className="list-decimal pl-5 space-y-2 text-muted-foreground leading-relaxed">
            <li>Você conecta sua conta do Mercado Livre pela conexão oficial (OAuth).</li>
            <li>Os envios prontos para impressão aparecem em uma única tela.</li>
            <li>Você seleciona um ou vários envios e o LabelGo gera um PDF único.</li>
            <li>
              Imprime em qualquer impressora ou envia o ZPL para a térmica. No plano Completo,
              o agente opcional para Windows imprime automaticamente.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Quem está por trás</h2>
          <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col sm:flex-row gap-4 sm:items-start">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-lg font-bold">
              VG
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Vinicius Guarda</h3>
              <p className="text-sm text-muted-foreground">Fundador do LabelGo</p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                O LabelGo é um produto da Guarda &amp; Guarda Ltda (Companhia do Papel), empresa
                brasileira com sede em Londrina/PR. A ideia nasceu da rotina de quem vende no
                Mercado Livre: menos tempo no operacional, mais tempo para vender.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Nossos compromissos</h2>
          <ul className="space-y-3 text-muted-foreground leading-relaxed">
            <li className="flex gap-3">
              <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Conexão segura.</strong> O acesso é autorizado
                no site do Mercado Livre via OAuth oficial. Sua senha nunca passa pelo LabelGo.
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Sem fidelidade.</strong> Você cancela quando
                quiser direto no painel. O acesso continua até o fim do período já pago.
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Transparência.</strong> O LabelGo não é
                afiliado ao Mercado Livre. Os dados são tratados conforme a LGPD e a nossa{' '}
                <Link to="/privacidade/" className="text-primary font-medium hover:underline">
                  Política de Privacidade
                </Link>.
              </span>
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Dados da empresa</h2>
          <dl className="bg-surface border border-border rounded-2xl p-6 grid sm:grid-cols-[160px_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="font-semibold text-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" /> Razão social
            </dt>
            <dd className="text-muted-foreground">{COMPANY.legalName}</dd>
            <dt className="font-semibold text-foreground">CNPJ</dt>
            <dd className="text-muted-foreground">{COMPANY.cnpj}</dd>
            <dt className="font-semibold text-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" /> Endereço
            </dt>
            <dd className="text-muted-foreground">{COMPANY.address}</dd>
            <dt className="font-semibold text-foreground flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" /> Atendimento
            </dt>
            <dd className="text-muted-foreground">
              <a href={`mailto:${COMPANY.email}`} className="text-primary font-medium hover:underline">
                {COMPANY.email}
              </a>
            </dd>
            <dt className="font-semibold text-foreground">Instagram</dt>
            <dd className="text-muted-foreground">
              <a
                href={COMPANY.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium hover:underline"
              >
                @labelgo_print
              </a>
            </dd>
          </dl>
        </section>

        <section className="mb-10" aria-labelledby="about-faq-title">
          <h2 id="about-faq-title" className="text-xl font-semibold text-foreground mb-4">
            Perguntas frequentes
          </h2>
          <div className="space-y-5">
            {FAQS.map((faq) => (
              <div key={faq.q}>
                <h3 className="font-semibold text-foreground">{faq.q}</h3>
                <p className="mt-1 text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <nav className="border-t border-border pt-8 mb-8" aria-label="Páginas relacionadas">
          <h2 className="text-lg font-semibold text-foreground mb-4">Veja também</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {[
              { href: '/pricing/', title: 'Planos e preços', desc: 'Teste grátis por 7 dias, sem cartão' },
              { href: '/etiqueta-mercado-livre/', title: 'Etiqueta Mercado Livre', desc: 'Como gerar e imprimir a etiqueta' },
              { href: '/imprimir-etiquetas-em-lote/', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
              { href: '/impressora-termica-mercado-livre/', title: 'Impressora térmica', desc: 'O que verificar antes de comprar' },
            ].map((link) => (
              <li key={link.href}>
                <Link
                  to={link.href}
                  className="block bg-surface border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all"
                >
                  <span className="block font-semibold text-foreground text-sm">{link.title}</span>
                  <span className="block text-muted-foreground text-sm mt-1">{link.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="bg-primary rounded-2xl p-6 text-white text-center">
          <h2 className="text-xl font-bold mb-2">Pronto para imprimir sem trabalho manual?</h2>
          <p className="text-white/80 mb-4">
            Conecte seu Mercado Livre ao LabelGo e imprima etiquetas em segundos.
          </p>
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
