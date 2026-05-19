// api/cepea-quotes.js - Vercel Serverless Function - v8
// Mudancas v8:
//   - BrasilAPI URL corrigida (YYYY-MM-DD)
//   - Reordem: AwesomeAPI -> BrasilAPI -> BCB direto -> open.er-api -> fallback
//   - Cache: stale-while-revalidate longo (1h) absorve 429s temporarios
//   - Diagnostico marca QUALIDADE de cada fonte
//     (live/oficial/referencia/fallback)

export const config = { regions: ['gru1'] };

const JSON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const HEADERS = {
  ...JSON_HEADERS,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

// === Fontes do dolar com qualidade ===
// quality: 'live' (real-time comercial) | 'official' (PTAX BCB) | 'reference' (ECB) | 'fallback'

async function fonteAwesome() {
  // Retry com delay de 800ms se primeiro 429
  for (let i = 0; i < 2; i++) {
    const j = await fetchJSON('https://economia.awesomeapi.com.br/json/last/USD-BRL', 7000);
    if (!j.__err) {
      const d = j && j.USDBRL;
      if (d) {
        const ask = Number(d.ask);
        const pct = Number(d.pctChange);
        if (ask > 0) return { ok:true, price: ask, variation: isFinite(pct)?pct:0, source: 'AwesomeAPI', quality: 'live' };
      }
      return { ok:false, err:'no-USDBRL' };
    }
    if (j.__err.includes('429') && i === 0) {
      await new Promise(r => setTimeout(r, 800));
      continue;
    }
    return { ok:false, err: j.__err };
  }
  return { ok:false, err:'retry-exhausted' };
}

async function fonteBrasilAPI() {
  // CORRIGIDO v8: formato YYYY-MM-DD
  const hoje = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(hoje); d.setDate(d.getDate()-i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const dataStr = `${yyyy}-${mm}-${dd}`; // FIX: era YYYYMMDD, BrasilAPI espera YYYY-MM-DD
    const j = await fetchJSON(`https://brasilapi.com.br/api/cambio/v1/cotacao/USD/${dataStr}`, 6000);
    if (j.__err) continue;
    const cots = j && j.cotacoes;
    if (!cots || !cots.length) continue;
    // Pegar o ultimo boletim do dia (geralmente Fechamento)
    const ultimo = cots[cots.length-1];
    const venda = Number(ultimo.cotacao_venda);
    if (venda > 0) return { ok:true, price: venda, variation: 0, source: 'BrasilAPI/PTAX', quality: 'official' };
  }
  return { ok:false, err:'no-data-7d' };
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
      if (venda > 0) return { ok:true, price: venda, variation: 0, source: 'BCB/PTAX', quality: 'official' };
    }
  }
  return { ok:false, err:'no-data-7d' };
}

async function fonteOpenER() {
  const j = await fetchJSON('https://open.er-api.com/v6/latest/USD', 7000);
  if (j.__err) return { ok:false, err: j.__err };
  const brl = j && j.rates && Number(j.rates.BRL);
  if (!(brl > 0)) return { ok:false, err:'no-BRL' };
  return { ok:true, price: brl, variation: 0, source: 'open.er-api', quality: 'reference' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Bypass cache se ?nocache=1
  const nocache = req.query?.nocache === '1';

  const diag = [];
  let dolar = { ...FALLBACK.dolar, quality: 'fallback' };

  const fontes = [
    { nome: 'awesome',    fn: fonteAwesome },
    { nome: 'brasilapi',  fn: fonteBrasilAPI },
    { nome: 'ptax',       fn: fontePTAX },
    { nome: 'open-er',    fn: fonteOpenER },
  ];
  for (const { nome, fn } of fontes) {
    try {
      const r = await fn();
      if (r.ok) {
        diag.push(`${nome}:ok=${r.price.toFixed(4)}`);
        dolar = { price: r.price, variation: r.variation, unit: 'comercial', source: r.source, quality: r.quality };
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

  // === Cache adaptativo baseado em qualidade ===
  // - live (AwesomeAPI): cache 15min + SWR 1h (absorve 429s sem perder dado)
  // - official (PTAX): cache 10min + SWR 1h
  // - reference (ECB): cache 2min (retry logo)
  // - fallback: cache 30s (retry quase imediato)
  // - nocache=1: nada (forca refresh)
  if (nocache) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    const cachePolicy = {
      live:      's-maxage=900, stale-while-revalidate=3600',
      official:  's-maxage=600, stale-while-revalidate=3600',
      reference: 's-maxage=120, stale-while-revalidate=600',
      fallback:  's-maxage=30, stale-while-revalidate=300',
    };
    res.setHeader('Cache-Control', cachePolicy[dolar.quality] || cachePolicy.fallback);
  }

  res.setHeader('X-Dolar-Source', dolar.source);
  res.setHeader('X-Dolar-Quality', dolar.quality);
  res.setHeader('X-Dolar-Diag', diag.join(' | '));

  return res.status(200).json({ ...dados, dolar });
}
