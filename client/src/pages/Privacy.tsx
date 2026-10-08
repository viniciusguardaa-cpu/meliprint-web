import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto bg-surface rounded-2xl border border-border shadow-sm p-8">
        <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: 8 de outubro de 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Quem somos</h2>
            <p>
              Esta Política de Privacidade descreve como <strong>[RAZÃO SOCIAL DA EMPRESA]</strong>
              {' '}(CNPJ <strong>[CNPJ]</strong>), responsável pelo LabelGo, coleta, usa e protege
              seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados
              (Lei nº 13.709/2018 - LGPD).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Dados que coletamos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dados da sua conta do Mercado Livre (ID, nickname e email), obtidos via login OAuth.</li>
              <li>Dados de envios e pedidos necessários para gerar as etiquetas (via API do Mercado Livre).</li>
              <li>Dados de pagamento e status de assinatura, processados pelo Mercado Pago (não armazenamos dados de cartão).</li>
              <li>Dados técnicos de uso (logs de erro, endereço IP) para segurança e diagnóstico.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Como usamos seus dados</h2>
            <p>
              Usamos seus dados para: autenticar seu acesso, buscar seus
              envios prontos para impressão, gerar etiquetas/documentos fiscais, processar
              sua assinatura e melhorar a plataforma. Não vendemos seus dados a terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Compartilhamento com terceiros</h2>
            <p>
              Compartilhamos dados com os provedores necessários para o funcionamento
              do serviço: Mercado Livre (autenticação e dados de envio), Mercado Pago
              (processamento de pagamento), Labelary (conversão de etiquetas ZPL em PDF) e
              provedores de infraestrutura (hospedagem e banco de dados).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Publicidade opcional: Pixel da Meta</h2>
            <p>Somente após aceitar cookies de publicidade, o Pixel da Meta recebe eventos de visitas às páginas públicas, criação de conta, início de teste gratuito e ativação de assinatura. Não enviamos nomes, e-mails, dados de pedidos ou etiquetas nos parâmetros desses eventos e não usamos correspondência avançada automática. O Pixel pode receber informações técnicas como IP, navegador, endereço da página e identificadores de cookies para medir anúncios e formar públicos. A Meta pode tratar dados fora do Brasil conforme sua política.</p>
            <p>Você pode recusar ou revogar essa permissão pelo botão "Cookies de publicidade", sem perder acesso ao serviço. A revogação bloqueia novos eventos; não apaga dados já recebidos pela Meta. Este controle se aplica ao novo Pixel da Meta; outros recursos técnicos e medições já existentes no site precisam de avaliação própria.</p>
            <p><a href="https://www.facebook.com/privacy/policy/" className="underline" target="_blank" rel="noreferrer">Política de Privacidade da Meta</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Retenção e exclusão</h2>
            <p>
              Mantemos seus dados enquanto sua conta estiver ativa. Você pode solicitar a
              exclusão dos seus dados a qualquer momento entrando em contato pelo email{' '}
              <strong>suporte@labelgo.com.br</strong>, respeitando obrigações legais de guarda
              de dados fiscais quando aplicável.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Seus direitos (LGPD)</h2>
            <p>
              Você tem direito a confirmar a existência de tratamento, acessar, corrigir,
              anonimizar, eliminar ou solicitar a portabilidade dos seus dados, bem como
              revogar o consentimento a qualquer momento, entrando em contato pelo email
              acima.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Segurança</h2>
            <p>
              Adotamos medidas técnicas razoáveis para proteger seus dados, incluindo
              conexões criptografadas (HTTPS), armazenamento de sessão seguro e controle de
              acesso por chave a áreas administrativas.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Contato</h2>
            <p>
              Para exercer seus direitos ou tirar dúvidas sobre esta política, contate{' '}
              <strong>suporte@labelgo.com.br</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
