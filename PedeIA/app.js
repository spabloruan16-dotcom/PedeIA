const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const storageKey = "pedeia-demo-state";

const defaultState = {
  view: "dashboard",
  shop: {
    name: "Brasa & Massa",
    type: "Hamburgueria artesanal",
    slug: "brasa-e-massa",
    publicId: "brasa-e-massa-7k4p",
    description: "Hamburgueres na brasa, massas cremosas e aquele sabor que pede replay.",
    accent: "#f4512c",
    isOpen: true
  },
  categories: ["Mais pedidos", "Hamburgueres", "Porções", "Bebidas"],
  products: [
    { id: 1, category: "Mais pedidos", name: "Brasa Clássico", description: "Pão brioche, blend da casa, queijo e molho especial.", price: 28.9, emoji: "🍔", available: true },
    { id: 2, category: "Hamburgueres", name: "Duplo Crocante", description: "Dois burgers, cheddar, cebola crocante e barbecue.", price: 36.9, emoji: "🍔", available: true },
    { id: 3, category: "Porções", name: "Batata da Casa", description: "Batatas rústicas com páprica e maionese defumada.", price: 19.9, emoji: "🍟", available: true },
    { id: 4, category: "Bebidas", name: "Mate com limão", description: "Mate gelado, limão fresco e gelo.", price: 8.5, emoji: "🥤", available: true }
  ],
  orders: [
    { id: "#1048", customer: "Marina Alves", total: 64.7, status: "Em preparo", time: "agora" },
    { id: "#1047", customer: "João Pedro", total: 36.9, status: "Aguardando", time: "há 8 min" },
    { id: "#1046", customer: "Ana Clara", total: 48.8, status: "Pronto", time: "há 16 min" }
  ],
  cart: []
};

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const loaded = { ...defaultState, ...saved, shop: { ...defaultState.shop, ...(saved.shop || {}) } };
    if (!loaded.shop.publicId) loaded.shop.publicId = `${loaded.shop.slug}-${Math.random().toString(36).slice(2, 6)}`;
    return loaded;
  }
  catch { return structuredClone(defaultState); }
}
function saveState() { localStorage.setItem(storageKey, JSON.stringify(state)); }
function money(value) { return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function showToast(message) { toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400); }
function setView(view) { state.view = view; saveState(); render(); }
function shopUrl() { return `${location.origin}${location.pathname}?loja=${encodeURIComponent(state.shop.publicId)}`; }
function requestedShopId() { return new URLSearchParams(location.search).get("loja"); }
function isPublicShop() { return requestedShopId() !== null || state.view === "shop"; }

function render() {
  if (isPublicShop()) {
    if (requestedShopId() && requestedShopId() !== state.shop.publicId) renderMissingShop();
    else renderShop();
  }
  else renderDashboard();
}

function renderMissingShop() {
  app.innerHTML = `<main class="missing-shop"><a class="brand" href="?"><span class="brand-mark">P</span><span>Pede<span>IA</span></span></a><div><div class="missing-icon">⌖</div><h1>Essa loja não foi encontrada.</h1><p>Confira se o link recebido está completo ou peça um novo link ao comércio.</p><a class="primary-button" href="?">Voltar ao PedeIA</a></div></main>`;
}

function renderDashboard() {
  const activeProducts = state.products.filter(product => product.available).length;
  const sales = state.orders.reduce((total, order) => total + order.total, 0);
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="?"><span class="brand-mark">P</span><span>Pede<span>IA</span></span></a>
        <div class="shop-mini"><div class="shop-avatar">B</div><div><strong>${state.shop.name}</strong><small>${state.shop.isOpen ? "● Aberta agora" : "○ Fechada"}</small></div><button class="icon-button" data-action="toggle-open" title="Alternar funcionamento">•••</button></div>
        <div class="persistent-link"><div><span>LINK DA SUA LOJA</span><strong>${shopUrl().replace(/^https?:\/\//, "")}</strong></div><button data-action="copy" title="Copiar link">▣</button></div>
        <nav class="side-nav"><button class="active" data-view="dashboard"><span>⌂</span> Visão geral</button><button data-view="orders"><span>◷</span> Pedidos <b>${state.orders.length}</b></button><button data-view="menu"><span>▦</span> Cardápio</button><button data-view="settings"><span>⚙</span> Minha loja</button></nav>
        <div class="sidebar-bottom"><button class="help-link" data-action="share">↗ Compartilhar loja</button><div class="profile-chip"><div class="profile-photo">RC</div><div><strong>Rafael Costa</strong><small>Administrador</small></div><span>⌄</span></div></div>
      </aside>
      <main class="main-content">
        <header class="topbar"><div class="breadcrumb">PedeIA <span>/</span> ${state.view === "dashboard" ? "Visão geral" : state.view === "orders" ? "Pedidos" : state.view === "menu" ? "Cardápio" : "Minha loja"}</div><div class="top-actions"><button class="outline-button" data-action="open-shop">↗ Ver minha loja</button><button class="notification">♧<i></i></button></div></header>
        ${state.view === "dashboard" ? dashboardContent(activeProducts, sales) : state.view === "orders" ? ordersContent() : state.view === "menu" ? menuContent() : settingsContent()}
      </main>
    </div>`;
  bindDashboardEvents();
}

function dashboardContent(activeProducts, sales) {
  return `<section class="page-intro"><div><p class="eyebrow">QUARTA-FEIRA, 10 DE SETEMBRO</p><h1>Boa tarde, Rafael <span>✦</span></h1><p class="intro-copy">Sua loja está com tudo pronto para receber mais pedidos.</p></div><button class="primary-button" data-action="add-product">＋ Novo produto</button></section>
    <section class="stats-grid"><article class="stat-card warm"><div class="stat-icon">◷</div><span>Pedidos hoje</span><strong>${state.orders.length + 12}</strong><small class="up">↑ 18,4% <em>vs. ontem</em></small></article><article class="stat-card"><div class="stat-icon orange">$</div><span>Vendas hoje</span><strong>${money(sales + 482.3)}</strong><small class="up">↑ 12,8% <em>vs. ontem</em></small></article><article class="stat-card"><div class="stat-icon blue">▦</div><span>Itens no cardápio</span><strong>${activeProducts}</strong><small class="neutral">${state.products.length - activeProducts} pausado${state.products.length - activeProducts === 1 ? "" : "s"}</small></article><article class="stat-card"><div class="stat-icon green">★</div><span>Avaliação média</span><strong>4,9 <small class="stars">★★★★★</small></strong><small class="neutral">de 128 avaliações</small></article></section>
    <section class="dashboard-grid"><article class="panel orders-panel"><div class="panel-heading"><div><h2>Pedidos recentes</h2><p>Você tem <b>${state.orders.length} pedidos</b> para acompanhar.</p></div><button class="text-button" data-view="orders">Ver todos →</button></div><div class="order-list">${state.orders.map(order => orderRow(order)).join("")}</div></article><article class="panel link-panel"><div class="spark">✦</div><p class="eyebrow">LINK EXCLUSIVO DA SUA LOJA</p><h2>Seu sabor está a um clique.</h2><p>Esse endereço pertence somente à ${state.shop.name}. Copie e envie pelo WhatsApp.</p><div class="link-box"><span>${shopUrl().replace(/^https?:\/\//, "")}</span><button data-action="copy">▣</button></div><button class="share-button" data-action="share">↗ Copiar para WhatsApp</button></article></section>
    <section class="panel menu-preview"><div class="panel-heading"><div><h2>Seu cardápio</h2><p>Organizado para deixar cada escolha mais gostosa.</p></div><button class="text-button" data-view="menu">Gerenciar cardápio →</button></div><div class="product-strip">${state.products.slice(0, 3).map(productCard).join("")}</div></section>`;
}

function orderRow(order) { return `<div class="order-row"><div class="order-number">${order.id}</div><div class="order-person"><strong>${order.customer}</strong><small>${order.time}</small></div><strong class="order-total">${money(order.total)}</strong><span class="status ${order.status.toLowerCase().replace(" ", "-")}">${order.status}</span><button class="row-arrow">›</button></div>`; }
function productCard(product) { return `<div class="product-card"><div class="product-visual">${product.emoji}<span class="product-dot"></span></div><div class="product-info"><span>${product.category}</span><h3>${product.name}</h3><p>${product.description}</p><strong>${money(product.price)}</strong></div></div>`; }
function ordersContent() { return `<section class="page-intro"><div><p class="eyebrow">ACOMPANHE TUDO EM UM SÓ LUGAR</p><h1>Pedidos</h1><p class="intro-copy">Cada pedido é uma nova oportunidade de encantar.</p></div><button class="primary-button" data-action="share">↗ Divulgar minha loja</button></section><section class="panel full-panel"><div class="filter-row"><div class="filter active">Todos <b>${state.orders.length}</b></div><div class="filter">Aguardando <b>1</b></div><div class="filter">Em preparo <b>1</b></div><div class="filter">Prontos <b>1</b></div></div><div class="order-list large">${state.orders.map(order => orderRow(order) + `<button class="order-action" data-action="advance-order" data-id="${order.id}">Atualizar status</button>`).join("")}</div></section>`; }
function menuContent() { return `<section class="page-intro"><div><p class="eyebrow">O QUE VOCÊ VENDE</p><h1>Cardápio</h1><p class="intro-copy">Monte seu menu com a sua cara e o seu jeito de vender.</p></div><button class="primary-button" data-action="add-product">＋ Novo produto</button></section><section class="panel full-panel"><div class="menu-toolbar"><div class="category-tabs">${state.categories.map((category, index) => `<button class="${index === 0 ? "selected" : ""}">${category}</button>`).join("")}<button class="add-category" data-action="add-category">＋ Categoria</button></div><span class="muted">${state.products.length} produtos</span></div><div class="manage-products">${state.products.map(product => `<div class="manage-row"><span class="manage-emoji">${product.emoji}</span><div><strong>${product.name}</strong><small>${product.category} · ${product.description}</small></div><b>${money(product.price)}</b><label class="switch"><input type="checkbox" data-product="${product.id}" ${product.available ? "checked" : ""}><span></span></label><button class="dots">•••</button></div>`).join("")}</div></section>`; }
function settingsContent() { return `<section class="page-intro"><div><p class="eyebrow">A EXPERIÊNCIA COMEÇA AQUI</p><h1>Minha loja</h1><p class="intro-copy">Conte para seus clientes por que escolher você.</p></div><button class="primary-button" data-action="share">↗ Compartilhar</button></section><section class="settings-grid"><article class="panel shop-editor"><div class="editor-cover"><span class="cover-badge">PedeIA</span></div><div class="editor-body"><div class="editor-avatar">B</div><label>Nome da loja<input data-setting="name" value="${state.shop.name}"></label><label>Tipo de comércio<input data-setting="type" value="${state.shop.type}"></label><label>Descrição<textarea data-setting="description">${state.shop.description}</textarea></label><button class="primary-button" data-action="save-shop">Salvar alterações</button></div></article><article class="panel preview-panel"><p class="eyebrow">LINK PERMANENTE DA LOJA</p><div class="settings-link"><strong>${shopUrl()}</strong><button class="primary-button" data-action="copy">Copiar link</button><small>Este link é exclusivo desta loja. O cliente não precisa criar conta.</small></div><p class="eyebrow preview-label">COMO SEUS CLIENTES VEEM</p><div class="phone-preview"><div class="phone-top"></div><div class="mini-hero"><small>● Aberta agora</small><h3>${state.shop.name}</h3><p>${state.shop.description}</p></div><div class="mini-items">${state.products.slice(0, 2).map(product => `<div><span>${product.emoji}</span><b>${product.name}</b><small>${money(product.price)}</small></div>`).join("")}</div></div></article></section>`; }

function renderShop() {
  const categories = state.categories;
  const cartTotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  app.innerHTML = `<div class="customer-app"><header class="customer-header"><a class="brand" href="?"><span class="brand-mark">P</span><span>Pede<span>IA</span></span></a><button class="cart-button" data-action="open-cart">Sacola <b>${state.cart.reduce((sum, item) => sum + item.quantity, 0)}</b></button></header><section class="store-hero"><div class="store-avatar-big">B</div><div><span class="open-pill">● Aberta agora</span><h1>${state.shop.name}</h1><p>${state.shop.description}</p><small>⌖ Entrega em 25–40 min · Taxa calculada no checkout</small></div></section><nav class="customer-categories">${categories.map(category => `<a href="#${category}">${category}</a>`).join("")}</nav><main class="customer-menu">${categories.map(category => `<section id="${category}"><div class="category-heading"><h2>${category}</h2><span>${state.products.filter(product => product.category === category).length} opções</span></div><div class="customer-products">${state.products.filter(product => product.category === category && product.available).map(customerProduct).join("")}</div></section>`).join("")}</main>${state.cart.length ? `<button class="floating-cart" data-action="open-cart"><span>${state.cart.reduce((sum, item) => sum + item.quantity, 0)} itens</span><strong>Ver sacola</strong><b>${money(cartTotal)}</b></button>` : ""}</div>`;
  bindShopEvents();
}
function customerProduct(product) { return `<article class="customer-product"><div class="food-image">${product.emoji}</div><div class="customer-product-info"><h3>${product.name}</h3><p>${product.description}</p><strong>${money(product.price)}</strong></div><button class="add-food" data-action="add-cart" data-id="${product.id}">＋</button></article>`; }

function bindDashboardEvents() {
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", handleAction));
  document.querySelectorAll("[data-product]").forEach(input => input.addEventListener("change", () => { const product = state.products.find(item => String(item.id) === input.dataset.product); product.available = input.checked; saveState(); render(); }));
}
function bindShopEvents() { document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", handleAction)); }
function handleAction(event) {
  const button = event.currentTarget; const action = button.dataset.action;
  if (action === "add-product") { const name = prompt("Nome do produto:", "Novo sabor"); if (!name) return; const price = Number(prompt("Preço:", "18.90")); if (!price) return; state.products.push({ id: Date.now(), category: state.categories[0], name, description: "Feito com carinho na sua cozinha.", price, emoji: "🍽️", available: true }); saveState(); render(); showToast("Produto adicionado ao cardápio"); }
  if (action === "add-category") { const name = prompt("Nome da nova categoria:"); if (name && !state.categories.includes(name)) { state.categories.push(name); saveState(); render(); showToast("Categoria criada"); } }
  if (action === "toggle-open") { state.shop.isOpen = !state.shop.isOpen; saveState(); render(); }
  if (action === "save-shop") { document.querySelectorAll("[data-setting]").forEach(input => state.shop[input.dataset.setting] = input.value); saveState(); render(); showToast("Sua loja foi atualizada"); }
  if (action === "copy" || action === "share") { copyShopLink(); }
  if (action === "open-shop") { window.open(shopUrl(), "_blank", "noopener"); }
  if (action === "open-cart") renderCart();
  if (action === "advance-order") { const order = state.orders.find(item => item.id === button.dataset.id); order.status = order.status === "Aguardando" ? "Em preparo" : order.status === "Em preparo" ? "Pronto" : "Entregue"; saveState(); render(); }
  if (action === "add-cart") { const product = state.products.find(item => String(item.id) === button.dataset.id); const item = state.cart.find(entry => entry.id === product.id); if (item) item.quantity++; else state.cart.push({ ...product, quantity: 1 }); saveState(); render(); showToast(`${product.name} foi para a sacola`); }
}
async function copyShopLink() {
  try {
    await navigator.clipboard.writeText(shopUrl());
    showToast("Link exclusivo copiado para enviar no WhatsApp");
  } catch {
    showToast("Selecione o link na tela Minha loja para copiar");
  }
}
function renderCart() { const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0); const overlay = document.createElement("div"); overlay.className = "cart-overlay"; overlay.innerHTML = `<div class="cart-modal"><button class="modal-close">×</button><p class="eyebrow">SEU PEDIDO</p><h2>Sacola</h2><div class="cart-items">${state.cart.length ? state.cart.map(item => `<div class="cart-item"><span>${item.emoji}</span><div><strong>${item.name}</strong><small>${money(item.price)} cada</small></div><b>${item.quantity}x</b></div>`).join("") : "<p class=empty-cart>Sua sacola está vazia.</p>"}</div>${state.cart.length ? `<div class="cart-total"><span>Total estimado</span><strong>${money(total)}</strong></div><button class="primary-button checkout-button">Continuar para entrega</button>` : ""}</div>`; overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove()); overlay.addEventListener("click", event => { if (event.target === overlay) overlay.remove(); }); overlay.querySelector(".checkout-button")?.addEventListener("click", () => renderCheckout(overlay)); document.body.appendChild(overlay); }
function renderCheckout(previous) { previous.remove(); const overlay = document.createElement("div"); overlay.className = "cart-overlay"; overlay.innerHTML = `<div class="cart-modal checkout"><button class="modal-close">×</button><p class="eyebrow">QUASE LÁ</p><h2>Onde entregamos?</h2><p class="modal-copy">Preencha seus dados para a loja preparar tudo com carinho.</p><label>Seu nome<input placeholder="Como podemos chamar você?"></label><label>Endereço de entrega<input placeholder="Rua, número e complemento"></label><div class="payment-options"><button class="selected">Pix</button><button>Cartão</button><button>Dinheiro</button></div><button class="primary-button checkout-button">Enviar pedido · ${money(state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0))}</button></div>`; overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove()); overlay.querySelector(".checkout-button").addEventListener("click", () => { state.cart = []; saveState(); overlay.remove(); showToast("Pedido enviado! A loja já recebeu sua solicitação."); render(); }); document.body.appendChild(overlay); }

render();
