// api/cepea-quotes.js - Vercel Serverless Function - FIXED PARSER v3 (dólar BCB/PTAX)

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Referer': 'https://www.google.com/',
};

function parseNumberBR(str) {
  if (!str) return null;
  const cleaned = str.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function parseTabela(html) {
  const idx = html.indexOf('Fechamento:');
  if (idx === -1) return null;
  const htmlRecortado = html.slice(idx);

  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const tds = [];
  let m;
  let count = 0;
  while ((m = tdRegex.exec(htmlRecortado)) !== null && count < 20) {
    const texto = m[1].replace(/<[^>]+>/g, '').trim();
    if (texto) tds.push(texto);
    count++;
  }

  if (tds.length < 3) return null;

  const valor = parseNumberBR(tds[1]);
  const varStr = tds[2].replace('+', '');
  const variacao = parseNumberBR(varStr);

  if (!valor) return null;
  return { price: valor, variation: variacao ?? 0, date: tds[0] };
}

async function fetchWithTimeout(url, ms = 9000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { headers: HEADERS, signal: controller.signal });
    const text = await resp.text();
    clearTimeout(id);
    return text;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

const URLS = {
  soja:    'https://www.noticiasagricolas.com.br/cotacoes/soja/indicador-cepea-esalq-soja-parana',
  milho:   'https://www.noticiasagricolas.com.br/cotacoes/milho/indicador-cepea-esalq-milho',
  boi:     'https://www.noticiasagricolas.com.br/cotacoes/boi-gordo/boi-gordo-indicador-esalq-bmf',
  algodao: 'https://www.noticiasagricolas.com.br/cotacoes/algodao/algodao-indicador-cepea-esalq-a-prazo',
  cafe:    'https://www.noticiasagricolas.com.br/cotacoes/cafe/indicador-cepea-esalq-cafe-arabica',
};

const UNIDADES = {
  soja: 'saca 60kg', milho: 'saca 60kg', boi: '@',
  algodao: 'cent R$/lb', cafe: 'saca 60kg',
};

const FALLBACK = {
  soja:    { price: 121.30, variation:  0.04, unit: 'saca 60kg',  source: 'CEPEA/Esalq' },
  milho:   { price:  67.67, variation:  0.04, unit: 'saca 60kg',  source: 'CEPEA/Esalq' },
  boi:     { price: 322.45, variation:  0.30, unit: '@',          source: 'CEPEA/Esalq' },
  algodao: { price: 345.60, variation:  0.19, unit: 'cent R$/lb', source: 'CEPEA/Esalq' },
  cafe:    { price:2181.70, variation: -2.26, unit: 'saca 60kg',  source: 'CEPEA/Esalq' },
  dolar:   { price:   5.72, variation:  0.00, unit: 'comercial',  source: 'BCB/PTAX' },
};

async function buscarCommodity(nome) {
  try {
    const html = await fetchWithTimeout(URLS[nome]);
    const parsed = parseTabela(html);
    if (parsed && parsed.price) return parsed;
  } catch (e) {}
  return null;
}

// Busca cotação do dólar PTAX no Banco Central do Brasil
// Usa a cotação de venda do último dia útil disponível
async function buscarDolar() {
  try {
    // Tenta os últimos 5 dias para garantir pegar o último dia útil
    const hoje = new Date();
    for (let i = 0; i < 5; i++) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const dataStr = `${mm}-${dd}-${yyyy}`; // formato MM-DD-YYYY para BCB

      const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dataStr}'&$top=1&$format=json&$select=cotacaoVenda,cotacaoCompra`;

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!resp.ok) continue;
        const json = await resp.json();
        const items = json?.value;
        if (items && items.length > 0) {
          const venda = Number(items[0].cotacaoVenda);
          const compra = Number(items[0].cotacaoCompra);
          if (venda > 0) {
            // Calcula variação aproximada entre compra e venda como proxy
            // (BCB PTAX não fornece variação direta nesse endpoint)
            return { price: venda, variation: null, unit: 'comercial', source: 'BCB/PTAX' };
          }
        }
      } catch (e) {
        clearTimeout(id);
      }
    }
  } catch (e) {}
  return null;
}

// Busca variação do dólar via API de séries temporais do BCB (série 1)
// Série 1 = Taxa de câmbio - Livre - Dólar americano (venda) - diária
async function buscarVariacaoDolar(precoAtual) {
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/2?formato=json`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!resp.ok) return 0;
    const dados = await resp.json();
    if (dados.length >= 2) {
      const anterior = Number(dados[dados.length - 2].valor);
      const atual = Number(dados[dados.length - 1].valor);
      if (anterior > 0 && atual > 0) {
        const variacao = Number(((atual - anterior) / anterior * 100).toFixed(2));
        return variacao;
      }
    }
  } catch (e) {}
  return 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=1800');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Dólar via BCB/PTAX
  let dolar = { ...FALLBACK.dolar };
  try {
    const [ptax, variacao] = await Promise.all([
      buscarDolar(),
      buscarVariacaoDolar(null),
    ]);
    if (ptax && ptax.price > 0) {
      dolar.price = ptax.price;
      dolar.variation = variacao ?? 0;
    }
  } catch (e) {}

  // Commodities em paralelo
  const nomes = ['soja', 'milho', 'boi', 'algodao', 'cafe'];
  const resultados = await Promise.allSettled(nomes.map(n => buscarCommodity(n)));

  const dados = {};
  nomes.forEach((nome, i) => {
    const r = resultados[i];
    if (r.status === 'fulfilled' && r.value && r.value.price) {
      dados[nome] = {
        price: r.value.price,
        variation: r.value.variation ?? 0,
        unit: UNIDADES[nome],
        source: 'CEPEA/Esalq',
      };
    } else {
      dados[nome] = { ...FALLBACK[nome] };
    }
  });

  return res.status(200).json({ ...dados, dolar });
}
