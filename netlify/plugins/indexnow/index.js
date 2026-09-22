/**
 * Após cada deploy de produção, envia as URLs do sitemap ao IndexNow
 * (https://www.indexnow.org) — protocolo compartilhado por Bing, Yandex,
 * Seznam, Naver e Yep: uma única chamada notifica todos eles.
 *
 * A chave é o arquivo client/public/<key>.txt (publicado na raiz do site),
 * que prova a posse do domínio. Falhas nunca quebram o deploy.
 */
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const HOST = 'labelgo.com.br';

module.exports = {
  async onSuccess({ constants, utils }) {
    if (process.env.CONTEXT !== 'production') return;

    try {
      const publishDir = constants.PUBLISH_DIR;
      const keyFile = readdirSync(publishDir).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
      if (!keyFile) return utils.status.show({ summary: 'IndexNow: arquivo de chave não encontrado' });
      const key = keyFile.slice(0, -4);

      const sitemap = readFileSync(join(publishDir, 'sitemap.xml'), 'utf8');
      const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }),
      });
      utils.status.show({ summary: `IndexNow: ${urlList.length} URLs enviadas (HTTP ${res.status})` });
    } catch (err) {
      console.warn('IndexNow falhou (deploy segue normalmente):', err);
    }
  },
};
