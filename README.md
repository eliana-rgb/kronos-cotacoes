# KRONOS · Boletim Diário de Cotações (v6)

Sistema diário de boletim 1080×1920 para Instagram Story / WhatsApp Status.

## Mudanças nesta v6 (LEGIBILIDADE 50+)

Após feedback "as fontes e o slogan ainda não estão visíveis", todas as fontes
foram aumentadas significativamente. Comparação:

| Elemento                | v5         | v6         | Δ      |
|-------------------------|------------|------------|--------|
| KRONOS marca            | 44px       | **56px**   | +27%   |
| Slogan                  | 20px / 1 linha | **28px / 2 linhas** | +40%   |
| Data                    | 30px       | **36px**   | +20%   |
| BOLETIM Nº              | 22px       | **26px**   | +18%   |
| Eyebrow                 | 30px       | **36px**   | +20%   |
| DÓLAR COMERCIAL label   | 28px       | **34px**   | +21%   |
| Variação dólar          | 42px       | **46px**   | +10%   |
| "no dia · fonte BCB"    | 26px       | **32px**   | +23%   |
| Nome commodity          | 46px       | **56px**   | +22%   |
| Unidade + fonte         | 26px       | **30px**   | +15%   |
| Preço commodity         | 92px       | **100px**  | +9%    |
| Variação commodity      | 34px       | **40px**   | +18%   |
| Footer kronos-ag.com    | 30px       | **38px**   | +27%   |
| Footer @kronosag.br     | 26px       | **32px**   | +23%   |

**Slogan agora em 2 linhas**: "ENGENHARIA FINANCEIRA / PARA O AGRONEGÓCIO"
permitiu fonte muito maior sem cortar.

## Diretriz Kronos atualizada

O arquivo `DIRETRIZ-KRONOS-50plus.md` foi atualizado com os novos mínimos para
qualquer trabalho visual futuro. Regra de ouro: **se está em dúvida se algo
está pequeno, ESTÁ**.

## Mantém da v5

- 4 fontes de dólar com indicador de qualidade (🟢🟡🟠🔴)
- 2 temas (cream / verde-noite) com toggle
- Cache adaptativo por qualidade da fonte
- Bypass de cache no botão "↻ Atualizar cotações"
- Região São Paulo (gru1) no Vercel
- Fonte CEPEA/Esalq visível em cada commodity

## Sobre a variação ~1-2 centavos no dólar

Quando o indicador estiver 🟡 amarelo (PTAX/BrasilAPI/BCB), o valor pode estar
1-2 centavos diferente do comercial vivo. NÃO é bug — é a PTAX oficial do
Banco Central. Para forçar buscar a AwesomeAPI (live commercial real-time),
clique em **↻ Atualizar cotações** que bypassa todo cache do Vercel.

## Deploy

1. Descompactar zip → `kronos-cotacoes/`
2. `git add . && git commit -m "deploy v6 - fontes 50+" && git push`
3. Vercel redeploya em ~30s

## Estrutura

```
kronos-cotacoes/
├── api/cepea-quotes.js          ← v8 (sem mudança da v5)
├── public/index.html            ← v8 (fontes maiores)
├── package.json                 ← 6.0.0
├── vercel.json
├── .gitignore
├── DIRETRIZ-KRONOS-50plus.md    ← atualizada com novos mínimos
└── README.md
```

## Suporte
Eliana Santos · @kronosag.br · kronos-ag.com
