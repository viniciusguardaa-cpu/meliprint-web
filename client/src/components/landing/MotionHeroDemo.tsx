import { Check, FileText, Printer, MousePointer2 } from 'lucide-react';
import './motionHeroDemo.css';

const SHIPMENTS = [
  { id: '#4829173', city: 'São Paulo' },
  { id: '#4829158', city: 'Curitiba' },
  { id: '#4829141', city: 'Belo Horizonte' },
];

/** Illustrative animation of the existing dashboard's manual select-all and print flow. */
export default function MotionHeroDemo() {
  return (
    <div className="motion-demo" aria-label="Demonstração: clique em Selecionar todos, depois em Imprimir para reunir três etiquetas em um PDF">
      <div className="motion-demo__window">
        <div className="motion-demo__chrome">
          <span className="motion-demo__dots"><i /><i /><i /></span>
          <span>labelgo.com.br/dashboard</span>
        </div>
        <div className="motion-demo__heading">
          <span className="motion-demo__mark">Label<span>Go</span></span>
          <span className="motion-demo__market">Mercado Livre</span>
        </div>
        <div className="motion-demo__body">
          <div className="motion-demo__toolbar">
            <span className="motion-demo__select"><Check size={13} /> Selecionar todos <MousePointer2 className="motion-demo__cursor" size={18} /></span>
            <span className="motion-demo__print"><Printer size={14} /> Imprimir <span className="motion-demo__count motion-demo__count--zero">(0)</span><span className="motion-demo__count motion-demo__count--one">(1)</span><span className="motion-demo__count motion-demo__count--two">(2)</span><span className="motion-demo__count motion-demo__count--three">(3)</span></span>
          </div>
          <div className="motion-demo__table">
            <div className="motion-demo__table-head"><span>Envio</span><span>Destino</span><span>Status</span></div>
            {SHIPMENTS.map((s, i) => (
              <div className="motion-demo__row" key={s.id}>
                <span className="motion-demo__row-id"><span className={`motion-demo__check motion-demo__check--${i + 1}`}><Check size={12} strokeWidth={3} /></span>{s.id}</span>
                <span>{s.city}</span><span className="motion-demo__ready">Pronto</span>
              </div>
            ))}
          </div>
          <p className="motion-demo__hint">Selecione os envios prontos. Depois, imprima em lote.</p>
        </div>
      </div>
      <div className="motion-demo__output" aria-hidden="true">
        <div className="motion-demo__pdf"><FileText size={30} strokeWidth={1.6} /><strong>1 PDF</strong><small>3 etiquetas</small></div>
        <div className="motion-demo__printer"><span className="motion-demo__light" /><span className="motion-demo__slot" /><span className="motion-demo__paper"><span /><span /><span /></span></div>
      </div>
      <p className="motion-demo__caption">Demonstração ilustrativa. Seleção e impressão são feitas por você.</p>
    </div>
  );
}
