# KRONOS · Boletim Diário de Cotações (v4)

Sistema diário de boletim 1080×1920 para Instagram Story / WhatsApp Status,
com identidade Kronos, 2 temas alternáveis e 4 fontes de dólar em fallback.

## Mudanças desta versão (v4)

### Correções
- ✅ **BrasilAPI corrigida** — formato de data estava errado (`YYYYMMDD` → `YYYY-MM-DD`)
- ✅ **Reordem das fontes**: AwesomeAPI → BrasilAPI → BCB/PTAX → open.er-api → fallback. Antes o ECB ganhava antes da PTAX por causa do bug.
- ✅ **AwesomeAPI com retry inteligente**: se receber HTTP 429 (rate limit), espera 800ms e tenta de novo

### Novidade: indicador de QUALIDADE do dólar
A página agora mostra a confiabilidade da fonte:
- 🟢 **comercial em tempo real** (AwesomeAPI) — valor exato do mercado
- 🟡 **PTAX BCB oficial** (BrasilAPI ou BCB direto) — diferença típica: 1-2 centavos
- 🟠 **BCE/ECB referência** (open.er-api) — diferença típica: 5-10 centavos
- 🔴 **valor estático** (fallback) — todas as APIs falharam

### Cache adaptativo
- Se a fonte é **live** (AwesomeAPI): cache de 15 min + stale-while-revalidate 1h. Isso significa que mesmo se a AwesomeAPI tomar 429 momentâneo, o último valor bom continua sendo servido enquanto o Vercel tenta atualizar em background.
- Se a fonte é **official** (PTAX): cache 10 min + SWR 1h
- Se a fonte é **reference** (ECB): cache 2 min apenas (tenta voltar pra live logo)
- Se a fonte é **fallback**: cache 30 s (retry quase imediato)

### Botão "Atualizar" agora força bypass de cache
Clicar em "↻ Atualizar cotações" envia `?nocache=1` pra API, ignorando totalmente o cache do Vercel. Útil quando o dólar mudou e você quer confirmar.

## Como usar (rotina diária)

1. Abrir o site → escolher tema (☀ Cream ou 🌙 Verde-noite)
2. Olhar o indicador de qualidade abaixo do botão:
   - 🟢/🟡 → pode confiar, baixar e postar
   - 🟠 → valor pode estar 5-10 centavos diferente do comercial. Pode aguardar 1-2 min e clicar **↻ Atualizar cotações** (vai tentar AwesomeAPI de novo)
   - 🔴 → APIs externas todas caíram, valor é estático. Não publique até voltar ao normal.
3. Clicar **⬇ Baixar imagem** → postar

## Deploy no Vercel

1. Descompactar zip → pasta `kronos-cotacoes/`
2. Subir no GitHub (substituindo arquivos do repo atual):
   ```bash
   git add . && git commit -m "deploy v4" && git push
   ```
3. Vercel redeploya automaticamente em ~30s
4. Região São Paulo (`gru1`) já configurada no `vercel.json`

## Debug

Headers da resposta `/api/cepea-quotes`:
- `X-Dolar-Source`: fonte usada (AwesomeAPI / BrasilAPI/PTAX / BCB/PTAX / open.er-api / fallback)
- `X-Dolar-Quality`: qualidade (live / official / reference / fallback)
- `X-Dolar-Diag`: diagnóstico de cada tentativa

Visível também no rodapé da página em texto pequeno.

## Estrutura

```
kronos-cotacoes/
├── api/cepea-quotes.js          ← v8 (4 fontes corrigidas + cache adaptativo)
├── public/index.html            ← v6 (toggle 2 temas + indicador qualidade + bypass cache)
├── package.json                 ← 4.0.0
├── vercel.json                  ← região gru1
├── .gitignore
├── DIRETRIZ-KRONOS-50plus.md
└── README.md
```

## Suporte
Eliana Santos · @kronosag.br · kronos-ag.com
