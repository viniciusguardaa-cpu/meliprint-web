const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const pages = [
  {
    lang: 'PT', title: ['Política de Segurança', 'da Informação'], subtitle: 'Versão 1.0 - Vigência: 28 de novembro de 2026',
    note: 'Política aprovada por Vinicius Guarda, pela direção, em 28 de novembro de 2026. Primeira edição. Estabelece as diretrizes adotadas pelo LabelGo a partir desta data; não representa certificação ou auditoria independente.',
    sections: [
      ['1. Objetivo e abrangência', 'Proteger a confidencialidade, a integridade e a disponibilidade das informações tratadas pelo LabelGo, operado por Guarda & Guarda Ltda (Companhia do Papel), CNPJ 00.397.452/0001-59. Aplicar esta política à aplicação web, ao banco de dados, às integrações de marketplaces, aos agentes locais e às pessoas autorizadas a operar ou manter o serviço.'],
      ['2. Responsabilidades', 'A direção aprova a política, os responsáveis e as exceções. A equipe técnica implementa e mantém os controles e registra correções. O responsável por proteção de dados acompanha solicitações e a comunicação de incidentes. Cada operador deve preservar credenciais e acessar somente os dados necessários à sua função. O canal institucional é suporte@labelgo.com.br.'],
      ['3. Tratamento e fornecedores', 'O LabelGo recebe dados de contas autorizadas, pedidos, pacotes, destinatários e etiquetas para exibição e impressão. Utiliza as APIs dos marketplaces conectados, incluindo Mercado Livre, Shopee e TikTok Shop quando habilitado. O uso do Tiny ERP pelo vendedor não elimina o tratamento realizado pelo LabelGo. No ambiente inspecionado, aplicação e PostgreSQL estão na região US East (Virgínia, EUA) do Railway; a impressão local ocorre no dispositivo do cliente, no Brasil.'],
      ['4. Classificação e minimização', 'Classificar materiais públicos como públicos; procedimentos operacionais como internos; dados pessoais, pedidos e etiquetas como confidenciais; senhas, chaves e tokens como acesso restrito. Coletar e compartilhar apenas o necessário à finalidade autorizada. Não incluir dados reais de compradores em demonstrações públicas ou documentos de suporte sem necessidade e autorização apropriada.'],
      ['5. Identidade e acesso', 'Aplicar o privilégio mínimo, contas individuais e revisão de acessos quando houver mudança de função ou desligamento. Proteger contas administrativas com autenticação em duas etapas. Usar OAuth para autorização das lojas e validar o vínculo entre usuário, loja, etiqueta e trabalho de impressão. Preservar o isolamento entre clientes e lojas. O agente local utiliza credencial vinculada à conta e a impressora configurada pelo cliente.']
    ]
  },
  {
    lang: 'PT', title: ['Controles e governança'], subtitle: 'Continuação da política - português',
    sections: [
      ['6. Criptografia, segredos e rede', 'Usar HTTPS nas interfaces públicas e proteger dados confidenciais em trânsito e em repouso conforme a camada de armazenamento. O código do LabelGo utiliza AES-256-GCM para tokens de acesso e renovação dos marketplaces; esta política não afirma criptografia de todos os campos na camada da aplicação. Segredos de produção não devem constar no repositório ou em materiais públicos. Manter o banco em rede privada, acesso de manutenção autorizado e medidas de monitoramento e prevenção de ameaças. Registrar a proteção e a localização dos demais armazenamentos no inventário técnico.'],
      ['7. Dispositivos, mudanças e vulnerabilidades', 'Manter proteção antimalware ativa nos computadores da empresa, bloqueio de tela, senhas individuais e autenticação em duas etapas, conforme os controles confirmados pelo responsável. Avaliar mudanças relevantes antes de disponibilizá-las. Registrar vulnerabilidades identificadas, avaliar impacto e prioridade e acompanhar a correção. Evitar segredos e dados pessoais desnecessários em registros de diagnóstico. Restringir a consulta a esses registros a pessoas autorizadas.'],
      ['8. Resposta e comunicação de incidentes', 'Ao identificar suspeita de incidente, registrar o evento e comunicar a direção e o responsável por proteção de dados pelo canal institucional. A equipe técnica deve avaliar o impacto, conter o acesso indevido, preservar evidências e corrigir a causa, conforme aplicável. O responsável designado coordena a comunicação ao TikTok Shop, aos vendedores e a outros destinatários exigidos pelas obrigações aplicáveis, usando informações verificadas. Registrar medidas adotadas e revisar o ocorrido. Este procedimento integra esta primeira edição da política, aprovada em 28 de novembro de 2026.'],
      ['9. Direitos, retenção e encerramento', 'Receber solicitações de acesso, correção e exclusão em suporte@labelgo.com.br. Verificar a legitimidade do solicitante e a conta correspondente antes de atender. No encerramento da relação contratual, executar e registrar a exclusão dos dados de clientes, preservando somente registros cuja guarda seja legalmente obrigatória. As exceções devem ter finalidade, responsável e prazo de retenção registrados. A execução pode exigir procedimento manual; não se declara exclusão automática integral pela aplicação. Inventariar cópias e tratar dados residuais conforme o ciclo de retenção documentado.'],
      ['10. Revisão, publicação e aprovação', 'Revisar esta política em mudanças relevantes de serviços, integrações, fornecedores, responsabilidades ou incidentes. Manter versão, data e histórico das alterações, disponibilizando a versão aprovada às pessoas responsáveis e ao público quando necessário. A aprovação deve ser registrada pela direção antes da vigência, da publicação e do envio desta política como documento adotado. Nenhuma certificação ISO, SOC ou equivalente é declarada por este documento.']
    ]
  },
  {
    lang: 'EN', title: ['Information Security', 'Policy'], subtitle: 'Version 1.0 - Effective: 28 November 2026',
    note: 'Approved by Vinicius Guarda on behalf of management on 28 November 2026. First edition. This policy establishes LabelGo requirements from this date; it does not represent certification or an independent audit. English translation of the Portuguese policy.',
    sections: [
      ['1. Purpose and scope', 'Protect the confidentiality, integrity and availability of information processed by LabelGo, operated by Guarda & Guarda Ltda (Companhia do Papel), Brazilian company registration 00.397.452/0001-59. Apply this policy to the web application, database, marketplace integrations, local agents and people authorized to operate or maintain the service.'],
      ['2. Responsibilities', 'Management approves this policy, responsible personnel and exceptions. The technical team implements and maintains controls and records remediation. The data-protection responsible person oversees requests and incident communications. Each operator must safeguard credentials and access only the data needed for their role. The institutional contact is suporte@labelgo.com.br.'],
      ['3. Processing and providers', 'LabelGo receives authorized account, order, package, recipient and label data for display and printing. It uses connected marketplace APIs, including Mercado Livre, Shopee and TikTok Shop when enabled. A seller\'s use of Tiny ERP does not eliminate processing by LabelGo. In the inspected deployment, the web application and PostgreSQL are hosted in Railway US East (Virginia, USA); local printing takes place on the customer\'s device in Brazil.'],
      ['4. Classification and minimization', 'Classify public materials as public; operational procedures as internal; personal data, orders and shipping labels as confidential; and passwords, keys and tokens as restricted. Collect and share only what is necessary for an authorized purpose. Do not include real buyer data in public demonstrations or support documents without a necessary purpose and appropriate authorization.'],
      ['5. Identity and access', 'Apply least privilege, individual accounts and access review when responsibilities change or a person leaves. Protect administrative accounts with two-factor authentication. Use OAuth for shop authorization and validate the relationship between user, shop, shipping label and print job. Preserve isolation between customers and shops. The local agent uses an account-specific credential and the customer-configured printer.']
    ]
  },
  {
    lang: 'EN', title: ['Controls and governance'], subtitle: 'Policy continuation - English',
    sections: [
      ['6. Encryption, secrets and networks', 'Use HTTPS for public interfaces and protect confidential data in transit and at rest according to the storage layer. LabelGo code uses AES-256-GCM for marketplace access and refresh tokens; this policy does not claim application-layer encryption of every data field. Production secrets must not appear in source repositories or public materials. Keep the database on a private network, maintenance access authorized, and network threat monitoring and prevention measures in place. Record protection and locations of other storage in the technical inventory.'],
      ['7. Endpoints, changes and vulnerabilities', 'Maintain active antimalware protection, screen locking, individual passwords and two-factor authentication on company computers/accounts, according to controls confirmed by the owner. Assess relevant changes before release. Record identified vulnerabilities, evaluate impact and priority, and track remediation. Avoid secrets and unnecessary personal data in diagnostic logs. Restrict log access to authorized personnel.'],
      ['8. Incident response and notification', 'On suspected incidents, record the event and notify management and the data-protection responsible person through the institutional contact. The technical team must assess impact, contain unauthorized access, preserve evidence and remediate the cause as applicable. The designated responsible person coordinates notifications to TikTok Shop, sellers and other recipients required by applicable obligations, using verified information. Record actions and review the incident. This procedure forms part of this first policy edition, approved on 28 November 2026.'],
      ['9. Requests, retention and termination', 'Accept access, correction and deletion requests at suporte@labelgo.com.br. Verify the requester\'s legitimacy and account before responding. At contract termination, execute and record deletion of customer data, retaining only records subject to mandatory legal retention. Record the purpose, owner and retention period of each exception. Execution may require a manual procedure; full automatic application deletion is not claimed. Inventory copies and handle residual data according to the documented retention cycle.'],
      ['10. Review, publication and approval', 'Review this policy when services, integrations, providers, responsibilities or incidents materially change. Maintain a version, date and change history, and make the approved version available to responsible personnel and to the public when needed. Management approval must be recorded before the policy becomes effective, is published or is submitted as an adopted document. This document does not assert ISO, SOC or equivalent certification.']
    ]
  }
];

(async () => {
  const outDir = path.join(__dirname, 'output/pdf');
  fs.mkdirSync(outDir, { recursive: true });
  const pdf = await PDFDocument.create();
  pdf.setTitle('LabelGo - Politica de Seguranca da Informacao - v1.0');
  pdf.setAuthor('LabelGo - Guarda & Guarda Ltda');
  pdf.setSubject('Approved information security policy - Portuguese and English - effective 28 November 2026');
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(0.96, 0.25, 0.12), ink = rgb(0.12, 0.15, 0.20), muted = rgb(0.40, 0.44, 0.49);
  const width = 595.28, height = 841.89, left = 48, right = 48, contentWidth = width-left-right;
  function wrap(text, font, size) {
    const lines = []; let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? line+' '+word : word;
      if (font.widthOfTextAtSize(next, size) > contentWidth && line) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line); return lines;
  }
  pages.forEach((spec, index) => {
    const page = pdf.addPage([width,height]); let y = height - 96;
    page.drawRectangle({x:0,y:0,width,height,color:rgb(1,1,1)});
    page.drawText('Label', {x:left,y:height-44,size:21,font:bold,color:ink});
    page.drawText('Go', {x:left+bold.widthOfTextAtSize('Label',21),y:height-44,size:21,font:bold,color:orange});
    const top = spec.lang === 'PT' ? 'SEGURANCA DA INFORMACAO' : 'INFORMATION SECURITY';
    page.drawText(top,{x:width-right-normal.widthOfTextAtSize(top,8.4),y:height-37,size:8.4,font:normal,color:muted});
    page.drawLine({start:{x:left,y:height-60},end:{x:width-right,y:height-60},thickness:1,color:orange});
    for (const title of spec.title) { page.drawText(title,{x:left,y,size:23,font:bold,color:ink}); y -= 27; }
    page.drawText(spec.subtitle,{x:left,y:y-1,size:9,font:normal,color:muted}); y -= 24;
    function para(text, size=10, leading=14) {
      for(const line of wrap(text,normal,size)){ page.drawText(line,{x:left,y,size,font:normal,color:ink}); y-=leading; }
      y-=8;
    }
    if(spec.note) {
      const lines=wrap(spec.note,normal,9.2);
      page.drawRectangle({x:left-8,y:y-lines.length*12.8+2,width:contentWidth+16,height:lines.length*12.8+12,color:rgb(1,0.96,0.92)});
      para(spec.note,9.2,12.8); y-=4;
    }
    for(const [heading,text] of spec.sections){
      page.drawText(heading,{x:left,y,size:10.6,font:bold,color:orange}); y-=16;
      para(text);
    }
    if(y<68) throw new Error('Page '+(index+1)+' exceeds safe layout: '+y);
    page.drawLine({start:{x:left,y:49},end:{x:width-right,y:49},thickness:.5,color:rgb(.82,.84,.86)});
    const footer=spec.lang==='PT'?'VERSAO 1.0 - Aprovada em 28/11/2026':'VERSION 1.0 - Approved on 28 November 2026';
    page.drawText(footer,{x:left,y:34,size:7.6,font:normal,color:muted});
    const pagination=(index+1)+' / '+pages.length;
    page.drawText(pagination,{x:width-right-normal.widthOfTextAtSize(pagination,8),y:34,size:8,font:normal,color:muted});
    console.log('Page '+(index+1)+' bottom content y='+y.toFixed(1));
  });
  const output=path.join(outDir,'LabelGo_Politica_Seguranca_PT_EN.pdf');
  fs.writeFileSync(output,await pdf.save());
  fs.writeFileSync(path.join(__dirname,'policy-content.json'),JSON.stringify(pages,null,2));
  console.log(output);
})();
