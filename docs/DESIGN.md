# VizinhoMarket — Identidade visual e design system (13/11/2026)

## O problema que o redesenho resolve
A versão anterior (fundo marfim, títulos em serifa Lora/Fraunces, terracota e verde-musgo, rótulos em CAIXA ALTA espaçada)
comunicava "boutique de decoração / roupa / cama e banho". O VizinhoMarket é o oposto: o comércio inteiro de uma cidade —
lanche, mercado, farmácia, celular, ração, material de construção, presente, serviço — num lugar só.

## Conceito: "a rua comercial da cidade no celular"
Em vez de estética genérica de app (gradiente, bolhas arredondadas, sombra em tudo), a linguagem vem do comércio de rua
brasileiro, que todo cliente reconhece:

| Elemento da rua | Na interface | Onde aparece |
|---|---|---|
| **Toldo** (borda ondulada) | `components/brand/Toldo.jsx` — assinatura da marca | Base da fachada da página inicial, topo da página da loja. Uso **raro de propósito**: se aparecer em tudo, vira enfeite |
| **Fachada** | Faixa de cor com o símbolo da categoria em marca d'água | Página da loja, cartões de loja |
| **Rua de lojas** | Ilustração vetorial própria `RuaComercial.jsx` (5 fachadas com toldos em cores de categorias diferentes) | Fachada da página inicial no computador |
| **Letreiro** | Títulos em Bricolage Grotesque (grotesca com personalidade, de cara "pintada") | Todos os títulos |
| **Etiqueta** | Selos `.etiqueta` com informação real (aberta agora, tempo, taxa) | Lojas e pedidos |
| **Selo da marca** | Fachada com toldo amarelo e porta (`BrandMark`) — o mesmo desenho do ícone do app | Cabeçalhos dos 4 produtos, ícone instalado |

## Cores
**Marca** (pouca e firme — o colorido vem das categorias):
| Token | Cor | Uso | Contraste |
|---|---|---|---|
| `--foreground` tinta | `#14201A` | Texto, menus ativos dos painéis, barra da sacola | 16,8:1 sobre branco |
| `--primary`/`--marca` verde-vizinho | `#0B6B43` | Ação principal (uma por tela), "Market" do logo, fachada da página inicial | branco sobre ele 6,6:1 |
| `--accent` amarelo-toldo | `#FFC21A` | Toldo, selos de quantidade, contador da sacola. **Nunca texto sobre branco** | tinta sobre ele 12:1 |
| `--secondary` chão | `#F0F3F1` | Superfícies, campos, linhas de destaque | — |
| `--muted-foreground` | `#55615B` | Texto secundário | 6,3:1 |
| `--border` | `#DDE3E0` | Divisórias finas (em vez de sombras) | — |

**Categorias** (`lib/categoryStyle.js`): cada categoria tem um par fundo claro + tinta forte (contraste AA entre si) e um
símbolo próprio. Todas com a **mesma saturação e o mesmo tamanho de bloco**: comida não domina, moda não vira a cara da marca.
Comida tomate · Mercado verde-folha · Farmácia verde-água · Bebidas azul · Conveniência mostarda · Pet âmbar · Eletrônicos índigo ·
Moda ameixa · Casa barro · Construção tijolo · Automotivo grafite · Beleza magenta · Papelaria azul-tinta · Presentes rosa ·
Brinquedos turquesa · Agro oliva · Variedades lilás · Serviços azul-ardósia.

Por que verde e não vermelho/laranja: vermelho e laranja já são a cor de concorrentes de delivery; verde comunica "bairro,
mercado, confiança" e funciona para todas as categorias (não só comida). O amarelo-toldo dá calor e reconhecimento.

## Tipografia
| Papel | Fonte | Peso / tamanho | Por quê |
|---|---|---|---|
| Títulos (letreiro) | Bricolage Grotesque (variável) | 750, espaçamento −0,025 em; 26–40 px no app, 26–34 px nos painéis | Grotesca com traços de letreiro: personalidade sem perder seriedade |
| Texto | Figtree (variável) | 400–700; 13–16 px; números tabulares | Legível em tela pequena, amigável sem ser infantil |
As duas ficam empacotadas no próprio site (`@fontsource-variable`, ~64 KB juntas). Saiu o Google Fonts (Fraunces/Manrope) e a Lora.

## Forma e espaço
- **Raio 10 px** em botões, campos, cartões e blocos ("placa de loja", não bolha). Pílulas só em selos pequenos.
- **Sem sombra em cartões de lista**; divisórias finas separam. Sombra (`.flutuante`) só no que flutua: sacola, menus.
- Espaçamento em múltiplos de 4; seções da página inicial separadas por 32 px; margem lateral 16 px no celular, 24 px no computador.

## Componentes
| Componente | Arquivo | Regra |
|---|---|---|
| Logotipo e selo | `components/layout/Brand.jsx` | Selo + "Vizinho" (tinta) + "Market" (verde); versão `onDark` com "Market" em amarelo |
| Toldo | `components/brand/Toldo.jsx` | Só na fachada da página inicial e no topo da loja |
| Atalhos de categoria | `components/home/CategoryTabs.jsx` | `grid` (início: 4 colunas no celular, 9 no computador, "Todas" leva à página de categorias) e `row` (vitrine/busca, rolagem lateral) |
| Loja em linha | `StoreCard` | Logo ou iniciais na cor da categoria; nota real ou "Nova"; tempo só se a loja informou; taxa; serviço mostra "Orçamento sem compromisso" |
| Loja em cartão | `StoreTile` | Fachada na cor da categoria (ou capa real), logo, nota, tempo, taxa |
| Produto | `ProductCard` + `CategoryArt` | Foto real; sem foto, arte provisória da categoria (assumidamente provisória) |
| Busca | `components/home/SearchField.jsx` | Campo branco de 52 px; na fachada verde sem borda; nas demais telas com borda em tinta |
| Botões | `.btn-acao`, `.btn-contorno` | Uma ação verde por tela; a secundária é contorno neutro |
| Filtros rápidos | Página inicial | Só com dado real: entrega grátis, retirar na loja, paga pelo app (quando ligado) |
| Barra da sacola | `components/store/CartBar.jsx` | Tinta com contador amarelo — destaca sem competir com o verde dos botões |
| Menus dos painéis | `AdminLayout`, `ParceiroLayout` | Item ativo em tinta; admin agrupado por área (Operação, Financeiro, Cadastros, Marketing, Sistema) |

## Página inicial (composição)
1. Cabeçalho: selo + logo, "Entregar em …" (endereço real) ou a cidade, sacola.
2. **Fachada verde** com o que é o VizinhoMarket em uma frase factual e a busca; no computador, a ilustração da rua de lojas; borda de toldo.
3. **Categorias** em grade, todas com o mesmo peso.
4. **Filtros rápidos** reais.
5. "Peça de novo" (último pedido entregue, se houver).
6. **Abertas agora** em cartões (rolagem lateral).
7. **Do cardápio das lojas** — só produtos com foto.
8. **"Ruas" do marketplace** em lista: Comida · Mercado e conveniência · Saúde e cuidados · Lojas da cidade · Serviços (cada uma só aparece se tiver loja aberta).
9. Fechadas agora.
10. **Como funciona** — três fatos do serviço (lojas da cidade, código de entrega, formas de pagamento), sem slogan.
O ritmo alterna fachada cheia → grade → cartões horizontais → listas densas → texto.

## O que foi eliminado
Serifas de boutique, marfim/terracota, rótulos em CAIXA ALTA espaçada, eyebrows decorativos, título de 4xl–7xl, gradientes,
sombras em cartões de lista, pílulas em tudo, amarelo como texto (ilegível), ícone verde igual para todas as categorias,
monogramas bege, "40 min" inventado quando a loja não informa o tempo, "Entrega grátis" para prestador de serviço,
avisos do admin sem a quantidade, botões quebrando em duas linhas nos cartões de pedido.

## Fotografia (direção para quando houver fotos)
- Fotos reais das lojas e dos produtos, feitas no próprio comércio, com luz natural de dia; produto ocupando ~70% do quadro.
- Fundo neutro e limpo; nada de banco de imagens genérico nem foto de outra cidade.
- Capa da loja em 3:1 (fachada ou balcão); logo quadrado; produto 1:1.
- Enquanto não houver foto: fachada na cor da categoria e arte provisória da categoria (nunca imagem quebrada nem espaço vazio).
- Não usar roupa, cama, sofá ou decoração como imagem principal do marketplace.

## Como revisar o visual sem banco
- App do cliente: `node e2e/vitrine-demo.mjs <pasta>` (dados fictícios; `VM_LARGURA=1280` para computador).
- Painéis e entregador: `node e2e/paineis-demo.mjs <parceiro|admin|entregador> <url> <pasta>`.
- No CI, as telas do teste ponta a ponta saem em miniatura no log (ramos `claude/*`) e completas no artefato "prints-ponta-a-ponta".
