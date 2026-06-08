# KRONOS · Boletim Diário de Cotações (v7)

Sistema diário de boletim 1080×1920 para Instagram Story / WhatsApp Status.

## A grande mudança da v7: dólar do navegador

**Problema histórico:** O Vercel serverless function rodava num IP compartilhado
com milhares de outros sites. A AwesomeAPI (única fonte de dólar comercial em
tempo real) rate-limitava todo o pool de IPs do Vercel-gru1 junto, retornando
HTTP 429. Resultado: o sistema caía pra PTAX (1-2 cent off) ou ECB (5-10 cent off).

**Solução v7:** O JavaScript do boletim agora chama AwesomeAPI **DIRETAMENTE do
navegador da Eliana**. O IP residencial (Vivo/Claro/etc) é único e raramente
rate-limitado. A AwesomeAPI tem CORS aberto, então funciona sem proxy.

### Fluxo da v7

1. Página abre → JavaScript dispara DUAS chamadas em paralelo:
   - `https://economia.awesomeapi.com.br/json/last/USD-BRL` (do browser)
   - `/api/cepea-quotes` (do servidor, pra commodities)
2. Se browser conseguir o dólar → usa esse (qualidade `live`, source `AwesomeAPI (browser)`)
3. Se browser falhar (sem internet, CORS bloqueado por anti-vírus, etc.) → usa
   o que o servidor retornou (fallback chain: AwesomeAPI → BrasilAPI → BCB → ECB → estático)

### Por que isso resolve definitivamente

- IP residencial × IP Vercel compartilhado: AwesomeAPI vê 1 request por dia da Eliana, não 10.000/min de Vercel
- Browser tem CORS gratuito pra esse endpoint AwesomeAPI
- Backend mantém fallback chain caso navegador falhe
- Cache do servidor virou irrelevante pra dólar (que é o que mudava rápido)

## Como saber se está funcionando

Indicador no rodapé:
- 🟢 **AwesomeAPI (direto do navegador)** · comercial em tempo real → IDEAL, valor exato
- 🟢 **AwesomeAPI** · comercial em tempo real → também live mas via servidor
- 🟡 PTAX/BrasilAPI/BCB → servidor caiu pra PTAX (defasagem ~1-2 cent)
- 🟠 open.er-api → servidor caiu pro BCE (defasagem ~5-10 cent)
- 🔴 fallback → tudo falhou, não publicar

Se a página mostrar 🟢 com "(direto do navegador)", a precisão do dólar é exata.

## Mantém da v6

- Todas as fontes ampliadas para legibilidade 50+
- 2 temas alternáveis (cream/verde-noite)
- Slogan em 2 linhas grandes
- Fonte CEPEA/Esalq visível em cada commodity
- Botão "↻ Atualizar cotações" força bypass de cache
- Região São Paulo (gru1) no Vercel

## Deploy

1. Descompactar zip → `kronos-cotacoes/`
2. `git add . && git commit -m "deploy v7 - dolar do browser" && git push`
3. Vercel redeploya em ~30s

## Debug

DevTools (F12) → Network → você verá 2 chamadas:
- `https://economia.awesomeapi.com.br/json/last/USD-BRL` (deve dar 200)
- `/api/cepea-quotes` (deve dar 200)

Se a primeira der erro (CORS bloqueado, network offline), a página
automaticamente usa o dólar do servidor.

## Estrutura

```
kronos-cotacoes/
├── api/cepea-quotes.js          ← v8 (commodities + fallback chain dólar)
├── public/index.html            ← v9 (dólar do browser + fontes 50+ + 2 temas)
├── package.json                 ← 7.0.0
├── vercel.json
├── .gitignore
├── DIRETRIZ-KRONOS-50plus.md
└── README.md
```

## Suporte
Eliana Santos · @kronosag.br · kronos-ag.com
