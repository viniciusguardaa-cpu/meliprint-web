import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-md p-8">
        <Link to="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Política de Privacidade</h1>
        <p className="text-sm text-gray-400 mb-8">Última atualização: [DATA]</p>

        <div className="prose prose-sm max-w-none text-gray-700 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Quem somos</h2>
            <p>
              Esta Política de Privacidade descreve como <strong>[RAZÃO SOCIAL DA EMPRESA]</strong>
              {' '}(CNPJ <strong>[CNPJ]</strong>), responsável pelo Printly, coleta, usa e protege
              seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados
              (Lei nº 13.709/2018 - LGPD).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Dados que coletamos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dados da sua conta do Mercado Livre (ID, nickname e email), obtidos via login OAuth.</li>
              <li>Dados de envios e pedidos necessários para gerar as etiquetas (via API do Mercado Livre).</li>
              <li>Dados de pagamento e status de assinatura, processados pelo Mercado Pago (não armazenamos dados de cartão).</li>
              <li>Dados técnicos de uso (logs de erro, endereço IP) para segurança e diagnóstico.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Como usamos seus dados</h2>
            <p>
              Usamos seus dados exclusivamente para: autenticar seu acesso, buscar seus
              envios prontos para impressão, gerar etiquetas/documentos fiscais, processar
              sua assinatura e melhorar a plataforma. Não vendemos seus dados a terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Compartilhamento com terceiros</h2>
            <p>
              Compartilhamos dados apenas com os provedores necessários para o funcionamento
              do serviço: Mercado Livre (autenticação e dados de envio), Mercado Pago
              (processamento de pagamento), Labelary (conversão de etiquetas ZPL em PDF) e
              provedores de infraestrutura (hospedagem e banco de dados).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Retenção e exclusão</h2>
            <p>
              Mantemos seus dados enquanto sua conta estiver ativa. Você pode solicitar a
              exclusão dos seus dados a qualquer momento entrando em contato pelo email{' '}
              <strong>[EMAIL DE SUPORTE]</strong>, respeitando obrigações legais de guarda
              de dados fiscais quando aplicável.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Seus direitos (LGPD)</h2>
            <p>
              Você tem direito a confirmar a existência de tratamento, acessar, corrigir,
              anonimizar, eliminar ou solicitar a portabilidade dos seus dados, bem como
              revogar o consentimento a qualquer momento, entrando em contato pelo email
              acima.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Segurança</h2>
            <p>
              Adotamos medidas técnicas razoáveis para proteger seus dados, incluindo
              conexões criptografadas (HTTPS), armazenamento de sessão seguro e controle de
              acesso por chave a áreas administrativas.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Contato</h2>
            <p>
              Para exercer seus direitos ou tirar dúvidas sobre esta política, contate{' '}
              <strong>[EMAIL DE SUPORTE / DPO]</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
