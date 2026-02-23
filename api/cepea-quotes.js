// api/cepea-quotes.js - Vercel Serverless Function
// Fontes: AwesomeAPI (dólar) + scraping CEPEA com User-Agent real

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Referer': 'https://www.google.com/',
};

// Fallback com valores recentes (usados apenas se TUDO falhar)
const FALLBACK = {
  soja:    { price: 140.93, variation: -0.54, unit: 'saca 60kg',  source: 'CEPEA/Esalq' },
  milho:   { price: 67.67,  variation:  0.04, unit: 'saca 60kg',  source: 'CEPEA/Esalq' },
  boi:     { price: 322.45, variation:  0.30, unit: '@',           source: 'CEPEA/Esalq' },
  algodao: { price: 345.60, variation:  0.19, unit: 'cent R$/lb', source: 'CEPEA/Esalq' },
  cafe:    { price: 2181.70,variation: -2.26, unit: 'saca 60kg',  source: 'CEPEA/Esalq' },
  dolar:   { price: 5.72,   variation:  0.30, unit: 'comercial',  source: 'B3' },
};

function parseNumberBR(str) {
  if (!str) return null;
  const cleaned = str.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

// Tenta extrair preço e variação do HTML do noticiasagricolas
function parsePrimeiraLinha(html) {
  // Remove tags HTML
  const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  // Padrão: data + valor + variação%
  // Ex: "23/02/2026 140,93 -0,54%"
  const regex = /(\d{2}\/\d{2}\/\d{4})\s+([\d\.]+,\d+)\s+([-+]?[\d,]+)%/;
  const m = texto.match(regex);
  if (m) {
    return {
      date: m[1],
      price: parseNumberBR(m[2]),
      variation: parseNumberBR(m[3]),
    };
  }

  // Padrão alternativo sem data: apenas valor e %
  const regex2 = /([\d\.]+,\d{2})\s+([-+]?[\d,]+)%/;
  const m2 = texto.match(regex2);
  if (m2) {
    return {
      price: parseNumberBR(m2[1]),
      variation: parseNumberBR(m2[2]),
    };
  }

  return null;
}

// Scraping com timeout
async function fetchWithTimeout(url, ms = 8000) {
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

// Busca cotação de um commodity
async function buscarCommodity(nome) {
  const urls = {
    soja:    'https://www.noticiasagricolas.com.br/cotacoes/soja/indicador-cepea-esalq-soja-parana',
    milho:   'https://www.noticiasagricolas.com.br/cotacoes/milho/indicador-cepea-esalq-milho',
    boi:     'https://www.noticiasagricolas.com.br/cotacoes/boi-gordo/boi-gordo-indicador-esalq-bmf',
    algodao: 'https://www.noticiasagricolas.com.br/cotacoes/algodao/algodao-indicador-cepea-esalq-a-prazo',
    cafe:    'https://www.noticiasagricolas.com.br/cotacoes/cafe/indicador-cepea-esalq-cafe-arabica',
  };

  // Fonte alternativa: CEPEA direto
  const urlsCepea = {
    soja:    'https://www.cepea.esalq.usp.br/br/indicador/soja.aspx',
    milho:   'https://www.cepea.esalq.usp.br/br/indicador/milho.aspx',
    boi:     'https://www.cepea.esalq.usp.br/br/indicador/boi-gordo.aspx',
    algodao: 'https://www.cepea.esalq.usp.br/br/indicador/algodao.aspx',
    cafe:    'https://www.cepea.esalq.usp.br/br/indicador/cafe.aspx',
  };

  // Tenta noticiasagricolas primeiro
  try {
    const html = await fetchWithTimeout(urls[nome]);
    const parsed = parsePrimeiraLinha(html);
    if (parsed && parsed.price) return parsed;
  } catch (e) {
    // Falhou, tenta CEPEA direto
  }

  // Tenta CEPEA direto
  try {
    const html = await fetchWithTimeout(urlsCepea[nome]);
    const parsed = parsePrimeiraLinha(html);
    if (parsed && parsed.price) return parsed;
  } catch (e) {
    // Também falhou
  }

  return null; // Vai usar fallback
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=1800'); // Cache 30min na Vercel

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ---- DÓLAR ----
  let dolar = { ...FALLBACK.dolar };
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    if (r.ok) {
      const d = await r.json();
      dolar.price = Number(Number(d.USDBRL.bid).toFixed(2));
      dolar.variation = Number(Number(d.USDBRL.pctChange).toFixed(2));
    }
  } catch (e) {}

  // ---- COMMODITIES (paralelo) ----
  const nomes = ['soja', 'milho', 'boi', 'algodao', 'cafe'];
  const unidades = {
    soja: 'saca 60kg', milho: 'saca 60kg', boi: '@',
    algodao: 'cent R$/lb', cafe: 'saca 60kg',
  };

  const resultados = await Promise.allSettled(nomes.map(n => buscarCommodity(n)));

  const dados = {};
  nomes.forEach((nome, i) => {
    const r = resultados[i];
    if (r.status === 'fulfilled' && r.value && r.value.price) {
      dados[nome] = {
        price: r.value.price,
        variation: r.value.variation ?? 0,
        unit: unidades[nome],
        source: 'CEPEA/Esalq',
      };
    } else {
      // Usa fallback individual — não derruba tudo
      dados[nome] = { ...FALLBACK[nome] };
    }
  });

  return res.status(200).json({ ...dados, dolar });
}
