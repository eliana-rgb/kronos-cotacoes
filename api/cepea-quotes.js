// api/cepea-quotes.js - Vercel Serverless Function - FIXED v5 (dolar COMERCIAL via AwesomeAPI + fallback PTAX)

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
  dolar:   { price:   5.09, variation:  0.00, unit: 'comercial',  source: 'AwesomeAPI' },
};

async function buscarCommodity(nome) {
  try {
    const html = await fetchWithTimeout(URLS[nome]);
    const parsed = parseTabela(html);
    if (parsed && parsed.price) return parsed;
  } catch (e) {}
  return null;
}

// FONTE PRIMARIA: Dolar COMERCIAL em tempo real via AwesomeAPI.
async function buscarDolarComercial() {
  try {
    const url = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!resp.ok) return null;
    const json = await resp.json();
    const d = json && json.USDBRL;
    if (!d) return null;
    const ask = Number(d.ask);
    const pct = Number(d.pctChange);
    if (ask > 0) {
      return { price: ask, variation: isFinite(pct) ? pct : 0, unit: 'comercial', source: 'AwesomeAPI' };
    }
  } catch (e) {}
  return null;
}

// FALLBACK: PTAX de Fechamento do Banco Central.
async function buscarDolarPTAX() {
  try {
    const hoje = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const dataStr = `${mm}-${dd}-${yyyy}`;

      const filter = encodeURIComponent("tipoBoletim eq 'Fechamento'");
      const orderby = encodeURIComponent('dataHoraCotacao desc');
      const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dataStr}'&$filter=${filter}&$orderby=${orderby}&$top=1&$format=json&$select=cotacaoVenda,cotacaoCompra,dataHoraCotacao,tipoBoletim`;

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!resp.ok) continue;
        const json = await resp.json();
        const items = json && json.value;
        if (items && items.length > 0) {
          const venda = Number(items[0].cotacaoVenda);
          if (venda > 0) {
            return { price: venda, variation: 0, unit: 'comercial', source: 'BCB/PTAX' };
          }
        }
      } catch (e) {
        clearTimeout(id);
      }
    }
  } catch (e) {}
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let dolar = { ...FALLBACK.dolar };
  try {
    const comercial = await buscarDolarComercial();
    if (comercial && comercial.price > 0) {
      dolar = comercial;
    } else {
      const ptax = await buscarDolarPTAX();
      if (ptax && ptax.price > 0) {
        dolar = ptax;
      }
    }
  } catch (e) {}

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
