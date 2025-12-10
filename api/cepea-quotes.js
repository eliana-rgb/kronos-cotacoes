// api/cepea-quotes.js - Vercel Serverless Function

function parseNumberBR(str) {
  if (!str) return null;
  return Number(str.replace(/\./g, '').replace(',', '.'));
}

function parsePrimeiraLinha(html) {
  const texto = html.replace(/<[^>]+>/g, ' ');
  const regex = /(\d{2}\/\d{2}\/\d{4})\s+([\d\.,]+)\s+([-\d,]+)%/;
  const m = texto.match(regex);
  if (!m) return null;
  const [_, data, valorStr, varStr] = m;
  return {
    date: data,
    price: parseNumberBR(valorStr),
    variation: parseNumberBR(varStr),
  };
}

export default async function handler(req, res) {
  // Permite CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let dolar = {
      price: 5.72,
      variation: 0.30,
      unit: 'comercial',
      source: 'B3'
    };

    try {
      const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
      const d = await r.json();
      dolar.price = Number(d.USDBRL.bid);
      dolar.variation = Number(d.USDBRL.pctChange);
    } catch(e) {}

    const urls = {
      soja:    'https://www.noticiasagricolas.com.br/cotacoes/soja/indicador-cepea-esalq-soja-parana',
      milho:   'https://www.noticiasagricolas.com.br/cotacoes/milho/indicador-cepea-esalq-milho',
      boi:     'https://www.noticiasagricolas.com.br/cotacoes/boi-gordo/boi-gordo-indicador-esalq-bmf',
      algodao: 'https://www.noticiasagricolas.com.br/cotacoes/algodao/algodao-indicador-cepea-esalq-a-prazo',
      cafe:    'https://www.noticiasagricolas.com.br/cotacoes/cafe/indicador-cepea-esalq-cafe-arabica'
    };

    async function pegar(nome) {
      const resp = await fetch(urls[nome]);
      const html = await resp.text();
      return parsePrimeiraLinha(html);
    }

    const [sojaL, milhoL, boiL, algodaoL, cafeL] = await Promise.all([
      pegar('soja'),
      pegar('milho'),
      pegar('boi'),
      pegar('algodao'),
      pegar('cafe'),
    ]);

    const soja =    { price: sojaL.price,    variation: sojaL.variation,    unit:'saca 60kg',  source:'CEPEA/Esalq' };
    const milho =   { price: milhoL.price,   variation: milhoL.variation,   unit:'saca 60kg',  source:'CEPEA/Esalq' };
    const boi =     { price: boiL.price,     variation: boiL.variation,     unit:'@',          source:'CEPEA/Esalq' };
    const algodao = { price: algodaoL.price, variation: algodaoL.variation, unit:'cent R$/lb', source:'CEPEA/Esalq' };
    const cafe =    { price: cafeL.price,    variation: cafeL.variation,    unit:'saca 60kg',  source:'CEPEA/Esalq' };

    return res.status(200).json({ soja, milho, boi, algodao, cafe, dolar });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
