// api/cepea-quotes.js - Vercel Serverless Function - v7
// Multi-fonte com diagnostico no header X-Dolar-Diag:
//   1. AwesomeAPI (comercial real-time, br)
//   2. BrasilAPI (comercial via PTAX BCB)
//   3. open.er-api.com (rates do BCE)
//   4. BCB Olinda PTAX direto
//   5. fallback estatico

export const config = { regions: ['gru1'] }; // forca regiao Sao Paulo

const JSON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; KronosAg-Cotacoes/2.0; +https://kronos-ag.com)',
  'Accept': 'application/json',
};

const HEADERS = {
  ...JSON_HEADERS,
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
  const recortado = html.slice(idx);
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const tds = [];
  let m, count = 0;
  while ((m = tdRegex.exec(recortado)) !== null && count < 20) {
    const t = m[1].replace(/<[^>]+>/g, '').trim();
    if (t) tds.push(t);
    count++;
  }
  if (tds.length < 3) return null;
  const valor = parseNumberBR(tds[1]);
  const variacao = parseNumberBR(tds[2].replace('+', ''));
  if (!valor) return null;
  return { price: valor, variation: variacao ?? 0, date: tds[0] };
}

async function fetchText(url, ms = 9000, headers = HEADERS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(id);
    return await r.text();
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchJSON(url, ms = 7000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: JSON_HEADERS, signal: ctrl.signal });
    clearTimeout(id);
    if (!r.ok) return { __err: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    clearTimeout(id);
    return { __err: e.name || 'fetch-error' };
  }
}

const URLS = {
  soja:    'https://www.noticiasagricolas.com.br/cotacoes/soja/indicador-cepea-esalq-soja-parana',
  milho:   'https://www.noticiasagricolas.com.br/cotacoes/milho/indicador-cepea-esalq-milho',
  boi:     'https://www.noticiasagricolas.com.br/cotacoes/boi-gordo/boi-gordo-indicador-esalq-bmf',
  algodao: 'https://www.noticiasagricolas.com.br/cotacoes/algodao/algodao-indicador-cepea-esalq-a-prazo',
  cafe:    'https://www.noticiasagricolas.com.br/cotacoes/cafe/indicador-cepea-esalq-cafe-arabica',
};
const UNIDADES = { soja:'saca 60kg', milho:'saca 60kg', boi:'@', algodao:'cent R$/lb', cafe:'saca 60kg' };
const FALLBACK = {
  soja:    { price: 121.30, variation:  0.04, unit: 'saca 60kg',  source: 'CEPEA/Esalq' },
  milho:   { price:  67.67, variation:  0.04, unit: 'saca 60kg',  source: 'CEPEA/Esalq' },
  boi:     { price: 322.45, variation:  0.30, unit: '@',          source: 'CEPEA/Esalq' },
  algodao: { price: 345.60, variation:  0.19, unit: 'cent R$/lb', source: 'CEPEA/Esalq' },
  cafe:    { price:2181.70, variation: -2.26, unit: 'saca 60kg',  source: 'CEPEA/Esalq' },
  dolar:   { price:   4.99, variation:  0.00, unit: 'comercial',  source: 'fallback' },
};

async function buscarCommodity(nome) {
  try {
    const html = await fetchText(URLS[nome]);
    const p = parseTabela(html);
    if (p && p.price) return p;
  } catch (e) {}
  return null;
}

// === 4 fontes do dolar, cada uma reporta diagnostico ===

async function fonteAwesome() {
  const j = await fetchJSON('https://economia.awesomeapi.com.br/json/last/USD-BRL', 7000);
  if (j.__err) return { ok:false, err:j.__err };
  const d = j && j.USDBRL;
  if (!d) return { ok:false, err:'no-USDBRL' };
  const ask = Number(d.ask);
  const pct = Number(d.pctChange);
  if (!(ask > 0)) return { ok:false, err:'bad-ask' };
  return { ok:true, price: ask, variation: isFinite(pct)?pct:0, source: 'AwesomeAPI' };
}

async function fonteBrasilAPI() {
  // BrasilAPI tem cotacao comercial via PTAX BCB - super estavel, no Brasil
  const hoje = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(hoje); d.setDate(d.getDate()-i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const dataStr = `${yyyy}${mm}${dd}`;
    const j = await fetchJSON(`https://brasilapi.com.br/api/cambio/v1/cotacao/USD/${dataStr}`, 6000);
    if (j.__err) continue;
    const cot = j && j.cotacoes && j.cotacoes.length > 0 ? j.cotacoes[j.cotacoes.length-1] : null;
    if (!cot) continue;
    const venda = Number(cot.cotacao_venda);
    if (venda > 0) return { ok:true, price: venda, variation: 0, source: 'BrasilAPI' };
  }
  return { ok:false, err:'no-data-7d' };
}

async function fonteOpenER() {
  // open.er-api.com - free tier sem key, base USD
  const j = await fetchJSON('https://open.er-api.com/v6/latest/USD', 7000);
  if (j.__err) return { ok:false, err:j.__err };
  const brl = j && j.rates && Number(j.rates.BRL);
  if (!(brl > 0)) return { ok:false, err:'no-BRL' };
  return { ok:true, price: brl, variation: 0, source: 'open.er-api' };
}

async function fontePTAX() {
  const hoje = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(hoje); d.setDate(d.getDate()-i);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    const dataStr = `${mm}-${dd}-${yyyy}`;
    const filter = encodeURIComponent("tipoBoletim eq 'Fechamento'");
    const orderby = encodeURIComponent('dataHoraCotacao desc');
    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dataStr}'&$filter=${filter}&$orderby=${orderby}&$top=1&$format=json&$select=cotacaoVenda`;
    const j = await fetchJSON(url, 6000);
    if (j.__err) continue;
    const items = j && j.value;
    if (items && items.length > 0) {
      const venda = Number(items[0].cotacaoVenda);
      if (venda > 0) return { ok:true, price: venda, variation: 0, source: 'BCB/PTAX' };
    }
  }
  return { ok:false, err:'no-data-7d' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // === Dolar: tentar fontes em ordem, registrando cada tentativa ===
  const diag = [];
  let dolar = { ...FALLBACK.dolar };

  const fontes = [
    { nome: 'awesome',    fn: fonteAwesome },
    { nome: 'brasilapi',  fn: fonteBrasilAPI },
    { nome: 'open-er',    fn: fonteOpenER },
    { nome: 'ptax',       fn: fontePTAX },
  ];
  for (const { nome, fn } of fontes) {
    try {
      const r = await fn();
      if (r.ok) {
        diag.push(`${nome}:ok=${r.price.toFixed(4)}`);
        dolar = { price: r.price, variation: r.variation, unit: 'comercial', source: r.source };
        break;
      } else {
        diag.push(`${nome}:${r.err}`);
      }
    } catch (e) {
      diag.push(`${nome}:exception`);
    }
  }
  if (dolar.source === 'fallback') diag.push('USANDO_FALLBACK');

  // === Commodities ===
  const nomes = ['soja','milho','boi','algodao','cafe'];
  const resultados = await Promise.allSettled(nomes.map(n => buscarCommodity(n)));
  const dados = {};
  nomes.forEach((nome, i) => {
    const r = resultados[i];
    if (r.status === 'fulfilled' && r.value && r.value.price) {
      dados[nome] = { price: r.value.price, variation: r.value.variation ?? 0, unit: UNIDADES[nome], source: 'CEPEA/Esalq' };
    } else {
      dados[nome] = { ...FALLBACK[nome] };
    }
  });

  res.setHeader('X-Dolar-Source', dolar.source);
  res.setHeader('X-Dolar-Diag', diag.join(' | '));

  return res.status(200).json({ ...dados, dolar });
}
