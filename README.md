# KRONOS · Boletim Diário de Cotações (v3)

Sistema que gera todo dia uma imagem 1080×1920 (Instagram Story / WhatsApp Status)
com cotações de soja, milho, boi gordo, algodão, café arábica e dólar comercial.
**Agora com 2 temas alternáveis: cream (claro) e verde-noite (escuro)**.

## Mudanças nesta versão (v3)

- ✨ **Toggle de tema** no topo da página: `☀ Cream` / `🌙 Verde-noite`
- Lembrança de preferência via localStorage (próxima visita abre no último tema usado)
- Nome do PNG inclui o tema: `kronos-boletim-cream-2026-MM-DD.png` ou `kronos-boletim-verde-2026-MM-DD.png`
- Toda estrutura/conteúdo idêntico nos 2 temas — só cores mudam

## Versões anteriores

- v2: 4 fontes de dólar + região São Paulo (gru1) + diagnóstico no header
- v1: gerador inicial só cream + API com fix do dólar

## Deploy no Vercel

1. Descompactar este zip → pasta `kronos-cotacoes/`
2. Subir no GitHub:
   ```bash
   git init && git add . && git commit -m "deploy v3"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/kronos-cotacoes.git
   git push -u origin main
   ```
3. Vercel → Add New Project → importar repo → Framework "Other" → Deploy
4. Região São Paulo (gru1) já configurada no `vercel.json`

## Rotina diária

1. Abrir o site
2. Escolher tema **☀ Cream** ou **🌙 Verde-noite** (ele lembra do último)
3. Esperar 2-3s puxar os preços
4. Clicar **⬇ Baixar imagem**
5. Postar no Story Instagram + Status WhatsApp

## Debug do dólar

DevTools → Network → `/api/cepea-quotes` → ver headers:
- `X-Dolar-Source`: fonte usada
- `X-Dolar-Diag`: diagnóstico das tentativas

Também visível direto no rodapé da página.

Cadeia de fontes do dólar (v3 herda da v2):
1. AwesomeAPI · 2. BrasilAPI · 3. open.er-api.com · 4. BCB/PTAX · 5. fallback estático

## Estrutura

```
kronos-cotacoes/
├── api/cepea-quotes.js       ← v7 (4 fontes + diagnóstico)
├── public/index.html         ← v5 (toggle 2 temas)
├── package.json
├── vercel.json               ← região gru1
├── .gitignore
├── DIRETRIZ-KRONOS-50plus.md
└── README.md
```

## Identidade

**Tema Cream**: cream #FAF9F6 + charcoal #1A1A1A + verde #4C7A3C + dourado #C9A961
**Tema Verde-noite**: verde-noite #081A13 + creme #FAF9F6 + dourado #D4B97A + verde claro #A7D269

Ambos respeitam `DIRETRIZ-KRONOS-50plus.md` (fontes ≥22px, contraste alto).

## Suporte
Eliana Santos · @kronosag.br · kronos-ag.com
