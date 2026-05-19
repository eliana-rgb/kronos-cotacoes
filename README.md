# KRONOS · Boletim Diário de Cotações (v5)

Sistema diário de boletim 1080×1920 para Instagram Story / WhatsApp Status,
com identidade Kronos, 2 temas (cream + verde-noite) e fontes visíveis em todos os itens.

## O que mudou nesta v5

- ✨ **Fonte CEPEA/Esalq agora aparece em cada commodity** inline com a unidade
  (igual ao "fonte BCB" do dólar)
- Mantém todos os recursos da v4 (4 fontes de dólar, cache adaptativo, indicador
  de qualidade, bypass cache no botão atualizar, região gru1)

## Sobre a variação no preço do dólar

O dólar pode aparecer **com diferença de 1-2 centavos** do que você vê no Google
em alguns momentos. Isso NÃO é bug. Acontece quando:

1. AwesomeAPI (fonte primária, comercial em tempo real) recebe HTTP 429
   (limite de chamadas grátis estourado pelo Vercel-gru1)
2. Sistema cai pra BrasilAPI/BCB que retornam **PTAX** (cotação oficial de fechamento)
3. PTAX historicamente fica 1-2 centavos abaixo do comercial vivo

**Como saber qual fonte está sendo usada?** Olhe o **indicador colorido**
abaixo dos botões na página do boletim:

- 🟢 verde **live** = AwesomeAPI, comercial em tempo real (valor exato)
- 🟡 amarelo **official** = PTAX BCB (pode estar 1-2 cent do comercial)
- 🟠 laranja **reference** = BCE/ECB (pode estar 5-10 cent do comercial)
- 🔴 vermelho **fallback** = estático, todas as APIs falharam (NÃO publique)

**Como forçar o valor mais novo?** Clique em **↻ Atualizar cotações** — ele
manda `?nocache=1` pra API, ignora todo cache do Vercel e tenta AwesomeAPI de novo.

## Como funciona (resumo técnico)

### Cadeia de fontes do dólar
1. AwesomeAPI · live (comercial real-time, BR)
2. BrasilAPI · official (PTAX via API brasileira)
3. BCB Olinda · official (PTAX direto do Banco Central)
4. open.er-api.com · reference (rates ECB)
5. fallback estático

### Cache adaptativo
- live: 15 min + stale-while-revalidate 1h (absorve 429s sem perder valor)
- official: 10 min + SWR 1h
- reference: 2 min (retry pra voltar pra live logo)
- fallback: 30 s
- `?nocache=1` no botão atualizar: ignora todo cache

### Commodities (CEPEA/Esalq)
Scraping do site Notícias Agrícolas, parseando a tabela de fechamento de cada
indicador (soja, milho, boi, algodão, café). Fonte exibida em cada item.

## Deploy

1. Descompactar zip → pasta `kronos-cotacoes/`
2. Subir no GitHub (substituindo arquivos):
   ```bash
   git add . && git commit -m "deploy v5" && git push
   ```
3. Vercel redeploya em ~30s
4. Região São Paulo (`gru1`) já configurada

## Estrutura

```
kronos-cotacoes/
├── api/cepea-quotes.js          ← v8 (4 fontes + cache adaptativo)
├── public/index.html            ← v7 (toggle + qualidade + fonte CEPEA)
├── package.json                 ← 5.0.0
├── vercel.json                  ← região gru1
├── .gitignore
├── DIRETRIZ-KRONOS-50plus.md
└── README.md
```

## Suporte
Eliana Santos · @kronosag.br · kronos-ag.com
