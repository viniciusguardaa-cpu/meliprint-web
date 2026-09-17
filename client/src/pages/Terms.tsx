import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto bg-surface rounded-2xl border border-border shadow-sm p-8">
        <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: 17 de setembro de 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Sobre o serviço</h2>
            <p>
              O LabelGo ("nós", "nosso" ou "serviço") é uma plataforma que permite a impressão
              rápida de etiquetas de envio do Mercado Livre em formato ZPL/PDF, oferecida por{' '}
              <strong>[RAZÃO SOCIAL DA EMPRESA]</strong>, inscrita no CNPJ sob o nº{' '}
              <strong>[CNPJ]</strong>, com sede em <strong>[ENDEREÇO]</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Cadastro e acesso</h2>
            <p>
              O acesso ao LabelGo é feito exclusivamente através de login com sua conta do
              Mercado Livre (OAuth). Ao autorizar o acesso, você declara ser o legítimo
              titular ou representante autorizado da conta de vendedor conectada.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Assinatura e pagamento</h2>
            <p>
              O uso completo da plataforma requer uma assinatura mensal no valor vigente
              exibido na página de planos, cobrada automaticamente via Mercado Pago até que
              seja cancelada. O cancelamento pode ser feito a qualquer momento na área
              "Minha Assinatura", e o acesso permanece ativo até o fim do período já pago.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Uso permitido</h2>
            <p>
              Você concorda em usar o LabelGo apenas para gerar etiquetas e documentos
              fiscais relacionados aos seus próprios envios no Mercado Livre, não sendo
              permitido o uso para fins ilícitos ou para acessar dados de contas de
              terceiros sem autorização.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Limitação de responsabilidade</h2>
            <p>
              O LabelGo depende de APIs de terceiros (Mercado Livre e Mercado Pago) para
              funcionar. Não nos responsabilizamos por indisponibilidades, alterações ou
              falhas nesses serviços que estejam fora do nosso controle.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Cancelamento e reembolso</h2>
            <p>
              Assinaturas podem ser canceladas a qualquer momento na área "Minha Assinatura",
              sem multa ou fidelidade, e o acesso permanece ativo até o fim do período já pago.
              Conforme o art. 49 do Código de Defesa do Consumidor, você pode solicitar o
              reembolso integral em até 7 (sete) dias corridos após a primeira contratação.
              Após esse prazo, não há reembolso proporcional de períodos já pagos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Contato</h2>
            <p>
              Dúvidas sobre estes Termos podem ser enviadas para{' '}
              <strong>suporte@labelgo.com.br</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
