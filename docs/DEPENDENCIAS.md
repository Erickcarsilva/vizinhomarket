# Dependências e avisos de segurança (21/10/2026)

## O que foi feito
- Removidos 43 pacotes que não eram usados por nenhuma tela (herança do Base44): Stripe, editor de texto (quill),
  3D (three), PDF (jspdf, html2canvas), mapas (react-leaflet), formulários (react-hook-form, zod), datas (moment, date-fns),
  lodash, confete, arrastar e soltar, markdown e 21 componentes Radix sem uso.
- Removidos 35 componentes de interface sem uso em `src/components/ui` e 2 arquivos de código morto
  (`components/ProtectedRoute.jsx`, `components/driver/DeliveryMap.jsx`).
- `tailwindcss-animate` passou para dependências de build (devDependencies), onde é usado.
- Resultado: `npm audit --omit=dev` (o que vai para o navegador) = **0 vulnerabilidades**.
- React Router atualizado de 6.30 para 7.18.4 (corrige o aviso de redirecionamento aberto GHSA-wrjc-x8rr-h8h6).
  As telas usam só o modo declarativo (BrowserRouter, Routes, Link), que é compatível. Todos os testes ponta a ponta passaram.

## Avisos que continuam (npm audit: 8) e por que não afetam quem usa o app
| Pacote | Gravidade | Origem | Por que não afeta o site publicado |
|---|---|---|---|
| braces, micromatch, chokidar, fast-glob | alta | Tailwind CSS 3 (ferramenta de build) | Só rodam no computador/servidor que gera o site, lendo os nossos próprios arquivos. Não vão para o navegador do cliente. |
| postcss-selector-parser, postcss-nested | moderada | Tailwind CSS 3 (build) | Processam só o nosso CSS durante o build. Não vão para o navegador. |
| tailwindcss, tailwindcss-animate | — | dependem dos acima | Idem. |

Não há correção publicada para essas versões. A saída definitiva é migrar para o Tailwind 4, que não usa esses pacotes.
Recomendação: fazer essa migração depois do piloto (mexe no visual de todas as telas e exige revisão tela a tela).

## Como conferir
```
cd apps/web
npm audit            # deve listar só os pacotes da tabela acima
npm audit --omit=dev # pacotes que vão para o navegador: deve dar 0
```
