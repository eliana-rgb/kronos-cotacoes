// api/cepea-quotes.js - Vercel Serverless Function - FIXED PARSER v2

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

// Extrai dados da primeira tabela de cotação da página do noticiasagricolas.
// O problema anterior: o dólar (R$ 5,17 -0,21%) aparece no HEADER da página
// antes da tabela, então o regex antigo pegava o dólar para todos.
// Solução: localizar "Fechamento:" no HTML e só então extrair as células <td>.
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

  // Tabela: [data, valor, variação]
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
  dolar:   { price:   5.17, variation: -0.21, unit: 'comercial',  source: 'B3' },
};

async function buscarCommodity(nome) {
  try {
    const html = await fetchWithTimeout(URLS[nome]);
    const parsed = parseTabela(html);
    if (parsed && parsed.price) return parsed;
  } catch (e) {}
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=1800');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Dólar via AwesomeAPI
  let dolar = { ...FALLBACK.dolar };
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    if (r.ok) {
      const d = await r.json();
      dolar.price = Number(Number(d.USDBRL.bid).toFixed(2));
      dolar.variation = Number(Number(d.USDBRL.pctChange).toFixed(2));
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
