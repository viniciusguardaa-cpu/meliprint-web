import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowRight, Printer, Zap, Clock, Shield } from 'lucide-react';
import Header from '../components/Header';

interface SeoPageProps {
  title: string;
  description: string;
  h1: string;
  sections: { heading: string; body: string }[];
  cta?: boolean;
}

export default function SeoPage({ title, description, h1, sections, cta = true }: SeoPageProps) {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{h1}</h1>
        <p className="text-xl text-gray-600 mb-8">{description}</p>

        {sections.map((section, i) => (
          <section key={i} className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{section.heading}</h2>
            <p className="text-gray-600 leading-relaxed">{section.body}</p>
          </section>
        ))}

        {cta && (
          <div className="bg-gradient-to-r from-brand-500 to-brand-600 rounded-2xl p-6 text-white text-center mt-8">
            <h2 className="text-xl font-bold mb-2">Pronto para automatizar sua expedição?</h2>
            <p className="text-blue-100 mb-4">
              Conecte seu Mercado Livre ao LabelGo e imprima etiquetas em segundos.
            </p>
            <button
              onClick={() => navigate('/pricing')}
              className="bg-white text-brand-600 font-semibold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors inline-flex items-center gap-2"
            >
              Testar grátis por 7 dias
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-6 text-gray-400 text-sm">
          <div className="flex items-center gap-2"><Zap className="w-4 h-4" /> Rápido</div>
          <div className="flex items-center gap-2"><Shield className="w-4 h-4" /> Seguro</div>
          <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> Sem fidelidade</div>
          <div className="flex items-center gap-2"><Printer className="w-4 h-4" /> ZPL + PDF</div>
        </div>
      </main>
    </div>
  );
}
