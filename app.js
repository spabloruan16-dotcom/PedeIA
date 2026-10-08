const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const baseStateKey = 'pedeia-state-v5';
let stateKey = baseStateKey;
const clientKey = 'pedeia-client-profile-v1';

const weekDays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function defaultShopSchedule() {
  return {
    Segunda: { enabled: true, open: '11:00', close: '22:00' },
    Terça: { enabled: true, open: '11:00', close: '22:00' },
    Quarta: { enabled: true, open: '11:00', close: '22:00' },
    Quinta: { enabled: true, open: '11:00', close: '22:00' },
    Sexta: { enabled: true, open: '11:00', close: '23:00' },
    Sábado: { enabled: true, open: '10:00', close: '23:00' },
    Domingo: { enabled: false, open: '12:00', close: '20:00' }
  };
}

const blank = {
  view: 'dashboard',
  customerView: 'menu',
  merchant: null,
  shop: null,
  categories: [],
  products: [],
  orders: [],
  ratings: [],
  messages: [],
  cart: [],
  orderQuery: '',
  orderFilter: '',
  historyPeriod: 'all',
  chatFilter: 'all',
  chatStatusFilter: 'all',
  delivery: {
    pickup: true,
    delivery: true,
    pickupMinutes: 20,
    deliveryMinutes: 45,
    autoAccept: false
  },
  printerConfig: {
    mode: 'cabo',
    deviceName: 'Impressora térmica padrão',
    copies: 1,
    autoPrint: true,
    includeCustomer: true,
    includePhone: true,
    includeAddress: true,
    includeItems: true,
    includeNotes: true,
    includePayment: true,
    includeFooter: true,
    footerText: 'Obrigado pela preferência!'
  },
  printers: [
    { id: 'default', name: 'Impressora térmica local', type: 'cabo', status: 'Conectada', default: true }
  ]
};

let state = readState();
const initialLocalState = state;
let authenticatedUser = null;
let isAdmin = false;
let adminMerchants = [];
let adminTickets = [];
let merchantTickets = [];
let supportThread = null;
let merchantChatOpenId = null;
let supportMessagesList = [];
let lastAdminSupportPoll = 0;
let lastAdminSupportStamp = null;
let verifiedSubscription = null;
let subscriptionCheckLoading = new URLSearchParams(location.search).has('loja');
let subscriptionCheckError = false;
let lastSubscriptionCheck = 0;
let lastMerchantSync = 0;
let merchantRefreshInFlight = false;
let merchantCouriers = [];
let newlyCreatedCourierLink = null;
let couriersLoaded = false;
let couriersLoading = false;
let courierHistoryRows = [];
let courierHistoryId = null;
let optimizedRoute = null;
let customerChatRefreshTimer = null;
let tutorialRobotHidden = false;
let tutorialOverlayOpen = false;
let tutorialState = { view: null, step: 0 };
let adminSupportContact = { name: '', phone: '' };
let adminSupportContactLoaded = false;

function fingerprint(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readState() {
  try {
    const stored = JSON.parse(localStorage.getItem(stateKey) || 'null');
    return { ...blank, ...(stored || {}) };
  } catch {
    return structuredClone(blank);
  }
}

function selectUserState(user) {
  if (!user?.id) return;

  const email = String(user.email || '').toLowerCase();
  const ownsState = (candidate) => candidate?.merchant && candidate.shop && (
    candidate.merchant.authUserId === user.id ||
    (!candidate.merchant.authUserId && candidate.merchant.email?.toLowerCase() === email)
  );
  const userStateKey = `${baseStateKey}:${user.id}`;
  let savedState = null;

  try {
    savedState = JSON.parse(localStorage.getItem(userStateKey) || 'null');
  } catch {
    savedState = null;
  }

  stateKey = userStateKey;
  if (ownsState(savedState)) state = { ...blank, ...savedState };
  else if (ownsState(initialLocalState)) state = { ...blank, ...initialLocalState };
}

async function syncServerState() {
  if (publicShop() !== null) return;
  if (authenticatedUser) {
    if (Date.now() - lastMerchantSync < 30000) return;
    lastMerchantSync = Date.now();
    await loadMerchantState();
    return;
  }

  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) return;
    const serverState = await response.json();
    if (!serverState || !Object.keys(serverState).length) return;

    if (authenticatedUser) {
      const serverUserId = serverState.merchant?.authUserId;
      const matchesUser = serverUserId === authenticatedUser.id ||
        (!serverUserId && serverState.merchant?.email?.toLowerCase() === authenticatedUser.email?.toLowerCase());
      if (!matchesUser) return;
    }

    const merged = {
      ...blank,
      ...serverState,
      view: state.view,
      customerView: state.customerView,
      orderQuery: state.orderQuery,
      orderFilter: state.orderFilter,
      historyPeriod: state.historyPeriod || 'all'
    };
    if (fingerprint(state) !== fingerprint(merged)) {
      state = merged;
      localStorage.setItem(stateKey, JSON.stringify(merged));
      render();
    }
  } catch {
    // sem acesso ao servidor: continua localmente
  }
}

async function loadFromServer() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) return;
    const serverState = await response.json();
    if (serverState && Object.keys(serverState).length) {
      const merged = {
        ...blank,
        ...serverState,
        view: state.view,
        customerView: state.customerView,
        orderQuery: state.orderQuery,
        orderFilter: state.orderFilter,
      historyPeriod: state.historyPeriod || 'all'
      };
      state = merged;
      localStorage.setItem(stateKey, JSON.stringify(merged));
    }
  } catch {
    // sem fallback de rede: continua usando localStorage
  }
}

async function merchantStateRequest(method = 'GET', body) {
  const { data, error } = await window.pedeiaSupabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (error || !accessToken) throw new Error('Sua sessão expirou. Entre novamente.');

  const response = await fetch('/api/merchant-state', {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível acessar os dados da loja.');
  return result;
}

async function merchantRequest(path, method='GET', body) {
  const { data, error } = await window.pedeiaSupabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error('Sua sessão expirou. Entre novamente.');
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? {'Content-Type':'application/json'} : {}) }, ...(body ? {body: JSON.stringify(body)} : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
  return result;
}

async function loadMerchantState() {
  try {
    const saved = await merchantStateRequest();
    if (!saved.merchant) return false;

    const previousShop = state.shop;
    state = {
      ...state,
      ...saved,
      shop: saved.shop ? {
        ...previousShop,
        ...saved.shop,
        schedule: saved.shop.schedule || previousShop?.schedule || defaultShopSchedule()
      } : null,
      delivery: { ...state.delivery, ...(saved.delivery || {}) }
    };
    localStorage.setItem(stateKey, JSON.stringify(state));
    return true;
  } catch (error) {
    notify(error.message);
    return null;
  }
}

async function loadPublicShopFromDatabase() {
  try {
    const response = await fetch(`/api/public-shop?loja=${encodeURIComponent(publicShop())}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Nao foi possivel carregar esta loja.');
    const saved = await response.json();
    state = {
      ...state,
      ...saved,
      shop: { ...state.shop, ...saved.shop },
      delivery: { ...state.delivery, ...(saved.delivery || {}) }
    };
    verifiedSubscription = saved.subscription || null;
    subscriptionCheckError = false;
    subscriptionCheckLoading = false;
    lastSubscriptionCheck = Date.now();
    return true;
  } catch {
    subscriptionCheckError = true;
    return false;
  }
}

function save() {
  try {
    localStorage.setItem(stateKey, JSON.stringify(state));
  } catch {
    // ignore storage quota issues
  }

  const persist = authenticatedUser
    ? merchantStateRequest('PUT', state)
    : fetch('/api/save-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    }).then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível salvar os dados.');
    });
  return persist.catch((error) => notify(error.message || 'Falha ao salvar os dados.'));
}

function normalizeNeighborhoodName(value) { return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR'); }

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function notify(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderSaved() {
  save();
  render();
}

function slug(value) {
  return String(value || 'minha-loja')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'minha-loja';
}

function shopLink() {
  if (!state.shop || !state.shop.publicId) return location.origin + location.pathname;
  return `${location.origin}${location.pathname}?loja=${encodeURIComponent(state.shop.publicId)}`;
}

function publicShop() {
  return new URLSearchParams(location.search).get('loja');
}

function shopSubscriptionStatus() {
  const status = verifiedSubscription?.status_assinatura ??
    state.shop?.subscriptionStatus ??
    state.shop?.subscription_status ??
    state.shop?.paymentStatus ??
    state.shop?.payment_status ??
    state.shop?.planStatus ??
    state.shop?.plan_status ??
    state.shop?.status ??
    state.shop?.subscription?.status ??
    state.shop?.assinatura?.status ??
    state.subscription?.status ??
    state.subscriptionStatus ??
    state.subscription_status ??
    state.paymentStatus ??
    state.billing?.status ??
    state.merchant?.status_assinatura ??
    state.merchant?.subscriptionStatus ??
    state.merchant?.subscription_status ??
    state.merchant?.status ??
    state.merchant?.paymentStatus ??
    state.merchant?.payment_status ??
    state.merchant?.assinatura?.status;
  return String(status || (authenticatedUser ? 'pendente' : 'active')).trim().toLowerCase();
}

function shopSubscriptionBlocked() {
  const status = shopSubscriptionStatus().replaceAll('-', '_').replaceAll(' ', '_');
  const expiresAt = verifiedSubscription?.fim_assinatura ??
    state.shop?.subscriptionExpiresAt ??
    state.shop?.subscription_expires_at ??
    state.shop?.expiresAt ??
    state.shop?.expires_at ??
    state.merchant?.fim_assinatura ??
    state.subscription?.fim_assinatura ??
    state.subscription?.expiresAt ??
    state.subscription?.expires_at;
  const isExpired = expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) < Date.now();

  return isExpired || ['pending', 'pendente', 'past_due', 'overdue', 'expired', 'expirada', 'incomplete_expired', 'unpaid', 'suspended', 'suspensa', 'canceled', 'cancelled', 'cancelada'].includes(status);
}

function merchantLogged() {
  return Boolean(authenticatedUser?.email && (authenticatedUser.email_confirmed_at || authenticatedUser.confirmed_at));
}

async function attachMerchantToUser(user, details = {}) {
  const userId = user.id;
  const email = String(user.email || '').toLowerCase();
  const metadata = user.user_metadata || {};

  if (state.merchant?.authUserId && state.merchant.authUserId !== userId) return false;

  if (state.merchant?.authUserId === userId && state.shop) {
    state.merchant.email = email;
    delete state.merchant.password;
    await save();
    return true;
  }

  if (state.merchant?.email?.toLowerCase() === email && state.shop) {
    state.merchant.authUserId = userId;
    state.merchant.email = email;
    delete state.merchant.password;
    await save();
    return true;
  }

  const name = details.name || metadata.name;
  const shopName = details.shopName || metadata.shopName;
  const shopType = details.shopType || metadata.shopType || 'Loja';
  if (!name || !shopName) return false;

  state = {
    ...structuredClone(blank),
    merchant: { name, email, authUserId: userId },
    shop: {
      name: shopName,
      type: shopType,
      publicId: `${slug(shopName)}-${Math.random().toString(36).slice(2, 7)}`,
      description: details.description || metadata.shopDescription || 'Adicione uma descricao para apresentar seu comercio.',
      photo: '',
      isOpen: true,
      schedule: defaultShopSchedule()
    },
    categories: [],
    products: [],
    orders: [],
    ratings: [],
    messages: [],
    cart: [],
    orderQuery: '',
    orderFilter: '',
    historyPeriod: 'all'
  };
  await save();
  return true;
}

function brand() {
  return '<a class="brand" href="/"><span class="brand-mark">P</span><span class="brand-word"><span class="brand-pede">Pede</span><span class="brand-ia">IA</span></span></a>';
}

function ensureDemoData() {
  if (state.merchant || state.shop) return;
  state.merchant = {
    name: 'João da Silva',
    email: 'joao@exemplo.com',
    password: '123456'
  };
  state.shop = {
    name: 'Brasa & Massa',
    type: 'Hamburgueria',
    publicId: 'brasa-massa-demo',
    description: 'Hamburgueres artesanais, porções e bebidas para quem curte sabor de verdade.',
    photo: '',
    isOpen: true,
    schedule: defaultShopSchedule(),
    themeColor: '#b9362b', cover: '', storefront: {}
  };
  state.categories = ['Lanches', 'Porções', 'Bebidas'];
  state.products = [
    { id: 1, name: 'X-Bacon', category: 'Lanches', description: 'Pão, burger, bacon, queijo e molho da casa.', price: 32.9, available: true, photo: '' },
    { id: 2, name: 'Batata Chedar', category: 'Porções', description: 'Porção crocante com cheddar e cebola.', price: 24.5, available: true, photo: '' },
    { id: 3, name: 'Refrigerante 600ml', category: 'Bebidas', description: 'Escolha seu sabor favorito.', price: 8.5, available: true, photo: '' }
  ];
  save();
}

function render() {
  const lojaParam = publicShop();
  if (lojaParam !== null) {
    if (subscriptionCheckLoading) return subscriptionCheckingView();
    if (subscriptionCheckError) return subscriptionUnavailableView();
    if (lojaParam !== state.shop?.publicId) return missingShop();
    return shopSubscriptionBlocked() ? subscriptionPendingView() : customerShop();
  }

  if (!state.shop && !state.merchant) {
    ensureDemoData();
  }

  if (!merchantLogged()) return authView();
  if (isAdmin) return adminPanel();
  if (state.merchant && shopSubscriptionBlocked() && state.view !== 'support') return subscriptionPendingView();
  if (!state.merchant || !state.shop || state.merchant.authUserId !== authenticatedUser.id) return shopSetupView();
  merchantPanel();
}

async function adminRequest(path, method = 'GET', body) {
  const { data, error } = await window.pedeiaSupabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error('Sua sessao expirou. Entre novamente.');
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Falha no acesso administrativo.');
  return result;
}

async function checkAdmin() {
  try { const result = await adminRequest('/api/admin/session'); isAdmin = result?.isAdmin === true; return isAdmin; }
  catch (error) { isAdmin = false; return false; }
}

async function loadAdminMerchants() {
  const result = await adminRequest('/api/admin/merchants');
  adminMerchants = result.merchants || [];
  try { await loadAdminTickets(); } catch (e) { console.warn('Atendimento indisponível:',e.message); }
}

async function supportRequest(path, method='GET', body) {
  const {data,error}=await window.pedeiaSupabase.auth.getSession(); const token=data?.session?.access_token;
  if(error||!token) throw new Error('Sua sessão expirou. Entre novamente.');
  const response=await fetch(path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json(); if(!response.ok)throw new Error(result.error||'Falha no atendimento.'); return result;
}
async function supportUpload(file, ownerId) {
  if(!file)return null;
  if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw new Error('Envie uma imagem JPG, PNG, WEBP ou PDF.');
  if(file.size>15*1024*1024)throw new Error('O anexo deve ter no máximo 15 MB.');
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'); const path=`${ownerId}/${crypto.randomUUID()}-${safe}`;
  const {data,error}=await window.pedeiaSupabase.storage.from('atendimento-arquivos').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
  if(error)throw new Error(`Falha ao anexar arquivo: ${error.message||error.error||'verifique o bucket atendimento-arquivos e suas políticas no Supabase.'}`); return {path:data.path,name:file.name,type:file.type};
}
async function signedSupportUrl(path){if(!path)return '';const {data,error}=await window.pedeiaSupabase.storage.from('atendimento-arquivos').createSignedUrl(path,3600);return error?'':data?.signedUrl||'';}
async function loadAdminTickets(){const r=await supportRequest('/api/admin/support');adminTickets=r.atendimentos||[];}
async function loadMerchantTickets(){const r=await supportRequest('/api/support');merchantTickets=r.atendimentos||[];}
async function openSupportThread(id,admin){const r=await supportRequest(`${admin?'/api/admin/support':'/api/support'}/${encodeURIComponent(id)}/messages`);supportThread=id;supportMessagesList=await Promise.all((r.mensagens||[]).map(async m=>({...m,signedUrl:await signedSupportUrl(m.anexo_url)})));if(admin){await loadAdminTickets();adminPanel();}else{await loadMerchantTickets();state.view='support';renderSaved();}}
function bindSupportPreviews(){document.querySelectorAll('[data-support-preview]').forEach(button=>button.addEventListener('click',()=>{const url=button.dataset.supportPreview;const alt=button.dataset.supportAlt||'Imagem anexada';showDialog(`<div class="support-image-modal"><img src="${esc(url)}" alt="${esc(alt)}"></div>`);}));}
function supportMessagesHtml(){return supportMessagesList.map(m=>{const url=m.signedUrl||'';const mime=String(m.anexo_tipo||'').toLowerCase();const filename=String(m.anexo_nome||'Anexo');const image=mime.startsWith('image/')||/\.(jpe?g|png|webp|gif|avif)$/i.test(filename);const pdf=mime==='application/pdf'||/\.pdf$/i.test(filename);const attachment=url?(image?`<button type="button" class="support-image-link" data-support-preview="${esc(url)}" data-support-alt="${esc(filename)}" aria-label="Ampliar imagem: ${esc(filename)}"><img class="support-image-preview" src="${esc(url)}" alt="${esc(filename)}" loading="lazy"><span>Ampliar imagem</span></button>`:pdf?`<a class="support-pdf-link" href="${esc(url)}" target="_blank" rel="noopener"><span aria-hidden="true">📄</span><span><strong>${esc(filename)}</strong><small>Abrir PDF em nova aba</small></span><span aria-hidden="true">↗</span></a>`:`<a href="${esc(url)}" target="_blank" rel="noopener">📎 ${esc(filename)}</a>`):'';return `<article class="support-message ${m.remetente_tipo==='admin'?'support-mine':''}"><small>${m.remetente_tipo==='admin'?'Administrador':'Comerciante'} · ${new Date(m.created_at).toLocaleString('pt-BR')}</small>${m.conteudo?`<p>${esc(m.conteudo)}</p>`:''}${attachment}</article>`;}).join('')||'<p class="admin-empty">Nenhuma mensagem ainda.</p>'; }
async function sendSupportMessage(admin){const form=document.querySelector('#support-reply-form');if(!form||!supportThread)return;const fd=new FormData(form);const conteudo=String(fd.get('conteudo')||'').trim();const file=form.querySelector('input[type=file]')?.files?.[0];try{let attachment=null;if(file){const owner=admin?adminTickets.find(t=>t.id===supportThread)?.comerciante_id:authenticatedUser.id;attachment=await supportUpload(file,owner);}await supportRequest(`${admin?'/api/admin/support':'/api/support'}/${encodeURIComponent(supportThread)}/messages`,'POST',{conteudo,anexo_url:attachment?.path,anexo_nome:attachment?.name,anexo_tipo:attachment?.type});await openSupportThread(supportThread,admin);notify('Mensagem enviada.');}catch(e){notify(e.message||'Não foi possível enviar.');}}
async function merchantApiRequest(path,method='GET',body){const {data,error}=await window.pedeiaSupabase.auth.getSession();const token=data?.session?.access_token;if(error||!token)throw new Error('Sua sessão expirou. Entre novamente.');const response=await fetch(path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Falha na operação.');return result;}
async function refreshMerchantOrders() {
  const result = await merchantApiRequest('/api/merchant/orders');
  const current = new Map(state.orders.map((order) => [String(order.id), order]));
  const nextOrders = (result.pedidos || []).map((order) => ({
    ...(current.get(String(order.id)) || {}),
    id: order.id,
    customer: order.customer || 'Cliente',
    phone: order.phone || '',
    address: order.address || '',
    payment: order.payment || 'Pix',
    fulfillment: order.fulfillment,
    status: order.status,
    total: Number(order.total || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    readyAt: order.readyAt ? new Date(order.readyAt).getTime() : Date.now(),
    createdAt: new Date(order.createdAt).getTime(),
    updatedAt: new Date(order.updatedAt).getTime(),
    notes: order.notes || '',
    items: order.items || []
  }));
  if (fingerprint(state.orders) === fingerprint(nextOrders)) return;
  state.orders = nextOrders;
  localStorage.setItem(stateKey, JSON.stringify(state));
  if (!document.activeElement?.matches('input, textarea, select')) render();
}

async function loadMerchantOrderMessages() {
  const result = await merchantApiRequest('/api/merchant/order-messages');
  const currentMessages = state.messages.filter((message) => message.scope === 'order');
  state.messages = [
    ...state.messages.filter((message) => message.scope !== 'order'),
    ...(result.mensagens || []).map((message) => ({
      id: message.id,
      orderId: message.pedido_id,
      from: message.remetente_tipo === 'comerciante' ? 'merchant' : 'customer',
      text: message.conteudo,
      time: new Date(message.created_at).toLocaleString('pt-BR'),
      scope: 'order'
    }))
  ];
  localStorage.setItem(stateKey, JSON.stringify(state));
  return fingerprint(currentMessages) !== fingerprint(state.messages.filter((message) => message.scope === 'order'));
}

async function courierRequest(path,method='GET',body){return merchantApiRequest(path,method,body);}
async function loadCouriers(){const r=await courierRequest('/api/merchant/couriers');merchantCouriers=r.entregadores||[];couriersLoaded=true;}
function couriersView(){return `<section class="page-intro"><div><p class="eyebrow">LOGÍSTICA DA LOJA</p><h1>Central de entregadores</h1><p class="intro-copy">Cadastre motoboys, compartilhe o acesso individual e organize as entregas por uma rota otimizada.</p></div><div class="courier-actions"><button class="secondary-button" data-courier-refresh>Atualizar</button><button class="primary-button" data-optimize-route>Otimizar rota dos pedidos</button></div></section>${optimizedRoute?`<section class="panel route-result"><div class="panel-heading"><div><h2>Rota otimizada</h2><p>${optimizedRoute.provider==='openrouteservice'?'Rota calculada pelo OpenRouteService.':'Endereços geocodificados; ordem original mantida até configurar ORS.'}</p></div>${optimizedRoute.mapUrl?`<a class="secondary-button" target="_blank" rel="noopener" href="${esc(optimizedRoute.mapUrl)}">Abrir mapa</a>`:''}</div><ol>${(optimizedRoute.optimized||[]).map(x=>`<li><strong>${esc(x.label||'Pedido')}</strong><small>${esc(x.address||'')}</small></li>`).join('')}</ol></section>`:''}<section class="panel courier-panel"><div class="panel-heading"><div><h2>Cadastrar motoboy</h2><p>O link de acesso é exibido uma única vez ao criar ou renovar.</p></div></div><form id="courier-create-form" class="courier-form"><label>Nome completo<input name="nome" required maxlength="120" placeholder="Nome do entregador"></label><label>Telefone<input name="telefone" maxlength="40" placeholder="(00) 00000-0000"></label><label>Veículo<input name="veiculo" maxlength="80" placeholder="Moto, placa opcional"></label><button class="primary-button" type="submit">Cadastrar e gerar link</button></form>${newlyCreatedCourierLink?`<div class="courier-link-notice"><strong>Link individual criado</strong><input readonly value="${esc(newlyCreatedCourierLink)}" id="courier-generated-link"><button type="button" class="secondary-button" data-courier-copy>Copiar link</button><small>Guarde este link e envie apenas ao entregador. Se perdê-lo, desative este cadastro e crie outro.</small></div>`:''}</section><section class="courier-list">${merchantCouriers.map(c=>`<article class="panel courier-card"><div class="courier-card-top"><div><strong>${esc(c.nome)}</strong><small>${esc(c.telefone||'Sem telefone')} ${c.veiculo?'· '+esc(c.veiculo):''}</small></div><span class="courier-state ${c.ativo?'active':'inactive'}">${c.ativo?'Ativo':'Desativado'}</span></div><p>${Number(c.pedidos_ativos||0)} pedido(s) ativo(s)</p><div class="courier-today-summary"><strong>${Number(c.entregas_hoje||0)} entregas hoje</strong><span>Taxas do dia: ${money(Number(c.ganhos_hoje||0))}</span></div><div class="courier-actions"><button class="secondary-button" data-courier-history="${c.id}">Histórico de entregas</button><button class="secondary-button" data-courier-copy-link="${c.id}" ${!c.ativo?'disabled':''}>Copiar link</button><button class="secondary-button" data-courier-toggle="${c.id}" data-active="${c.ativo?'true':'false'}">${c.ativo?'Desativar':'Ativar'}</button><button class="secondary-button" data-courier-delete="${c.id}">Excluir</button></div></article>`).join('')||'<div class="panel"><p>Nenhum entregador cadastrado ainda.</p></div>'}</section>${courierHistoryId?`<section class="panel courier-history-panel"><div class="panel-heading"><div><h2>Histórico de ${esc(merchantCouriers.find(c=>c.id===courierHistoryId)?.nome||'entregador')}</h2><p>Entregas concluídas e taxas registradas.</p></div><button class="secondary-button" data-courier-history-close>Fechar</button></div><div class="courier-history-list">${courierHistoryRows.map(h=>`<article class="courier-history-row"><div><strong>Pedido #${esc(String(h.pedido_id).slice(0,8))}</strong><small>${new Date(h.concluida_em).toLocaleString('pt-BR')} · ${esc(h.endereco||'Endereço não informado')}</small></div><strong>${money(Number(h.taxa_recebida||0))}</strong></article>`).join('')||'<p class="admin-empty">Nenhuma entrega concluída registrada.</p>'}</div></section>`:''}<section class="panel courier-note"><strong>Sobre as rotas</strong><p>O motoboy acessa seus pedidos por um link protegido. A rota abre no Google Maps com os endereços atribuídos. A otimização usa as coordenadas dos pedidos e do endereço da loja. O rastreamento GPS do entregador depende da permissão de localização do navegador.</p></section>`;}
function bindCouriers(){
  document.querySelectorAll('[data-courier-history]').forEach(b=>b.onclick=async()=>{try{const r=await courierRequest('/api/merchant/couriers/history?entregador_id='+encodeURIComponent(b.dataset.courierHistory));courierHistoryRows=r.historico||[];courierHistoryId=b.dataset.courierHistory;render();}catch(e){notify(e.message);}});
  document.querySelector('[data-courier-history-close]')?.addEventListener('click',()=>{courierHistoryId=null;courierHistoryRows=[];render();});
  document.querySelector('#courier-create-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);try{const r=await courierRequest('/api/merchant/couriers','POST',{nome:data.get('nome'),telefone:data.get('telefone'),veiculo:data.get('veiculo')});newlyCreatedCourierLink=`${location.origin}/motoboy?token=${encodeURIComponent(r.token)}`;await loadCouriers();render();notify('Entregador cadastrado. Copie e compartilhe o link.');}catch(err){notify(err.message);}});
  document.querySelector('[data-courier-refresh]')?.addEventListener('click',async()=>{try{await loadCouriers();render();}catch(e){notify(e.message);}});
  document.querySelector('[data-optimize-route]')?.addEventListener('click',async()=>{const active=(state.orders||[]).filter(o=>o.fulfillment==='delivery'&&!['Entregue','Cancelado','Cancelada'].includes(o.status));if(!active.length){notify('Não há pedidos de delivery ativos para montar uma rota.');return;}const b=document.querySelector('[data-optimize-route]');b.disabled=true;b.textContent='Calculando rota…';try{optimizedRoute=await merchantRequest('/api/merchant/routes/optimize','POST',{pedido_ids:active.map(o=>o.id)});render();notify(optimizedRoute.provider==='openrouteservice'?'Rota otimizada com sucesso.':'Endereços processados; configure ORS_API_KEY para otimização automática.');}catch(e){b.disabled=false;b.textContent='Otimizar rota dos pedidos';notify(e.message);}});
  document.querySelector('[data-courier-copy]')?.addEventListener('click',()=>{const input=document.querySelector('#courier-generated-link');input?.select();if(input)navigator.clipboard?.writeText(input.value).then(()=>notify('Link copiado.')).catch(()=>notify('Selecione e copie o link manualmente.'));});
  document.querySelectorAll('[data-courier-copy-link]').forEach(b=>b.onclick=async()=>{try{const r=await courierRequest(`/api/merchant/couriers/${encodeURIComponent(b.dataset.courierCopyLink)}/link`,'POST',{});await navigator.clipboard.writeText(r.link);notify('Link do entregador copiado.');}catch(e){notify(e.message||'Não foi possível gerar o link.');}});
  document.querySelectorAll('[data-courier-toggle]').forEach(b=>b.onclick=async()=>{try{await courierRequest(`/api/merchant/couriers/${b.dataset.courierToggle}`,'PATCH',{ativo:b.dataset.active!=='true'});await loadCouriers();render();}catch(e){notify(e.message);}});
  document.querySelectorAll('[data-courier-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir este entregador? Os pedidos serão desvinculados.'))return;try{const removed=await courierRequest(`/api/merchant/couriers/${b.dataset.courierDelete}`,'DELETE');await loadCouriers();render();notify(removed.archived?'Entregador arquivado para preservar o histórico.':'Entregador removido.');}catch(e){notify(e.message);}});
}

function merchantSupportView(){const current=merchantTickets.find(t=>t.id===supportThread);return `<section class="page-intro"><div><p class="eyebrow">ATENDIMENTO PEDEIA</p><h1>Falar com o administrador</h1><p class="intro-copy">Tire dúvidas, informe problemas ou envie comprovantes de pagamento.</p></div></section><section class="panel support-layout"><div class="support-list"><form id="support-new-form" class="support-new"><h3>Abrir chamado</h3><label>Tipo<select name="tipo"><option value="suporte">Suporte técnico</option><option value="cobranca">Mensalidade / cobrança</option><option value="geral">Outro assunto</option></select></label><label>Assunto<input name="assunto" required maxlength="160" placeholder="Ex.: Problema nos pedidos"></label><label>Mensagem<textarea name="conteudo" required maxlength="10000" placeholder="Descreva como podemos ajudar"></textarea></label><label class="support-file">Anexar imagem ou PDF (opcional)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><button class="primary-button">Enviar chamado</button></form><h3>Minhas conversas</h3>${merchantTickets.map(t=>`<button class="support-ticket ${supportThread===t.id?'selected':''}" data-support-open="${t.id}"><strong>${esc(t.assunto)}</strong><small>${esc(t.tipo)} · ${esc(t.status)} · ${new Date(t.updated_at).toLocaleDateString('pt-BR')}</small><span>${esc(t.ultima_mensagem||'')}</span></button>`).join('')||'<p class="admin-empty">Você ainda não tem chamados.</p>'}</div><div class="support-conversation"><h3>${current?esc(current.assunto):'Selecione uma conversa'}</h3><div class="support-messages">${current?supportMessagesHtml():'<p class="admin-empty">Abra um chamado ou selecione uma conversa para ver as mensagens.</p>'}</div>${current?`<form id="support-reply-form" class="support-compose"><textarea name="conteudo" placeholder="Escreva sua resposta"></textarea><label class="support-file">Anexar imagem ou PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><button class="primary-button">Enviar resposta</button></form>`:''}</div></section>`;}
function bindSupportMerchant(){document.querySelector('#support-new-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const file=e.currentTarget.querySelector('input[type=file]')?.files?.[0];let attachment=null;if(file)attachment=await supportUpload(file,authenticatedUser.id);const result=await supportRequest('/api/support','POST',{tipo:f.get('tipo'),assunto:f.get('assunto'),conteudo:f.get('conteudo'),anexo_url:attachment?.path,anexo_nome:attachment?.name,anexo_tipo:attachment?.type});await loadMerchantTickets();await openSupportThread(result.atendimento.id,false);notify('Chamado enviado.');}catch(err){notify(err.message);}});document.querySelectorAll('[data-support-open]').forEach(b=>b.onclick=()=>openSupportThread(b.dataset.supportOpen,false));document.querySelector('#support-reply-form')?.addEventListener('submit',e=>{e.preventDefault();sendSupportMessage(false);});bindSupportPreviews();}
function adminPanel() {
  if (!adminSupportContactLoaded) loadAdminSupportContact().then(()=>{ if(isAdmin) adminPanel(); });
  const active = adminMerchants.filter(m => m.status_assinatura === 'ativa' && (!m.fim_assinatura || Date.parse(m.fim_assinatura) >= Date.now())).length;
  const pending = adminMerchants.filter(m => m.status_assinatura === 'pendente').length;
  const expired = adminMerchants.filter(m => m.status_assinatura !== 'ativa' || (m.fim_assinatura && Date.parse(m.fim_assinatura) < Date.now())).length;
  app.innerHTML = `<main class="admin-shell"><header class="admin-header"><div>${brand()}<p class="eyebrow">CENTRAL DE CONTROLE</p><h1>Painel administrativo</h1><p>Gerencie comerciantes e assinaturas do PedeIA.</p></div><div class="admin-user"><span>${esc(authenticatedUser?.email || '')}</span><button class="secondary-button" data-action="logout">Sair</button></div></header><section class="admin-stats"><article><span>Comerciantes</span><strong>${adminMerchants.length}</strong></article><article><span>Assinaturas ativas</span><strong>${active}</strong></article><article><span>Pendentes</span><strong>${pending}</strong></article><article><span>Expiradas / suspensas</span><strong>${expired}</strong></article></section><section class="admin-list admin-contact-panel"><div class="admin-list-heading"><div><h2>WhatsApp de atendimento</h2><p>Este número será usado pelo botão “Falar com o administrador” quando a assinatura estiver pendente, suspensa ou expirada.</p></div></div><form id="admin-contact-form" class="admin-contact-form"><label>Nome para atendimento<input name="nome" maxlength="100" value="${esc(adminSupportContact.name||'')}" placeholder="Ex.: Suporte PedeIA"></label><label>Número do WhatsApp<input name="whatsapp" maxlength="30" value="${esc(adminSupportContact.phone||'')}" placeholder="Ex.: 5581999999999"></label><button class="primary-button">Salvar contato</button></form></section><section class="admin-list"><div class="admin-list-heading"><div><h2>Comerciantes</h2><p>Ative, renove ou suspenda o acesso.</p></div><button class="secondary-button" data-admin-refresh>Atualizar</button></div>${adminMerchants.length ? adminMerchants.map(m => { const exp = m.fim_assinatura ? new Date(m.fim_assinatura).toLocaleDateString('pt-BR') : 'Sem prazo'; const live = m.status_assinatura === 'ativa' && (!m.fim_assinatura || Date.parse(m.fim_assinatura) >= Date.now()); return `<article class="admin-merchant"><div class="admin-merchant-info"><strong>${esc(m.nome || 'Comerciante')}</strong><span>${esc(m.email || '')}</span><small>${esc(m.loja_nome || 'Loja ainda não cadastrada')} · ${Number(m.total_pedidos || 0)} pedidos</small></div><div class="admin-merchant-status"><b class="admin-status ${live ? 'active' : m.status_assinatura === 'pendente' ? 'pending' : 'blocked'}">${live ? 'Ativa' : esc(m.status_assinatura || 'pendente')}</b><small>Vencimento: ${exp}</small></div><div class="admin-actions"><button class="primary-button" data-admin-status="ativa" data-admin-id="${m.id}">Ativar 30 dias</button><button class="secondary-button" data-admin-message="${m.id}">Enviar mensagem</button><button class="secondary-button" data-admin-status="suspensa" data-admin-id="${m.id}">Suspender</button><button class="secondary-button" data-admin-status="pendente" data-admin-id="${m.id}">Pendente</button></div></article>`; }).join('') : '<p class="admin-empty">Nenhum comerciante cadastrado ainda.</p>'}</section><section class="admin-list support-admin"><div class="admin-list-heading"><div><h2>Central de atendimento</h2><p>Mensagens, cobranças e chamados dos comerciantes.</p></div><button class="secondary-button" data-support-refresh>Atualizar</button></div><div class="support-layout"><div class="support-list">${adminTickets.map(t=>`<article class="support-ticket-wrap ${supportThread===t.id?'selected':''}"><button class="support-ticket" data-admin-thread="${t.id}"><strong>${esc(t.loja_nome||t.comerciante_nome||'Comerciante')}</strong><small>${esc(t.tipo)} · ${esc(t.status)}</small><span>${esc(t.assunto)} — ${esc(t.ultima_mensagem||'')}</span></button><div class="support-ticket-controls"><label>Status<select data-ticket-status="${t.id}"><option value="novo" ${t.status==='novo'?'selected':''}>Novo</option><option value="em_andamento" ${t.status==='em_andamento'?'selected':''}>Em andamento</option><option value="resolvido" ${t.status==='resolvido'?'selected':''}>Resolvido</option></select></label><button type="button" class="secondary-button" data-ticket-delete="${t.id}">Excluir</button></div></article>`).join('')||'<p class="admin-empty">Nenhum atendimento recebido.</p>'}</div><div class="support-conversation"><h3>${supportThread?(adminTickets.find(t=>t.id===supportThread)?.assunto||'Conversa'): 'Selecione um atendimento'}</h3><div class="support-messages">${supportThread?supportMessagesHtml():'<p class="admin-empty">Selecione uma conversa para responder.</p>'}</div>${supportThread?`<form id="support-reply-form" class="support-compose"><textarea name="conteudo" placeholder="Digite sua resposta"></textarea><label class="support-file">Anexar QR Code, imagem ou PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><button class="primary-button">Enviar resposta</button></form>`:''}</div></div></section></main>`;
  bindSupportPreviews();
  document.querySelector('[data-support-refresh]')?.addEventListener('click',async()=>{try{await loadAdminTickets();adminPanel();}catch(e){notify(e.message);}});
  document.querySelectorAll('[data-admin-thread]').forEach(b=>b.onclick=()=>openSupportThread(b.dataset.adminThread,true));
  document.querySelectorAll('[data-ticket-status]').forEach(select=>select.addEventListener('change',async()=>{const id=select.dataset.ticketStatus;try{await supportRequest(`/api/admin/support/${encodeURIComponent(id)}`,'PATCH',{status:select.value});await loadAdminTickets();adminPanel();notify('Status do chamado atualizado.');}catch(e){notify(e.message);}}));
  document.querySelectorAll('[data-ticket-delete]').forEach(button=>button.addEventListener('click',async()=>{const id=button.dataset.ticketDelete;if(!confirm('Tem certeza que deseja excluir este chamado e todas as mensagens dele?'))return;try{await supportRequest(`/api/admin/support/${encodeURIComponent(id)}`,'DELETE');if(supportThread===id){supportThread=null;supportMessagesList=[];}await loadAdminTickets();adminPanel();notify('Chamado excluído.');}catch(e){notify(e.message);}}));
  document.querySelectorAll('[data-admin-message]').forEach(b=>b.onclick=async()=>{const m=adminMerchants.find(x=>x.id===b.dataset.adminMessage);if(!m)return;const assunto=prompt('Assunto da mensagem/cobrança:','Mensalidade PedeIA');if(!assunto)return;const conteudo=prompt('Mensagem para '+(m.nome||m.email)+':','Olá! Seguem as informações para regularizar sua mensalidade.');if(!conteudo)return;try{const r=await supportRequest('/api/admin/support','POST',{comerciante_id:m.id,tipo:'cobranca',assunto,conteudo});await loadAdminTickets();await openSupportThread(r.atendimento.id,true);notify('Mensagem enviada ao comerciante.');}catch(e){notify(e.message);}});
  document.querySelector('#support-reply-form')?.addEventListener('submit',e=>{e.preventDefault();sendSupportMessage(true);});
  document.querySelector('[data-admin-refresh]')?.addEventListener('click', async () => { try { await loadAdminMerchants(); adminPanel(); } catch (e) { notify(e.message); } });
  document.querySelectorAll('[data-admin-status]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.adminId, status = button.dataset.adminStatus;
    const actionLabel = status === 'ativa' ? 'ativar por 30 dias' : status === 'suspensa' ? 'suspender' : 'marcar como pendente';
    if (!confirm(`Deseja ${actionLabel} a assinatura deste comerciante?`)) return;
    button.disabled = true;
    try { await adminRequest(`/api/admin/merchants/${encodeURIComponent(id)}/subscription`, 'PATCH', { status, days: 30 }); await loadAdminMerchants(); adminPanel(); notify('Assinatura atualizada com sucesso.'); }
    catch (e) { button.disabled = false; notify(e.message); }
  }));
  document.querySelector('#admin-contact-form')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await adminRequest('/api/admin/support-contact','PATCH',{name:String(fd.get('nome')||'').trim(),phone:String(fd.get('whatsapp')||'').trim()});adminSupportContact={name:String(fd.get('nome')||'').trim(),phone:String(fd.get('whatsapp')||'').trim()};adminSupportContactLoaded=true;notify('Contato do WhatsApp salvo.');adminPanel();}catch(err){notify(err.message);}});
  document.querySelector('[data-action="logout"]')?.addEventListener('click', () => window.pedeiaSupabase.auth.signOut());
}

async function bootstrap() {
  await loadFromServer();
  if (publicShop() !== null) {
    if (!await loadPublicShopFromDatabase()) {
      render();
      startLiveRefresh();
      return;
    }
    render();
    startLiveRefresh();
    return;
  }
  await syncServerState();

  try {
    const { data, error } = await window.pedeiaSupabase.auth.getSession();
    const user = data?.session?.user;
    if (!error && user && user.email_confirmed_at) {
      authenticatedUser = user;
      if (await checkAdmin()) { await loadAdminMerchants(); } else { selectUserState(user); const saved = await loadMerchantState(); if (saved === false) await attachMerchantToUser(user); }
    } else if (data?.session) {
      await window.pedeiaSupabase.auth.signOut();
    }
  } catch {
    authenticatedUser = null;
  }

  window.pedeiaSupabase.auth.onAuthStateChange((event, session) => {
    authenticatedUser = session?.user?.email_confirmed_at ? session.user : null;
    isAdmin = false;
    if (event === 'SIGNED_OUT') {
      clearInterval(window.__pedeiaLiveRefresh);
      window.__pedeiaLiveRefresh = null;
      stateKey = baseStateKey;
      render();
    } else if (authenticatedUser) {
      checkAdmin().then(async (admin) => {
        if (admin) { try { await loadAdminMerchants(); } catch (e) { notify(e.message); } }
        else { selectUserState(authenticatedUser); await loadMerchantState(); }
        render();
        if (!admin) startLiveRefresh();
      });
    }
  });

  render();
  if (publicShop() !== null || merchantLogged()) startLiveRefresh();
}

function startLiveRefresh() {
  if (window.__pedeiaLiveRefresh) return;
  if (publicShop() === null && !merchantLogged()) return;

  window.__pedeiaLiveRefresh = setInterval(async () => {
    if (publicShop() !== null) {
      const profile=JSON.parse(localStorage.getItem(clientKey)||'null')||{};
      if(profile.lastTrackingToken && state.customerView==='tracking'){
        try{const tr=await fetch('/api/order-track?token='+encodeURIComponent(profile.lastTrackingToken),{cache:'no-store'});if(tr.ok){const d=await tr.json(),o=state.orders.find(x=>x.id===d.pedido.id);if(o){o.status=d.pedido.status;o.updatedAt=new Date(d.pedido.updated_at).getTime();o.courierLocation=d.pedido.localizacao;render();}}}catch{}
      }
      if (Date.now() - lastSubscriptionCheck >= 30000) {
        if (await loadPublicShopFromDatabase()) render();
      }
      return;
    }
    if (document.activeElement?.matches('input, textarea, select')) {
      closeShopAtScheduledTime();
      return;
    }
    if (!merchantLogged()) return;
    if (document.activeElement?.matches('input, textarea, select')) {
      closeShopAtScheduledTime();
      return;
    }
    if (merchantRefreshInFlight) return;
    merchantRefreshInFlight = true;
    try {
      await refreshMerchantOrders();
      if (state.view === 'chat' && await loadMerchantOrderMessages()) render();
    } catch (error) {
      console.error('Falha ao atualizar pedidos e conversas:', error.message);
    } finally {
      merchantRefreshInFlight = false;
    }
    closeShopAtScheduledTime();
  }, 5000);
}

async function refreshShopSubscription() {
  const publicId = publicShop();
  if (!publicId) return;

  subscriptionCheckLoading = true;
  subscriptionCheckError = false;
  render();

  try {
    const response = await fetch(`/api/shop-subscription?loja=${encodeURIComponent(publicId)}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('subscription check failed');
    verifiedSubscription = await response.json();
    lastSubscriptionCheck = Date.now();
  } catch {
    verifiedSubscription = null;
    subscriptionCheckError = true;
  } finally {
    subscriptionCheckLoading = false;
    render();
  }
}

function authView() {
  app.innerHTML = `
    <main class="auth-screen">
      <div class="auth-art">
        ${brand()}
        <div class="art-copy">
          <span class="eyebrow">PARA QUEM FAZ ACONTECER</span>
          <h1>Seu negocio.<br><em>Do seu jeito.</em></h1>
          <p>Uma central bonita para vender, organizar pedidos e conversar com quem escolheu sua loja.</p>
          <div class="art-tiles">
            <div class="art-tile burger-tile"></div>
            <div class="art-tile drink-tile"></div>
            <div class="art-tile chart-tile"></div>
          </div>
        </div>
      </div>
      <section class="auth-card">
        <span class="eyebrow">PAINEL DO COMERCIANTE</span>
        <h2>Vamos comecar?</h2>
        <p>Crie sua conta e coloque sua loja no ar.</p>
        <div class="auth-tabs">
          <button class="selected" data-auth="register">Criar conta</button>
          <button data-auth="login">Entrar</button>
        </div>

        <form id="register-form" class="auth-form">
          <label>Seu nome<input name="nome" required placeholder="Como podemos chamar voce?"></label>
          <label>E-mail<input name="email" type="email" required placeholder="voce@email.com"></label>
          <label>Senha<input name="password" type="password" minlength="6" required placeholder="Minimo de 6 caracteres"></label>
          <label>Nome do comercio<input name="shopName" required placeholder="Ex.: Brasa & Massa"></label>
          <label>Tipo de comercio<select name="shopType"><option>Restaurante</option><option>Lanchonete</option><option>Hamburgueria</option><option>Pizzaria</option><option>Loja</option><option>Outro comercio</option></select></label>
          <button class="primary-button auth-submit">Criar minha conta <b>-></b></button>
        </form>

        <form id="login-form" class="auth-form hidden">
          <label>E-mail<input name="email" type="email" required placeholder="voce@email.com"></label>
          <label>Senha<input name="password" type="password" required placeholder="Sua senha"></label>
          <button class="primary-button auth-submit">Entrar no painel <b>-></b></button>
        </form>

        <p class="auth-note">O cliente pode pedir sem cadastro. Se criar uma conta, seus dados ficam disponiveis em outros dispositivos quando o banco estiver conectado.</p>
      </section>
    </main>
  `;

  document.querySelectorAll('[data-auth]').forEach((button) => {
    button.onclick = () => switchAuth(button.dataset.auth);
  });
  document.querySelector('#register-form').onsubmit = registerMerchant;
  document.querySelector('#login-form').onsubmit = loginMerchant;
}

function shopSetupView() {
  const metadata = authenticatedUser?.user_metadata || {};
  app.innerHTML = `
    <main class="auth-screen shop-setup-screen">
      <div class="auth-art">
        ${brand()}
        <div class="art-copy">
          <span class="eyebrow">CONTA AUTENTICADA</span>
          <h1>Sua loja começa <em>aqui.</em></h1>
          <p>Complete os dados do seu comércio para abrir o painel e começar a organizar seus pedidos.</p>
          <div class="art-tiles">
            <div class="art-tile burger-tile"></div>
            <div class="art-tile drink-tile"></div>
            <div class="art-tile chart-tile"></div>
          </div>
        </div>
      </div>
      <section class="auth-card">
        <span class="eyebrow">CONFIGURAÇÃO INICIAL</span>
        <h2>Cadastre sua loja</h2>
        <p>${esc(authenticatedUser?.email || '')}</p>
        <form id="shop-setup-form" class="auth-form">
          <label>Seu nome<input name="nome" required value="${esc(metadata.name || '')}" placeholder="Como podemos chamar você?"></label>
          <label>Nome do comércio<input name="shopName" required value="${esc(metadata.shopName || '')}" placeholder="Ex.: Brasa & Massa"></label>
          <label>Tipo de comércio<select name="shopType"><option ${metadata.shopType === 'Restaurante' ? 'selected' : ''}>Restaurante</option><option ${metadata.shopType === 'Lanchonete' ? 'selected' : ''}>Lanchonete</option><option ${metadata.shopType === 'Hamburgueria' ? 'selected' : ''}>Hamburgueria</option><option ${metadata.shopType === 'Pizzaria' ? 'selected' : ''}>Pizzaria</option><option ${metadata.shopType === 'Loja' ? 'selected' : ''}>Loja</option><option ${metadata.shopType === 'Outro comércio' ? 'selected' : ''}>Outro comércio</option></select></label>
          <button class="primary-button auth-submit">Salvar e abrir painel <b>-></b></button>
        </form>
        <button class="secondary-button" data-setup-logout>Sair da conta</button>
      </section>
    </main>
  `;

  document.querySelector('#shop-setup-form').onsubmit = finishShopSetup;
  document.querySelector('[data-setup-logout]').onclick = () => {
    authenticatedUser = null;
    stateKey = baseStateKey;
    window.pedeiaSupabase.auth.signOut().then(render);
  };
}

async function finishShopSetup(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const details = {
    name: String(data.get('name') || '').trim(),
    shopName: String(data.get('shopName') || '').trim(),
    shopType: String(data.get('shopType') || 'Loja')
  };

  if (!details.name || !details.shopName) {
    notify('Preencha seu nome e o nome do comércio.');
    return;
  }

  if (!await attachMerchantToUser(authenticatedUser, details)) {
    notify('Não foi possível criar o perfil desta loja.');
    return;
  }

  render();
  notify('Loja cadastrada. Bem-vindo ao painel!');
}

function switchAuth(type) {
  document.querySelectorAll('[data-auth]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.auth === type);
  });
  document.querySelector('#register-form').classList.toggle('hidden', type !== 'register');
  document.querySelector('#login-form').classList.toggle('hidden', type !== 'login');
}

async function registerMerchant(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = String(data.get('name') || '').trim();
  const shopName = String(data.get('shopName') || '').trim();
  const email = String(data.get('email') || '').trim().toLowerCase();
  const password = String(data.get('password') || '');
  const shopType = String(data.get('shopType') || 'Loja');

  if (!name || !shopName || !email || password.length < 6) {
    notify('Preencha todos os campos com dados validos.');
    return;
  }

  const { data: authData, error } = await window.pedeiaSupabase.auth.signUp({
    email,
    password,
    options: { data: { name, shopName, shopType } }
  });

  if (error) {
    notify(error.message || 'Nao foi possivel criar sua conta.');
    return;
  }

  const user = authData.user;
  if (!authData.session || !user?.email_confirmed_at) {
    notify('Conta criada. Confirme seu e-mail pelo link enviado antes de entrar.');
    return;
  }

  authenticatedUser = user;
  selectUserState(user);
  if (!await attachMerchantToUser(user, { name, shopName, shopType })) {
    authenticatedUser = null;
    stateKey = baseStateKey;
    await window.pedeiaSupabase.auth.signOut();
    notify('Esta conta nao pode acessar o painel desta loja.');
    return;
  }

  render();
  notify('Conta criada e e-mail confirmado.');
}

async function loginMerchant(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const email = String(data.get('email') || '').trim().toLowerCase();
  const password = String(data.get('password') || '');
  const { data: authData, error } = await window.pedeiaSupabase.auth.signInWithPassword({ email, password });

  if (error) {
    notify(error.message.includes('not confirmed') ? 'Confirme seu e-mail pelo link enviado antes de entrar.' : 'E-mail ou senha invalidos.');
    return;
  }

  const user = authData.user;
  if (!user?.email_confirmed_at) {
    await window.pedeiaSupabase.auth.signOut();
    notify('Confirme seu e-mail pelo link enviado antes de entrar.');
    return;
  }

  authenticatedUser = user;
  if (await checkAdmin()) {
    try { await loadAdminMerchants(); render(); notify('Bem-vindo ao painel administrativo.'); }
    catch (e) { notify(e.message); }
    return;
  }
  selectUserState(user);
  const saved = await loadMerchantState();
  const hasMerchant = saved === true || (saved === false && await attachMerchantToUser(user));
  render();
  if (saved === false && !hasMerchant) notify('Conta autenticada. Complete o cadastro da loja para abrir o painel.');
}

function nav(view, icon, text, count = '') {
  const badge = Number(count || 0);
  return `<button class="${state.view === view ? 'active' : ''}" data-view="${view}" aria-current="${state.view === view ? 'page' : 'false'}">${navIcon(icon)}${text}${badge > 0 ? `<b class="nav-badge">${badge}</b>` : ''}</button>`;
}

function navIcon(name) {
  const paths = {
    orders: '<path d="M7 3.5h8l3 3V20H6V3.5h1Z"/><path d="M14.5 3.5V7H18M9 11h6M9 14h6M9 17h3"/>',
    history: '<path d="M3 12a9 9 0 1 0 2.7-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    home: '<path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/>',
    menu: '<path d="M4 5.5h16M4 10.5h16M4 15.5h10M4 19.5h7"/>',
    categories: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="6" height="7" rx="1.5"/><rect x="4" y="14" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    chat: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.2-3A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8.5 11.5h.01M12.5 11.5h.01M16.5 11.5h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
    map: '<path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z"/><path d="M9 4v14M15 6v14"/>',
    reports: '<path d="M5 19V9M12 19V5M19 19v-8"/><path d="M3 19h18"/>',
    promo: '<path d="M4 7h16l-2 10H6L4 7Z"/><path d="M9 7V5h6v2"/><path d="M8 11h8"/>'
  };

  return `<span class="nav-icon ${name}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${paths[name] || ''}</svg></span>`;
}

function isActiveOrder(order) {
  const status = String(order?.status || '').trim();
  return !['Entregue', 'Finalizado', 'Cancelado', 'Cancelada'].includes(status);
}

function activeOrders() {
  return state.orders.filter(isActiveOrder);
}

function unreadMessagesCount(type = 'merchant') {
  if (type === 'merchant') {
    const activeIds = new Set(activeOrders().map((order) => String(order.id)));
    return state.messages.filter((msg) =>
      msg.scope === 'order' &&
      msg.from !== 'merchant' &&
      activeIds.has(String(msg.orderId))
    ).length;
  }
  return state.messages.filter((msg) => msg.scope === 'store' && msg.from === 'merchant').length;
}


let reportData = null;
let reportLoading = false;
let reportFilters = { period: '30', delivery: 'all', status: 'all', payment: 'all', category: 'all', product: 'all', courier: 'all' };
let reportOptions = { produtos: [], categorias: [], entregadores: [] };
let reportOptionsLoaded = false;
let reportTab = 'overview';
let promoRows = [];
let promoLoaded = false;
let courierLocations = [];
let courierLocationsLoading = false;

function reportMoney(v){ return money(Number(v||0)); }
function reportPct(value,max){ const n=Number(value||0), m=Number(max||1); return Math.max(0,Math.min(100,(n/m)*100)); }
function reportEsc(v){ return esc(v == null ? '' : String(v)); }
function reportLineChart(items){
  const data=(items||[]).slice(-14);
  if(!data.length) return '<div class="report-empty">Sem dados para este período.</div>';
  const vals=data.map(x=>Number(x.value||0)); const max=Math.max(...vals,1);
  const w=760,h=270,pad=28, innerW=w-pad*2, innerH=h-pad*2;
  const pts=data.map((x,i)=>{const xx=pad+(data.length===1?innerW/2:i*innerW/(data.length-1)); const yy=pad+innerH-(Number(x.value||0)/max)*innerH; return [xx,yy];});
  const poly=pts.map(p=>p.join(',')).join(' ');
  const area=pts.length?`${pts[0][0]},${h-pad} ${poly} ${pts.at(-1)[0]},${h-pad}`:'';
  return `<div class="report-chart-scroll"><svg class="report-line-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Faturamento ao longo do período">
    <defs><linearGradient id="reportArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(255,79,47,.28)"/><stop offset="100%" stop-color="rgba(255,79,47,0)"/></linearGradient></defs>
    <line x1="${pad}" y1="${pad}" x2="${w-pad}" y2="${pad}" class="chart-grid-line"/><line x1="${pad}" y1="${h/2}" x2="${w-pad}" y2="${h/2}" class="chart-grid-line"/><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" class="chart-grid-line"/>
    <polygon points="${area}" fill="url(#reportArea)"/><polyline points="${poly}" class="chart-line" fill="none"/>
    ${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" class="chart-point"><title>${reportEsc(data[i].label)}: ${reportMoney(data[i].value)}</title></circle>`).join('')}
    ${data.map((x,i)=>{const p=pts[i];return `<text x="${p[0]}" y="${h-7}" text-anchor="middle" class="chart-label">${reportEsc(x.label)}</text>`}).join('')}
  </svg></div>`;
}
function reportDonut(items){
  const data=(items||[]).filter(x=>Number(x.valor||0)>0).slice(0,6); const total=data.reduce((a,x)=>a+Number(x.valor||0),0);
  if(!data.length||!total) return '<div class="report-empty">Sem dados de pagamento.</div>';
  let acc=0; const r=54,c=2*Math.PI*r;
  const colors=['#ff4f2f','#1f7ae0','#16a34a','#8b5cf6','#f59e0b','#64748b'];
  const rings=data.map((x,i)=>{const val=Number(x.valor||0), dash=(val/total)*c, off=-acc*c/total; acc+=val; return `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="18" stroke-dasharray="${dash} ${c-dash}" stroke-dashoffset="${off}" transform="rotate(-90 70 70)"/>`;}).join('');
  return `<div class="report-donut-wrap"><svg class="report-donut" viewBox="0 0 140 140"><circle cx="70" cy="70" r="${r}" fill="none" stroke="#edf1f4" stroke-width="18"/>${rings}<text x="70" y="67" text-anchor="middle" class="donut-total">${reportMoney(total)}</text><text x="70" y="84" text-anchor="middle" class="donut-caption">total</text></svg><div class="report-legend">${data.map((x,i)=>`<div><span class="legend-dot" style="background:${colors[i%colors.length]}"></span><span>${reportEsc(x.pagamento||'Não informado')}</span><strong>${Math.round(Number(x.valor||0)/total*100)}%</strong></div>`).join('')}</div></div>`;
}
function reportsView(){
  const r=reportData||{};
  const tabs=[['overview','Visão geral','▦'],['sales','Vendas','↗'],['products','Produtos','◆'],['operations','Operação','◉'],['filters','Filtros','☷']];
  const tabButtons=tabs.map(([id,label,icon])=>`<button type="button" class="report-tab ${reportTab===id?'active':''}" data-report-tab="${id}"><span>${icon}</span>${label}</button>`).join('');
  const filters=`<section class="report-filters panel ${reportTab==='filters'?'report-panel-active':'report-panel-hidden'}"><div class="report-filter-head"><div><strong>Filtros dos relatórios</strong><small>Escolha os critérios e o painel será atualizado automaticamente.</small></div><button type="button" class="secondary-button" data-report-refresh ${reportLoading?'disabled':''}>Atualizar dados</button></div><div class="report-filter-grid"><label>Período<select data-report-period><option value="today" ${reportFilters.period==='today'?'selected':''}>Hoje</option><option value="yesterday" ${reportFilters.period==='yesterday'?'selected':''}>Ontem</option><option value="7" ${reportFilters.period==='7'?'selected':''}>7 dias</option><option value="30" ${reportFilters.period==='30'?'selected':''}>30 dias</option><option value="90" ${reportFilters.period==='90'?'selected':''}>90 dias</option><option value="month" ${reportFilters.period==='month'?'selected':''}>Este mês</option><option value="lastmonth" ${reportFilters.period==='lastmonth'?'selected':''}>Mês passado</option><option value="year" ${reportFilters.period==='year'?'selected':''}>Este ano</option></select></label><label>Recebimento<select data-report-delivery><option value="all">Todos</option><option value="delivery" ${reportFilters.delivery==='delivery'?'selected':''}>Delivery</option><option value="pickup" ${reportFilters.delivery==='pickup'?'selected':''}>Retirada</option></select></label><label>Status<select data-report-status><option value="all">Todos</option><option value="Entregue" ${reportFilters.status==='Entregue'?'selected':''}>Entregues</option><option value="Cancelado" ${reportFilters.status==='Cancelado'?'selected':''}>Cancelados</option><option value="Em preparo" ${reportFilters.status==='Em preparo'?'selected':''}>Em preparo</option><option value="Aguardando" ${reportFilters.status==='Aguardando'?'selected':''}>Aguardando</option></select></label><label>Pagamento<select data-report-payment><option value="all">Todos</option>${(r.paymentMethods||[]).map(x=>`<option value="${reportEsc(x)}" ${reportFilters.payment===x?'selected':''}>${reportEsc(x)}</option>`).join('')}</select></label><label>Categoria<select data-report-category><option value="all">Todas</option>${reportOptions.categorias.map(x=>`<option value="${x.id}" ${reportFilters.category===x.id?'selected':''}>${reportEsc(x.nome)}</option>`).join('')}</select></label><label>Produto<select data-report-product><option value="all">Todos</option>${reportOptions.produtos.map(x=>`<option value="${x.id}" ${reportFilters.product===x.id?'selected':''}>${reportEsc(x.nome)}</option>`).join('')}</select></label><label>Entregador<select data-report-courier><option value="all">Todos</option>${reportOptions.entregadores.map(x=>`<option value="${x.id}" ${reportFilters.courier===x.id?'selected':''}>${reportEsc(x.nome)}</option>`).join('')}</select></label></div></section>`;
  const kpis=[['Faturamento',reportMoney(r.kpis?.revenue),'↗'],['Pedidos',r.kpis?.orders||0,'#'],['Ticket médio',reportMoney(r.kpis?.averageTicket),'◉'],['Itens vendidos',r.kpis?.units||0,'▤'],['Cancelamentos',r.kpis?.cancellations||0,'×'],['Descontos',reportMoney(r.kpis?.discounts),'%']];
  const kpiHtml=`<section class="report-kpis">${kpis.map(x=>`<article class="report-kpi panel"><span class="kpi-icon">${x[2]}</span><small>${x[0]}</small><strong>${x[1]}</strong></article>`).join('')}</section>`;
  let body='';
  if(reportTab==='overview') body=`<section class="report-grid report-overview-grid"><article class="panel report-card report-chart-card"><div class="report-card-head"><div><span class="chart-eyebrow">TENDÊNCIA</span><h2>Faturamento</h2><small>Veja a evolução das vendas no período selecionado.</small></div><strong>${reportMoney(r.kpis?.revenue)}</strong></div>${reportLineChart(r.daily)}</article><article class="panel report-card"><div class="report-card-head"><div><span class="chart-eyebrow">MIX</span><h2>Formas de pagamento</h2><small>Distribuição do valor recebido.</small></div></div>${reportDonut(r.payments)}</article></section>`;
  if(reportTab==='sales') body=`<section class="report-grid"><article class="panel report-card"><div class="report-card-head"><div><span class="chart-eyebrow">HORÁRIOS</span><h2>Pedidos por horário</h2><small>Identifique os horários de maior movimento.</small></div></div><div class="report-column-chart">${(r.hours||[]).map((d,i)=>`<div class="column-item"><div class="column-value">${d.value||0}</div><div class="column-bar" style="height:${Math.max(5,reportPct(d.value,r.maxHour))}%"></div><span>${reportEsc(d.label)}h</span></div>`).join('')||'<div class="report-empty">Sem pedidos no período.</div>'}</div></article><article class="panel report-card"><div class="report-card-head"><div><span class="chart-eyebrow">FATURAMENTO</span><h2>Vendas por dia</h2><small>Comparação diária do faturamento.</small></div></div>${reportLineChart(r.daily)}</article></section>`;
  if(reportTab==='products') body=`<section class="report-grid"><article class="panel report-card"><div class="report-card-head"><div><span class="chart-eyebrow">RANKING</span><h2>Produtos mais vendidos</h2><small>Os produtos com maior volume e faturamento.</small></div></div><div class="report-ranking">${(r.topProducts||[]).map((x,i)=>`<div class="ranking-row"><b class="rank-badge">${i+1}</b><div><strong>${reportEsc(x.nome)}</strong><div class="rank-track"><i style="width:${reportPct(x.quantidade,(r.topProducts||[])[0]?.quantidade||1)}%"></i></div></div><strong>${x.quantidade} un</strong><span>${reportMoney(x.faturamento)}</span></div>`).join('')||'<div class="report-empty">Sem dados de produtos.</div>'}</div></article><article class="panel report-card"><div class="report-card-head"><div><span class="chart-eyebrow">RESUMO</span><h2>Indicadores de produto</h2><small>Resumo do desempenho dos itens.</small></div></div><div class="report-mini-stats"><div><small>Itens vendidos</small><strong>${r.kpis?.units||0}</strong></div><div><small>Produtos no ranking</small><strong>${(r.topProducts||[]).length}</strong></div><div><small>Ticket médio</small><strong>${reportMoney(r.kpis?.averageTicket)}</strong></div></div></article></section>`;
  if(reportTab==='operations') body=`<section class="report-grid"><article class="panel report-card"><div class="report-card-head"><div><span class="chart-eyebrow">OPERAÇÃO</span><h2>Resumo do período</h2><small>Pedidos, cancelamentos e descontos.</small></div></div><div class="operation-list"><div><span>Pedidos realizados</span><strong>${r.kpis?.orders||0}</strong></div><div><span>Cancelamentos</span><strong>${r.kpis?.cancellations||0}</strong></div><div><span>Descontos concedidos</span><strong>${reportMoney(r.kpis?.discounts)}</strong></div><div><span>Ticket médio</span><strong>${reportMoney(r.kpis?.averageTicket)}</strong></div></div></article><article class="panel report-card"><div class="report-card-head"><div><span class="chart-eyebrow">RECEBIMENTOS</span><h2>Valores por pagamento</h2><small>Quantidade e valor por método.</small></div></div><div class="report-ranking">${(r.payments||[]).map(x=>`<div class="payment-row"><span>${reportEsc(x.pagamento||'Não informado')}</span><div class="payment-track"><i style="width:${reportPct(x.valor,(r.payments||[])[0]?.valor||1)}%"></i></div><strong>${reportMoney(x.valor)}</strong><small>${x.quantidade} pedido(s)</small></div>`).join('')||'<div class="report-empty">Sem dados.</div>'}</div></article></section>`;
  return `<section class="page-intro report-intro"><div><p class="eyebrow">DESEMPENHO DA LOJA</p><h1>Relatórios</h1><p class="intro-copy">Painel visual para acompanhar vendas, produtos e operação sem deixar tudo aberto ao mesmo tempo.</p></div><button class="secondary-button" data-report-refresh ${reportLoading?'disabled':''}>Atualizar</button></section><nav class="report-tabs" aria-label="Seções de relatórios">${tabButtons}</nav>${filters}${kpiHtml}<div class="report-tab-content">${body}</div>`;
}
function promotionsView(){
 const rows=promoRows||[]; return `<section class="page-intro"><div><p class="eyebrow">VENDAS E OFERTAS</p><h1>Promoções</h1><p class="intro-copy">Crie descontos automáticos por produto, categoria ou loja, inclusive ofertas relâmpago.</p></div><button class="secondary-button" data-promo-refresh>Atualizar</button></section>
 <section class="panel promo-create"><h2>Criar promoção</h2><form id="promo-form"><div class="form-grid"><label>Nome<input name="nome" required maxlength="160" placeholder="Ex.: Sexta do hambúrguer"></label><label>Tipo<select name="tipo"><option value="percentual">Desconto percentual</option><option value="valor_fixo">Desconto em R$</option><option value="preco_promocional">Preço promocional</option><option value="compre_x_pague_y">Compre X, pague Y</option></select></label><label>Escopo<select name="escopo"><option value="loja">Toda a loja</option><option value="produto">Produto</option><option value="categoria">Categoria</option></select></label><label>Valor<input name="valor" type="number" min="0" step="0.01" value="10"></label><label>Quantidade X<input name="quantidade_x" type="number" min="1" value="2"></label><label>Quantidade Y<input name="quantidade_y" type="number" min="1" value="1"></label><label>Início<input name="inicio" type="datetime-local"></label><label>Fim<input name="fim" type="datetime-local"></label><label>Limite total<input name="limite_total" type="number" min="1"></label><label>Limite por cliente<input name="limite_por_cliente" type="number" min="1"></label></div><label>Produtos (quando escopo = produto)<select name="produtos" multiple size="5">${reportOptions.produtos.map(x=>`<option value="${x.id}">${esc(x.nome)} · ${reportMoney(x.preco)}</option>`).join('')}</select></label><label>Categorias (quando escopo = categoria)<select name="categorias" multiple size="5">${reportOptions.categorias.map(x=>`<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select></label><button class="primary-button">Salvar promoção</button></form></section>
 <section class="promo-list">${rows.map(x=>`<article class="panel promo-card"><div><strong>${esc(x.nome)}</strong><small>${esc(x.tipo)} · ${esc(x.escopo)} · ${new Date(x.inicio).toLocaleString('pt-BR')} ${x.fim?'até '+new Date(x.fim).toLocaleString('pt-BR'):''}</small><p>${x.ativa?'Ativa':'Pausada'} · ${x.usos||0}${x.limite_total?' / '+x.limite_total:''} uso(s)</p></div><div><strong>${x.tipo==='percentual'?Number(x.valor).toLocaleString('pt-BR')+'%':reportMoney(x.valor)}</strong><button class="secondary-button" data-promo-toggle="${x.id}" data-active="${x.ativa?'true':'false'}">${x.ativa?'Pausar':'Ativar'}</button><button class="secondary-button" data-promo-delete="${x.id}">Excluir</button></div></article>`).join('')||'<div class="panel"><p>Nenhuma promoção cadastrada.</p></div>'}</section>`;
}
function courierMapView(){
 const withGps=courierLocations.filter(c=>Number.isFinite(Number(c.ultima_latitude))&&Number.isFinite(Number(c.ultima_longitude)));
 return `<section class="page-intro"><div><p class="eyebrow">LOGÍSTICA EM TEMPO REAL</p><h1>Localizar entregadores</h1><p class="intro-copy">Veja no mapa os entregadores ativos, a cor de cada um, seus pedidos e a última localização recebida.</p></div><div class="courier-actions"><span class="courier-gps-summary">${withGps.length} com GPS · ${courierLocations.length} ativo(s)</span><button class="secondary-button" data-courier-locations-refresh>Atualizar</button></div></section><section class="panel courier-map-layout"><div class="courier-map-wrap"><div id="courier-map" class="courier-map"></div><div class="courier-map-help">Clique em um marcador para ver os dados do entregador. O mapa atualiza quando você usa <strong>Atualizar</strong>.</div></div><aside class="courier-location-list">${courierLocations.map(c=>{const hasGps=Number.isFinite(Number(c.ultima_latitude))&&Number.isFinite(Number(c.ultima_longitude));return `<button type="button" class="courier-location-card" data-courier-focus="${esc(c.id)}"><span class="courier-dot" style="background:hsl(${Number(c.hue||0)} 70% 45%)"></span><div><strong>${esc(c.nome)}</strong><small>${esc(c.telefone||'Sem telefone')}</small><small><b>${Number(c.pedidos_ativos||0)}</b> pedido(s) ativo(s) · ${hasGps?'GPS ativo':'Sem GPS recente'}</small><small>${c.localizacao_atualizada_em?'Atualizado '+new Date(c.localizacao_atualizada_em).toLocaleTimeString('pt-BR'):'Localização ainda não compartilhada'}</small></div></button>`;}).join('')||'<p class="muted">Nenhum entregador ativo cadastrado.</p>'}</aside></section>`;
}
async function loadReportOptions(){if(reportOptionsLoaded)return;try{reportOptions=await merchantRequest('/api/merchant/promotion-options');reportOptionsLoaded=true;}catch(e){notify(e.message)}}
async function loadReports(){await loadReportOptions();reportLoading=true;renderSaved();try{const q=new URLSearchParams({period:reportFilters.period,delivery:reportFilters.delivery,status:reportFilters.status,payment:reportFilters.payment,category:reportFilters.category,product:reportFilters.product,courier:reportFilters.courier});const r=await merchantRequest(`/api/merchant/reports?${q}`);reportData=r;}catch(e){notify(e.message)}finally{reportLoading=false;if(state.view==='reports')renderSaved();}}
async function loadPromotions(){await loadReportOptions();try{const r=await merchantRequest('/api/merchant/promotions');promoRows=r.promocoes||[];promoLoaded=true;}catch(e){notify(e.message)}}
async function loadCourierLocations(){courierLocationsLoading=true;try{const r=await merchantRequest('/api/merchant/couriers/locations');courierLocations=r.entregadores||[];}catch(e){notify(e.message)}finally{courierLocationsLoading=false;if(state.view==='courierMap')renderSaved();}}
let courierLeafletMap=null;
let courierLeafletMarkers=new Map();
function initCourierMap(attempt=0){
 const el=document.querySelector('#courier-map'); if(!el)return;
 if(!window.L){if(attempt<40)setTimeout(()=>initCourierMap(attempt+1),150);return;}
 try{
  if(courierLeafletMap){courierLeafletMap.remove();courierLeafletMap=null;}
  courierLeafletMarkers=new Map();
  const gps=courierLocations.filter(c=>Number.isFinite(Number(c.ultima_latitude))&&Number.isFinite(Number(c.ultima_longitude)));
  const center=gps.length?[Number(gps[0].ultima_latitude),Number(gps[0].ultima_longitude)]:[-8.28,-35.75];
  courierLeafletMap=L.map(el,{zoomControl:true}).setView(center,gps.length===1?15:13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(courierLeafletMap);
  const bounds=[];
  courierLocations.forEach(c=>{
   if(!Number.isFinite(Number(c.ultima_latitude))||!Number.isFinite(Number(c.ultima_longitude)))return;
   const lat=Number(c.ultima_latitude),lon=Number(c.ultima_longitude),hue=Number(c.hue||0);
   const marker=L.circleMarker([lat,lon],{radius:10,fillOpacity:.9,color:'#fff',weight:3,fillColor:`hsl(${hue} 70% 45%)`}).addTo(courierLeafletMap);
   marker.bindPopup(`<div class="courier-popup"><strong>${esc(c.nome)}</strong><br><span>${esc(c.telefone||'Sem telefone')}</span><br><b>${Number(c.pedidos_ativos||0)} pedido(s) ativo(s)</b><br><small>${c.localizacao_atualizada_em?'Atualizado '+new Date(c.localizacao_atualizada_em).toLocaleString('pt-BR'):'Sem atualização'}</small></div>`);
   courierLeafletMarkers.set(String(c.id),marker); bounds.push([lat,lon]);
  });
  if(bounds.length>1)courierLeafletMap.fitBounds(bounds,{padding:[35,35],maxZoom:16});
  setTimeout(()=>courierLeafletMap?.invalidateSize(),100);
  document.querySelectorAll('[data-courier-focus]').forEach(card=>card.addEventListener('click',()=>{const marker=courierLeafletMarkers.get(String(card.dataset.courierFocus));if(marker){courierLeafletMap.setView(marker.getLatLng(),16,{animate:true});marker.openPopup();}}));
 }catch(e){console.error('Falha ao montar mapa de entregadores:',e);notify('Não foi possível carregar o mapa. Atualize a página e tente novamente.');}
}
function merchantPanel() {
  const page = state.view;
  const revenue = state.orders.filter((order) => order.createdAt && order.createdAt > Date.now() - 86400000).reduce((sum, order) => sum + Number(order.total || 0), 0);
  const openDisclosures = new Set(Array.from(document.querySelectorAll('.settings-disclosure[open]'), (item) => item.dataset.disclosure));

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-header">
          ${brand()}
          <button class="mobile-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="merchant-navigation"><span></span></button>
        </div>
        <div class="shop-mini">
          <div class="shop-avatar" aria-label="Foto da loja">
            <span class="shop-avatar-fallback">${esc(String(state.shop.name || 'L').trim().slice(0, 1).toUpperCase())}</span>
            ${state.shop.photo ? `<img src="${esc(state.shop.photo)}" alt="${esc(state.shop.name || 'Loja')}" loading="eager" decoding="async">` : ''}
          </div>
          <div>
            <strong>${esc(state.shop.name)}</strong>
            <small>${state.shop.isOpen ? 'Aberta agora' : 'Fechada'}</small>
          </div>
          <button class="toggle-store ${state.shop.isOpen ? 'on' : 'off'}" data-action="toggle-open"><span></span></button>
        </div>

        <div class="persistent-link">
          <div>
            <span>LINK DA SUA LOJA</span>
            <strong>${esc(shopLink().replace(/^https?:\/\//, ''))}</strong>
          </div>
          <button data-action="copy">Copiar</button>
        </div>

        <nav class="side-nav" id="merchant-navigation">
          ${nav('orders', 'orders', 'Pedidos', activeOrders().length)}
          ${nav('history', 'history', 'Histórico', state.orders.filter((order) => ['Entregue', 'Finalizado', 'Cancelado', 'Cancelada'].includes(String(order.status || '').trim())).length)}
          ${nav('couriers', 'delivery', 'Entregadores')}
          ${nav('courierMap', 'map', 'Localizar entregadores')}
          ${nav('reports', 'reports', 'Relatórios')}
          ${nav('promotions', 'promo', 'Promoções')}
          ${nav('dashboard', 'home', 'Visao geral')}
          ${nav('menu', 'menu', 'Cardapio')}
          ${nav('categories', 'categories', 'Categorias')}
          ${nav('chat', 'chat', 'Conversas', unreadMessagesCount('merchant'))}
          ${nav('support', 'help', 'Suporte')}
          ${nav('printers', 'settings', 'Impressoras')}
          ${nav('settings', 'settings', 'Minha loja')}
        </nav>

        <div class="sidebar-bottom">
          <button class="help-link" data-action="copy">Compartilhar loja</button>
          <div class="profile-chip">
            <div class="profile-photo">${esc(state.merchant.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <strong>${esc(state.merchant.name)}</strong>
              <small>Comerciante</small>
            </div>
            <button class="logout-link" data-action="logout">Sair</button>
          </div>
        </div>
      </aside>

      <main class="main-content">
        <header class="topbar">
          <div class="breadcrumb">PedeIA <span>/</span> ${page}</div>
          <button class="outline-button" data-action="open-shop">Ver minha loja</button>
        </header>

        ${page === 'couriers' ? couriersView() : page === 'courierMap' ? courierMapView() : page === 'reports' ? reportsView() : page === 'promotions' ? promotionsView() : page === 'support' ? merchantSupportView() : page === 'orders' ? orderBoard() : page === 'history' ? orderHistoryView() : page === 'dashboard' ? overview(revenue) : page === 'menu' ? menuView() : page === 'categories' ? categoryView() : page === 'chat' ? chatView() : page === 'printers' ? printersView() : settingsView()}
      </main>
      <button class="quick-chat-fab" data-action="quick-chat" aria-label="Abrir conversas">💬</button>
    </div>
  `;

  bindMerchant();
  initTutorialForView();
  if(page==='support') bindSupportMerchant();
  if(page==='couriers'){bindCouriers();if(!couriersLoaded&&!couriersLoading){couriersLoading=true;loadCouriers().then(()=>{if(state.view==='couriers')render();}).catch(e=>notify(e.message)).finally(()=>{couriersLoading=false;});}}
  document.querySelectorAll('.settings-disclosure').forEach((item) => {
    item.open = openDisclosures.has(item.dataset.disclosure);
  });
}

function empty(title, text) {
  return `<div class="empty-panel"><span class="empty-mark"></span><strong>${title}</strong><small>${text}</small></div>`;
}

function overview(revenue) {
  return `
    <section class="page-intro">
      <div>
        <p class="eyebrow">PEDIDOS EM TEMPO REAL</p>
        <h1>O movimento da sua loja.</h1>
        <p class="intro-copy">Acompanhe o que esta chegando e o que precisa da sua atencao.</p>
      </div>
      <button class="primary-button" data-view="orders">Abrir pedidos</button>
    </section>

    <section class="stats-grid">
      <article class="stat-card warm"><span>Pedidos hoje</span><strong>${state.orders.filter((order) => sameDay(order.createdAt)).length}</strong><small>Atualizado pelos pedidos reais</small></article>
      <article class="stat-card"><span>Vendas hoje</span><strong>${money(revenue)}</strong><small>Somente pedidos recebidos hoje</small></article>
      <article class="stat-card"><span>Itens no cardapio</span><strong>${state.products.length}</strong><small>${state.products.filter((item) => item.available).length} disponiveis agora</small></article>
      <article class="stat-card"><span>Avaliacao media</span><strong>${ratingValue()}</strong><small>${state.ratings.length} avaliacoes reais</small></article>
    </section>

    <section class="panel live-preview">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">AGORA</p>
          <h2>O que esta acontecendo</h2>
        </div>
        <button class="text-button" data-view="orders">Ver quadro completo</button>
      </div>
      <div class="live-columns">
        <div><span class="live-title incoming">Chegando</span><strong>${countStatus('Aguardando')}</strong></div>
        <div><span class="live-title producing">Em producao</span><strong>${countStatus('Em preparo')}</strong></div>
        <div><span class="live-title ready">Prontos / entrega</span><strong>${countStatus('Pronto') + countStatus('Saiu para entrega')}</strong></div>
      </div>
    </section>
  `;
}

function sameDay(time) {
  if (!time) return false;
  const date = new Date(time);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function ratingValue() {
  if (!state.ratings.length) return '-';
  return (state.ratings.reduce((sum, item) => sum + Number(item.value || 0), 0) / state.ratings.length).toFixed(1);
}

function countStatus(status) {
  return state.orders.filter((order) => order.status === status).length;
}

function orderBoard() {
  const visible = filteredOrders();

  return `
    <section class="page-intro board-intro">
      <div>
        <p class="eyebrow">PEDIDOS EM TEMPO REAL</p>
        <h1>Central de pedidos</h1>
        <p class="intro-copy">Aceite, produza e finalize cada pedido sem perder o ritmo.</p>
      </div>
      <button class="primary-button" data-action="copy">Compartilhar loja</button>
    </section>

    <div class="board-tools">
      <div class="search-field">
        <span>Buscar</span>
        <input data-order-search value="${esc(state.orderQuery || '')}" placeholder="Cliente ou numero do pedido">
      </div>
      <div class="filter-pills">
        <button class="${!state.orderFilter ? 'selected' : ''}" data-filter="">Todos</button>
        <button class="${state.orderFilter === 'delivery' ? 'selected' : ''}" data-filter="delivery">Delivery</button>
        <button class="${state.orderFilter === 'pickup' ? 'selected' : ''}" data-filter="pickup">Retirada</button>
      </div>
    </div>

    <section class="order-config-panel panel">
      <div class="order-config-header">
        <div class="order-config-pill">
          <span>Balcão</span>
          <strong>${Number(state.delivery.pickupMinutes || 20)} a ${Number(state.delivery.pickupMinutes || 20) + 5} min</strong>
        </div>
        <div class="order-config-pill">
          <span>Delivery</span>
          <strong>${Number(state.delivery.deliveryMinutes || 45)} a ${Number(state.delivery.deliveryMinutes || 45) + 15} min</strong>
        </div>
      </div>
      <div class="order-config-actions">
        <label class="toggle-pill">
          <span>Aceitar os pedidos automaticamente</span>
          <input type="checkbox" data-auto-accept ${state.delivery.autoAccept ? 'checked' : ''}>
        </label>
        <button class="secondary-button" data-action="edit-order-automation">Editar</button>
      </div>
    </section>

    ${orderBoardResults(visible)}
  `;
}

function filteredOrders() {
  const query = String(state.orderQuery || '').toLowerCase();
  return state.orders.filter((order) => {
    const text = `${order.id} ${order.customer || ''}`.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesFilter = !state.orderFilter || order.fulfillment === state.orderFilter;
    return matchesQuery && matchesFilter;
  });
}

function orderClosingTime(order) {
  if (!['Entregue', 'Finalizado'].includes(order.status)) return null;
  const completedAt = Number(order.updatedAt || order.createdAt);
  if (!completedAt) return null;
  const schedule = state.shop?.schedule || defaultShopSchedule();
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const completedDate = new Date(completedAt);

  for (let offset = -1; offset <= 7; offset += 1) {
    const date = new Date(completedDate);
    date.setDate(date.getDate() + offset);
    const config = schedule[dayNames[date.getDay()]];
    if (!config?.enabled || !/^\d{2}:\d{2}$/.test(config.open || '') || !/^\d{2}:\d{2}$/.test(config.close || '')) continue;
    const [openHours, openMinutes] = config.open.split(':').map(Number);
    const [hours, minutes] = config.close.split(':').map(Number);
    const closesNextDay = hours * 60 + minutes < openHours * 60 + openMinutes;
    if (closesNextDay) date.setDate(date.getDate() + 1);
    date.setHours(hours, minutes, 0, 0);
    if (date.getTime() >= completedAt) return date.getTime();
  }
  return null;
}

function isWithinShopSchedule(schedule, now = new Date()) {
  const weekDayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  if (!schedule || !weekDayNames.some((day) => Object.prototype.hasOwnProperty.call(schedule, day))) return true;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const today = schedule[weekDayNames[now.getDay()]];
  if (today?.enabled && /^\d{2}:\d{2}$/.test(today.open || '') && /^\d{2}:\d{2}$/.test(today.close || '')) {
    const [openHour, openMinute] = today.open.split(':').map(Number);
    const [closeHour, closeMinute] = today.close.split(':').map(Number);
    const opensAt = openHour * 60 + openMinute;
    const closesAt = closeHour * 60 + closeMinute;
    if (opensAt < closesAt && minutesNow >= opensAt && minutesNow < closesAt) return true;
    if (opensAt > closesAt && minutesNow >= opensAt) return true;
  }

  const previousDay = schedule[weekDayNames[(now.getDay() + 6) % 7]];
  if (previousDay?.enabled && /^\d{2}:\d{2}$/.test(previousDay.open || '') && /^\d{2}:\d{2}$/.test(previousDay.close || '')) {
    const [openHour, openMinute] = previousDay.open.split(':').map(Number);
    const [closeHour, closeMinute] = previousDay.close.split(':').map(Number);
    if (openHour * 60 + openMinute > closeHour * 60 + closeMinute && minutesNow < closeHour * 60 + closeMinute) return true;
  }
  return false;
}

function isArchivedOrder(order, now = Date.now()) {
  const closingTime = orderClosingTime(order);
  return closingTime !== null && closingTime <= now;
}

function archivedOrders() {
  return state.orders.filter((order) => isArchivedOrder(order));
}

function closeShopAtScheduledTime(now = new Date()) {
  if (!state.shop?.isOpen) return;
  if (isWithinShopSchedule(state.shop.schedule || defaultShopSchedule(), now)) return;

  state.shop.isOpen = false;
  save();
  render();
  notify('A loja foi fechada conforme o horário de funcionamento.');
}

function historyPeriodStart(period = state.historyPeriod || 'all', now = Date.now()) {
  if (period === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const days = { '7': 7, '30': 30, '90': 90, '365': 365 }[period];
  return days ? now - (days * 86400000) : 0;
}

function historyOrders() {
  const start = historyPeriodStart();
  return filteredOrders()
    .filter((order) => ['Entregue', 'Finalizado', 'Cancelado', 'Cancelada'].includes(String(order.status || '').trim()))
    .filter((order) => !start || Number(order.createdAt || 0) >= start)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function orderHistoryView() {
  const orders = historyOrders();
  const period = state.historyPeriod || 'all';
  return `
    <section class="page-intro board-intro">
      <div>
        <p class="eyebrow">PEDIDOS CONCLUÍDOS</p>
        <h1>Histórico de pedidos</h1>
        <p class="intro-copy">Consulte pedidos antigos, entregues e cancelados. O histórico não depende mais do horário de fechamento da loja.</p>
      </div>
    </section>
    <div class="board-tools">
      <div class="search-field">
        <span>Buscar</span>
        <input data-order-search value="${esc(state.orderQuery || '')}" placeholder="Cliente ou número do pedido">
      </div>
      <div class="filter-pills">
        <button class="${!state.orderFilter ? 'selected' : ''}" data-filter="">Todos</button>
        <button class="${state.orderFilter === 'delivery' ? 'selected' : ''}" data-filter="delivery">Delivery</button>
        <button class="${state.orderFilter === 'pickup' ? 'selected' : ''}" data-filter="pickup">Retirada</button>
      </div>
    </div>
    <div class="history-period-bar" aria-label="Período do histórico">
      <span>Período:</span>
      <div class="filter-pills">
        <button class="${period === 'today' ? 'selected' : ''}" data-history-period="today">Hoje</button>
        <button class="${period === '7' ? 'selected' : ''}" data-history-period="7">7 dias</button>
        <button class="${period === '30' ? 'selected' : ''}" data-history-period="30">30 dias</button>
        <button class="${period === '90' ? 'selected' : ''}" data-history-period="90">90 dias</button>
        <button class="${period === '365' ? 'selected' : ''}" data-history-period="365">1 ano</button>
        <button class="${period === 'all' ? 'selected' : ''}" data-history-period="all">Todos</button>
      </div>
    </div>
    <section class="history-summary"><strong>${orders.length}</strong><span>pedido(s) no período selecionado</span></section>
    <section class="order-history-list">
      ${orders.map((order) => orderCard(order, true)).join('') || empty('Histórico vazio', 'Não há pedidos concluídos ou cancelados no período selecionado.')}
    </section>
  `;
}

function orderBoardResults(visible) {
  const finalOrders = visible.filter((order) =>
    ['Saiu para entrega', 'Em rota'].includes(order.status) ||
    (['Entregue', 'Finalizado'].includes(order.status) && !isArchivedOrder(order))
  );
  return `
    <section class="order-board">
      <div class="board-column incoming-column">
        <header><strong>Chegando</strong><b>${visible.filter((order) => order.status === 'Aguardando').length}</b></header>
        <div class="board-list">
          ${visible.filter((order) => order.status === 'Aguardando').map(orderCard).join('') || empty('Nada aguardando', 'Novos pedidos aparecem aqui.')}
        </div>
      </div>

      <div class="board-column producing-column">
        <header><strong>Em producao</strong><b>${visible.filter((order) => ['Em preparo', 'Pronto'].includes(order.status)).length}</b></header>
        <div class="board-list">
          ${visible.filter((order) => ['Em preparo', 'Pronto'].includes(order.status)).map(orderCard).join('') || empty('Cozinha tranquila', 'Aceite um pedido para comecar.')}
        </div>
      </div>

      <div class="board-column delivery-column">
        <header><strong>Finalizados</strong><b>${finalOrders.length}</b></header>
        <div class="board-list">
          ${finalOrders.map((order) => orderCard(order)).join('') || empty('Sem entregas no momento', 'Aqui ficam envios realizados.')}
        </div>
      </div>
    </section>
  `;
}

function orderCard(order, history = false) {
  const late = !['Entregue', 'Finalizado'].includes(order.status) && Number(order.readyAt || 0) < Date.now();
  return `
    <article class="order-card ${late ? 'late' : ''}" data-order-id="${order.id}">
      <div class="order-card-top">
        <strong>${esc(order.id)}</strong>
        <time>${remaining(order)}</time>
      </div>
      <div class="customer-line">
        <span class="customer-avatar">${esc((order.customer || '?').slice(0, 1))}</span>
        <strong>${esc(order.customer || 'Cliente')}</strong>
        <small>${order.fulfillment === 'delivery' ? 'Entrega' : 'Retirada'}</small>
      </div>
      <div class="order-place">${order.fulfillment === 'delivery' ? esc(order.address || 'Endereco nao informado') : 'Retirada no local'}</div>
      <div class="order-payment">${esc(order.payment || 'Pix')} <b>${money(order.total)}</b></div>
      ${order.notes ? `<div class="order-observation">Observacao: ${esc(order.notes)}</div>` : ''}
      <div class="card-actions">
        <button class="secondary-button" data-action="open-order" data-id="${order.id}">Ver detalhes</button>
        ${history ? '<span class="delivered-label">Entregue</span>' : order.status === 'Aguardando' ? `<button class="primary-button" data-action="accept-order" data-id="${order.id}">Aceitar agora</button>` : order.status === 'Em preparo' ? `<button class="primary-button" data-action="advance-order" data-id="${order.id}">Avancar pedido</button>` : order.status === 'Pronto' && order.fulfillment === 'delivery' ? `<button class="primary-button" data-action="advance-order" data-id="${order.id}">Saiu para entrega</button>` : !['Entregue', 'Finalizado'].includes(order.status) ? `<button class="primary-button" data-action="advance-order" data-id="${order.id}">Finalizar pedido</button>` : '<span class="delivered-label">Entregue</span>'}
      </div>
    </article>
  `;
}

function remaining(order) {
  if (!order) return 'Sem prazo';
  if (['Entregue', 'Finalizado'].includes(order.status)) return 'Finalizado';
  const readyAt = Number(order.readyAt || 0);
  const minutes = Math.ceil((readyAt - Date.now()) / 60000);
  return minutes < 0 ? `Atrasado ha ${Math.abs(minutes)} min` : `Faltam ${minutes} min`;
}

async function orderDetails(order) {
  if (authenticatedUser) {
    try {
      const result = await merchantApiRequest(`/api/merchant/order-messages?pedido_id=${encodeURIComponent(order.id)}`);
      state.messages = state.messages.filter((message) => String(message.orderId) !== String(order.id) || message.scope !== 'order')
        .concat((result.mensagens || []).map((message) => ({
          id: message.id,
          orderId: message.pedido_id,
          from: message.remetente_tipo === 'comerciante' ? 'merchant' : 'customer',
          text: message.conteudo,
          time: new Date(message.created_at).toLocaleString('pt-BR'),
          scope: 'order'
        })));
    } catch (error) {
      notify(error.message || 'Não foi possível carregar a conversa deste pedido.');
    }
  }
  const messages = state.messages.filter((msg) => String(msg.orderId) === String(order.id) && msg.scope === 'order');
  showDialog(`
    <div class="dialog-head">
      <span class="category-icon">PED</span>
      <h2>Pedido ${esc(order.id)}</h2>
      <p>${esc(order.customer || 'Cliente')} · ${order.fulfillment === 'delivery' ? esc(order.address || 'Endereco nao informado') : 'Retirada no local'}</p>
    </div>
    <div class="detail-items">
      ${(order.items || []).map((item) => `<div><strong>${item.quantity}x ${esc(item.name)}</strong><small>${esc(item.description || '')}</small>${item.selections?.length?`<small>${item.selections.map(x=>`${esc(x.group)}: ${esc(x.name)}`).join(' · ')}</small>`:''}${item.notes?`<small>Obs.: ${esc(item.notes)}</small>`:''}</div>`).join('') || '<p>Itens registrados no pedido.</p>'}
    </div>
    <div class="detail-chat">
      <strong>Conversa com este cliente</strong>
      <div class="chat-messages compact">
        ${messages.map((msg) => `<div class="message ${msg.from === 'merchant' ? 'mine' : ''}">${esc(msg.text)}<small>${esc(msg.time)}</small></div>`).join('') || '<small>Nenhuma mensagem neste pedido.</small>'}
      </div>
      <form class="inline-chat" data-order-chat="${order.id}">
        <input name="message" required placeholder="Fale sobre este pedido">
        <button>Enviar</button>
      </form>
    </div>
  `);

  document.querySelector('[data-order-chat]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.message;
    const text = String(input.value || '').trim();
    if (!text) return;
    try {
      if (authenticatedUser) {
        await merchantApiRequest('/api/merchant/order-messages', 'POST', { pedido_id: order.id, conteudo: text });
        await loadMerchantOrderMessages();
      } else {
        state.messages.push({ orderId: order.id, from: 'merchant', text, time: nowTime(), scope: 'order' });
        await save();
      }
      closeDialog();
      orderDetails(state.orders.find((item) => String(item.id) === String(order.id)) || order);
    } catch (error) {
      notify(error.message || 'Não foi possível enviar a mensagem.');
    }
  });
}

function menuView() {
  return `
    <section class="page-intro">
      <div>
        <p class="eyebrow">PRODUTOS E DISPONIBILIDADE</p>
        <h1>Cardapio</h1>
        <p class="intro-copy">Fotos, descricoes, precos e categoria em um unico formulario.</p>
      </div>
      <button class="primary-button" data-action="new-product">Novo produto</button>
    </section>

    <section class="panel full-panel">
      <div class="menu-toolbar">
        <div class="category-tabs">
          ${state.categories.map((category) => `<button>${esc(category)}</button>`).join('')}
          <button class="add-category" data-view="categories">Criar categoria</button>
        </div>
        <span class="muted">${state.products.length} produtos</span>
      </div>

      ${state.products.length ? state.products.map((product) => `
        <div class="manage-row">
          <span class="manage-emoji">${product.photo ? `<img src="${product.photo}" alt="">` : '<span class="food-placeholder"></span>'}</span>
          <div>
            <strong>${esc(product.name)}</strong>
            <small>${esc((product.categories || [product.category]).join(' · '))} · ${esc(product.description)}</small>
          </div>
          <b>${(Array.isArray(product.options) && product.options.some(g=>g.key==='sizes')) ? `A partir de ${money(product.price)}` : money(product.price)}</b>
          <label class="switch">
            <input type="checkbox" data-product="${product.id}" ${product.available ? 'checked' : ''}>
            <span></span>
          </label>
          <button class="dots" data-action="edit-product" data-id="${product.id}">Editar</button>
        </div>
      `).join('') : empty('Seu cardapio esta vazio', 'Crie uma categoria e adicione seu primeiro produto.')}
    </section>
  `;
}

function categoryView() {
  return `
    <section class="page-intro">
      <div>
        <p class="eyebrow">ORGANIZE SEU CARDAPIO</p>
        <h1>Categorias</h1>
        <p class="intro-copy">Crie abas para refris, sucos, hamburgueres, tapiocas e mais.</p>
      </div>
      <button class="primary-button" data-action="new-category">Nova categoria</button>
    </section>

    <section class="category-layout">
      <article class="panel category-create">
        <div class="category-icon">+</div>
        <h2>Uma categoria para cada desejo</h2>
        <p>Ajude o cliente a encontrar o que quer.</p>
        <button class="primary-button" data-action="new-category">Criar categoria</button>
      </article>

      <article class="panel">
        ${state.categories.length ? state.categories.map((category, index) => `
          <div class="category-row">
            <span>${String(index + 1).padStart(2, '0')}</span>
            <strong>${esc(category)}</strong>
            <small>${state.products.filter((item) => (item.categories || [item.category]).includes(category)).length} produtos</small>
            <button data-action="remove-category" data-category="${esc(category)}">Remover</button>
          </div>
        `).join('') : empty('Nenhuma categoria criada', 'Comece criando a primeira aba.')}
      </article>
    </section>
  `;
}

function chatView() {
  const filter = state.chatFilter || 'all';
  const statusFilter = state.chatStatusFilter || 'all';
  const active = activeOrders();
  const withMessages = active.filter((order) => state.messages.some((message) => message.scope === 'order' && String(message.orderId) === String(order.id)));
  const filtered = withMessages.filter((order) => {
    const typeOk = filter === 'all' || String(order.fulfillment || '').toLowerCase() === filter;
    const statusOk = statusFilter === 'all' || String(order.status || '').trim() === statusFilter;
    return typeOk && statusOk;
  }).sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));

  return `
    <section class="page-intro">
      <div>
        <p class="eyebrow">CONVERSE COM QUEM PEDIU</p>
        <h1>Conversas</h1>
        <p class="intro-copy">Somente conversas de pedidos ativos. Clique em um pedido para abrir a conversa.</p>
      </div>
    </section>

    <section class="chat-toolbar panel">
      <div class="chat-filter-group" aria-label="Tipo de pedido">
        <span>Tipo:</span>
        <button class="filter-pill ${filter === 'all' ? 'selected' : ''}" data-chat-filter="all">Todos</button>
        <button class="filter-pill ${filter === 'delivery' ? 'selected' : ''}" data-chat-filter="delivery">Entrega</button>
        <button class="filter-pill ${filter === 'pickup' ? 'selected' : ''}" data-chat-filter="pickup">Retirada</button>
      </div>
      <label class="chat-status-filter">Status:
        <select data-chat-status-filter>
          <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>Todos os ativos</option>
          <option value="Aguardando" ${statusFilter === 'Aguardando' ? 'selected' : ''}>Aguardando</option>
          <option value="Em preparo" ${statusFilter === 'Em preparo' ? 'selected' : ''}>Em preparo</option>
          <option value="Pronto" ${statusFilter === 'Pronto' ? 'selected' : ''}>Pronto</option>
          <option value="Saiu para entrega" ${statusFilter === 'Saiu para entrega' ? 'selected' : ''}>Saiu para entrega</option>
          <option value="Em rota" ${statusFilter === 'Em rota' ? 'selected' : ''}>Em rota</option>
        </select>
      </label>
      <span class="chat-result-count">${filtered.length} conversa(s)</span>
    </section>

    <section class="merchant-conversations">
      ${filtered.map((order) => {
        const messages = state.messages.filter((message) => message.scope === 'order' && String(message.orderId) === String(order.id));
        const last = messages[messages.length - 1];
        const open = String(merchantChatOpenId || '') === String(order.id);
        const fulfillmentLabel = String(order.fulfillment || '').toLowerCase() === 'delivery' ? 'Entrega' : 'Retirada';
        return `<article class="panel merchant-conversation ${open ? 'is-open' : ''}">
          <button type="button" class="merchant-conversation-toggle" data-chat-open="${esc(order.id)}" aria-expanded="${open ? 'true' : 'false'}">
            <span class="conversation-avatar" aria-hidden="true">${String(order.customer || 'C').trim().slice(0,1).toUpperCase()}</span>
            <span class="conversation-main"><strong>${esc(order.customer || 'Cliente')}</strong><small>Pedido #${esc(String(order.id).slice(0,8))} · ${esc(fulfillmentLabel)} · ${esc(order.status)}</small>${last ? `<span class="conversation-preview">${last.from === 'merchant' ? 'Você: ' : ''}${esc(last.text)}</span>` : ''}</span>
            <span class="conversation-meta"><b>${messages.length}</b><span>${open ? 'Fechar' : 'Abrir'}</span></span>
          </button>
          ${open ? `<div class="merchant-conversation-body"><div class="chat-messages compact">${messages.map((message) => `<div class="message ${message.from === 'merchant' ? 'mine' : ''}">${esc(message.text)}<small>${esc(message.time)}</small></div>`).join('')}</div><form class="chat-compose merchant-order-chat" data-order-chat="${esc(order.id)}"><input name="message" required maxlength="2000" placeholder="Responder ao cliente"><button type="submit">Enviar</button></form></div>` : ''}
        </article>`;
      }).join('') || empty('Nenhuma conversa ativa', 'As conversas aparecem aqui somente enquanto o pedido estiver ativo e houver mensagens do cliente.')}
    </section>
  `;
}

function printersView() {
  const sample = sampleOrder();
  return `
    <section class="page-intro">
      <div>
        <p class="eyebrow">IMPRESSAO E COMANDAS</p>
        <h1>Impressoras</h1>
        <p class="intro-copy">Conecte via Bluetooth, cabo USB, rede ou uso dos modelos que a sua loja preferir.</p>
      </div>
      <button class="primary-button" data-action="new-printer">Adicionar impressora</button>
    </section>

    <section class="settings-grid">
      <details class="panel shop-editor settings-disclosure" data-disclosure="printer-devices">
        <summary class="disclosure-summary">
          <span><small>IMPRESSORAS</small><strong>Dispositivos cadastrados</strong><span>Conexões e teste de impressão</span></span>
          <span class="disclosure-indicator" aria-hidden="true"></span>
        </summary>
        <div class="disclosure-body">
          <div class="editor-cover"><span>Print</span></div>
          <div class="editor-body">
          <p class="eyebrow">DISPOSITIVOS CADASTRADOS</p>
          ${state.printers.length ? state.printers.map((printer) => `
            <div class="printer-row">
              <div>
                <strong>${esc(printer.name)}</strong>
                <small>${esc(printer.type)} · ${esc(printer.status || 'Disponivel')}</small>
              </div>
              <button class="secondary-button" data-action="connect-printer" data-printer-id="${printer.id}">${printer.status === 'Conectada' ? 'Testar' : 'Conectar'}</button>
            </div>
          `).join('') : '<p class="muted">Nenhuma impressora cadastrada.</p>'}
          </div>
        </div>
      </details>

      <details class="panel operation-settings settings-disclosure" data-disclosure="printer-options">
        <summary class="disclosure-summary">
          <span><small>CONFIGURAÇÃO</small><strong>Opções da comanda</strong><span>Formato, cópias e informações impressas</span></span>
          <span class="disclosure-indicator" aria-hidden="true"></span>
        </summary>
        <div class="disclosure-body">
        <p class="eyebrow">CONFIGURACAO DA COMANDA</p>
        <label>Tipo de conexão<select data-printer-field="mode">
          <option value="bluetooth" ${state.printerConfig.mode === 'bluetooth' ? 'selected' : ''}>Bluetooth</option>
          <option value="cabo" ${state.printerConfig.mode === 'cabo' ? 'selected' : ''}>Cabo / USB</option>
          <option value="rede" ${state.printerConfig.mode === 'rede' ? 'selected' : ''}>Rede / IP</option>
          <option value="pdf" ${state.printerConfig.mode === 'pdf' ? 'selected' : ''}>PDF / impressão simples</option>
        </select></label>
        <label>Nome da impressora<input data-printer-field="deviceName" value="${esc(state.printerConfig.deviceName || '')}" placeholder="Ex.: Epson TM-T20"></label>
        <label>Quantas vias saem<input type="number" min="1" max="10" data-printer-field="copies" value="${state.printerConfig.copies || 1}"></label>
        <label class="choice-row"><input type="checkbox" data-printer-field="autoPrint" ${state.printerConfig.autoPrint ? 'checked' : ''}><span><strong>Imprimir automaticamente ao aceitar</strong><small>Sem precisar apertar o botão de impressão manual</small></span></label>
        <label class="choice-row"><input type="checkbox" data-printer-field="includeCustomer" ${state.printerConfig.includeCustomer ? 'checked' : ''}><span><strong>Incluir nome do cliente</strong></span></label>
        <label class="choice-row"><input type="checkbox" data-printer-field="includePhone" ${state.printerConfig.includePhone ? 'checked' : ''}><span><strong>Incluir telefone</strong></span></label>
        <label class="choice-row"><input type="checkbox" data-printer-field="includeAddress" ${state.printerConfig.includeAddress ? 'checked' : ''}><span><strong>Incluir dados de entrega</strong></span></label>
        <label class="choice-row"><input type="checkbox" data-printer-field="includeItems" ${state.printerConfig.includeItems ? 'checked' : ''}><span><strong>Incluir itens do pedido</strong></span></label>
        <label class="choice-row"><input type="checkbox" data-printer-field="includeNotes" ${state.printerConfig.includeNotes ? 'checked' : ''}><span><strong>Incluir observações</strong></span></label>
        <label class="choice-row"><input type="checkbox" data-printer-field="includePayment" ${state.printerConfig.includePayment ? 'checked' : ''}><span><strong>Incluir forma de pagamento</strong></span></label>
        <label class="choice-row"><input type="checkbox" data-printer-field="includeFooter" ${state.printerConfig.includeFooter ? 'checked' : ''}><span><strong>Mostrar mensagem final</strong></span></label>
        <label>Mensagem final<textarea data-printer-field="footerText" rows="2">${esc(state.printerConfig.footerText || '')}</textarea></label>
        <button class="primary-button" data-action="save-printer-config">Salvar impressora</button>
        </div>
      </details>
    </section>

  `;
}

function settingsView() {
  const schedule = state.shop.schedule || defaultShopSchedule();
  const scheduleRows = weekDays.map((day) => {
    const config = schedule[day] || { enabled: true, open: '11:00', close: '22:00' };
    return `
      <div class="hours-row">
        <label class="hours-day"><input type="checkbox" data-hours-day="${day}" ${config.enabled ? 'checked' : ''}><span>${day}</span></label>
        <div class="hours-range">
          <input type="time" data-hours-open="${day}" value="${config.open}">
          <span>até</span>
          <input type="time" data-hours-close="${day}" value="${config.close}">
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="page-intro">
      <div>
        <p class="eyebrow">CONFIGURACAO DA OPERACAO</p>
        <h1>Minha loja</h1>
        <p class="intro-copy">Escolha como sua loja recebe, prepara e entrega pedidos.</p>
      </div>
    </section>

    <section class="settings-grid">
      <details class="panel shop-editor settings-disclosure" data-disclosure="shop-profile">
        <summary class="disclosure-summary">
          <span><small>PERFIL</small><strong>Dados da loja</strong><span>Foto, nome e descrição</span></span>
          <span class="disclosure-indicator" aria-hidden="true"></span>
        </summary>
        <div class="disclosure-body">
        <div class="editor-cover"><span>PedeIA</span></div>
        <div class="editor-body">
          <label>Foto da loja<input type="file" accept="image/*" data-shop-photo></label>
          <label>Nome da loja<input data-setting="name" value="${esc(state.shop.name)}"></label>
          <label>Descricao<textarea data-setting="description">${esc(state.shop.description)}</textarea></label>
          <h3>Endereço do estabelecimento</h3>
          <div class="form-grid">
            <label>Rua<input data-setting="addressStreet" value="${esc(state.shop.addressStreet||'')}" autocomplete="street-address"></label>
            <label>Número<input data-setting="addressNumber" value="${esc(state.shop.addressNumber||'')}"></label>
            <label>Complemento<input data-setting="addressComplement" value="${esc(state.shop.addressComplement||'')}"></label>
            <label>Bairro<input data-setting="addressNeighborhood" value="${esc(state.shop.addressNeighborhood||'')}"></label>
            <label>Cidade<input data-setting="addressCity" value="${esc(state.shop.addressCity||'')}" data-shop-city></label>
            <label>Estado (UF ou nome)<input data-setting="addressState" value="${esc(state.shop.addressState||'')}" data-shop-state></label>
            <label>CEP<input data-setting="addressZip" value="${esc(state.shop.addressZip||'')}"></label>
          </div>
          <button class="primary-button" data-action="save-shop">Salvar loja</button>
        </div>
        </div>
      </details>

      <details class="panel shop-editor settings-disclosure" data-disclosure="service-neighborhoods">
        <summary class="disclosure-summary"><span><small>ENTREGA</small><strong>Bairros de atendimento</strong><span>Defina cobertura e taxa por bairro</span></span><span class="disclosure-indicator" aria-hidden="true"></span></summary>
        <div class="disclosure-body editor-body">
          <p class="muted">Cadastre manualmente os bairros atendidos e a taxa de entrega de cada um.</p>
          <form id="service-neighborhood-form" class="dialog-form">
            <div class="service-neighborhood-list">${(state.shop.serviceNeighborhoods||[]).map((item)=>{const n=typeof item==='string'?{nome:item,taxa:0}:item;return `<div class="service-neighborhood-row"><label>Bairro<input data-service-name value="${esc(n.nome||n.name||'')}" required maxlength="100"></label><label>Taxa de entrega (R$)<input data-service-fee type="number" min="0" step="0.01" value="${Number(n.taxa??n.fee??0)}" required></label><button type="button" class="secondary-button" data-remove-service-neighborhood aria-label="Remover bairro">Remover</button></div>`;}).join('')}</div>
            <div class="service-neighborhood-row service-neighborhood-add"><label>Adicionar bairro manualmente<input name="newNeighborhood" maxlength="100" placeholder="Nome do bairro"></label><label>Taxa (R$)<input name="newNeighborhoodFee" type="number" min="0" step="0.01" value="0"></label><button type="button" class="secondary-button" data-add-service-neighborhood>Adicionar</button></div>
            <button class="primary-button" type="submit">Salvar bairros e taxas</button>
          </form>
        </div>
      </details>

      <details class="panel shop-editor settings-disclosure" data-disclosure="storefront-design">
        <summary class="disclosure-summary"><span><small>APARÊNCIA</small><strong>Personalizar vitrine</strong><span>Banner, cores e ofertas em destaque</span></span><span class="disclosure-indicator" aria-hidden="true"></span></summary>
        <div class="disclosure-body editor-body">
          <label>Banner de capa<input type="file" accept="image/*" data-shop-cover></label>
          ${state.shop.cover ? `<img class="storefront-cover-preview" src="${esc(state.shop.cover)}" alt="Prévia do banner">` : '<div class="storefront-cover-preview storefront-cover-empty">A prévia do banner aparecerá aqui</div>'}
          <label>Cor principal <input type="color" data-store-theme value="${/^#[0-9a-f]{6}$/i.test(state.shop.themeColor || '') ? state.shop.themeColor : '#b9362b'}"></label>
          <label>Título da oferta <input data-promo-field="title" maxlength="80" value="${esc(state.shop.storefront?.title || '')}" placeholder="Ex.: Oferta relâmpago"></label>
          <label>Descrição da oferta <textarea data-promo-field="description" maxlength="220" placeholder="Descreva a promoção">${esc(state.shop.storefront?.description || '')}</textarea></label>
          <label>Válida até <input type="datetime-local" data-promo-field="endsAt" value="${esc(state.shop.storefront?.endsAt || '')}"></label>
          <button class="primary-button" data-action="save-storefront">Salvar personalização</button>
          <small class="muted">Esta área divulga a oferta na vitrine. O desconto no preço e a validação no checkout ainda exigem integração específica.</small>
        </div>
      </details>

      <details class="panel operation-settings settings-disclosure" data-disclosure="shop-delivery">
        <summary class="disclosure-summary">
          <span><small>OPERAÇÃO</small><strong>Formas de recebimento</strong><span>Entrega, retirada e prazos</span></span>
          <span class="disclosure-indicator" aria-hidden="true"></span>
        </summary>
        <div class="disclosure-body">
        <p class="eyebrow">FORMAS DE RECEBIMENTO</p>
        <label class="choice-row"><input type="checkbox" data-delivery="delivery" ${state.delivery.delivery ? 'checked' : ''}><span><strong>Delivery</strong><small>Cliente recebe no endereco informado</small></span></label>
        <label class="choice-row"><input type="checkbox" data-delivery="pickup" ${state.delivery.pickup ? 'checked' : ''}><span><strong>Retirada no local</strong><small>Cliente busca o pedido na loja</small></span></label>
        <label>Tempo estimado para delivery<input type="number" min="1" data-delivery-min="deliveryMinutes" value="${state.delivery.deliveryMinutes}"> minutos</label>
        <label>Tempo estimado para retirada<input type="number" min="1" data-delivery-min="pickupMinutes" value="${state.delivery.pickupMinutes}"> minutos</label>
        <button class="primary-button" data-action="save-delivery">Salvar tempos</button>

        <div class="settings-link">
          <strong>${esc(shopLink())}</strong>
          <button class="primary-button" data-action="copy">Copiar link</button>
        </div>
        </div>
      </details>

      <details class="panel schedule-settings settings-disclosure" data-disclosure="shop-hours">
        <summary class="disclosure-summary">
          <span><small>AGENDA</small><strong>Horários de funcionamento</strong><span>Dias e horários da semana</span></span>
          <span class="disclosure-indicator" aria-hidden="true"></span>
        </summary>
        <div class="disclosure-body">
        <p class="eyebrow">HORARIOS DE FUNCIONAMENTO</p>
        <h3>Configure os dias e o horario da semana</h3>
        <div class="schedule-list">
          ${scheduleRows}
        </div>
        <button class="primary-button" data-action="save-shop-hours">Salvar horarios</button>
        </div>
      </details>
    </section>
  `;
}

function customerShop() {
  if (shopSubscriptionBlocked()) return subscriptionPendingView();
  if (!state.shop) return missingShop();
  const total = state.cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const cached = JSON.parse(localStorage.getItem(clientKey) || 'null') || {};
  const tracked = state.orders
    .slice()
    .reverse()
    .find((order) => cached.lastOrderId ? order.id === cached.lastOrderId : (cached.name && order.customer === cached.name));

  const customerChatBadge = unreadMessagesCount('customer') > 0 ? `<span class="chat-badge">${unreadMessagesCount('customer')}</span>` : '';
  app.innerHTML = `
    <div class="customer-app" style="--store-accent:${/^#[0-9a-f]{6}$/i.test(state.shop.themeColor || '') ? state.shop.themeColor : '#b9362b'}">
      <header class="customer-header">
        ${brand()}
        <div class="customer-header-actions">
          <button class="chat-shop-button" data-action="customer-chat">${customerChatBadge}💬 Falar com a loja</button>
        </div>
      </header>

      <section class="store-hero" style="--store-accent:${/^#[0-9a-f]{6}$/i.test(state.shop.themeColor || '') ? state.shop.themeColor : '#b9362b'};">
        ${state.shop.cover ? `<div class="store-cover" style="background-image:linear-gradient(90deg,rgba(15,20,17,.76),rgba(15,20,17,.12)),url('${esc(state.shop.cover)}')"></div>` : ''}
        ${state.shop.photo ? `<img class="store-photo" src="${esc(state.shop.photo)}" alt="">` : '<div class="store-avatar-big"></div>'}
        <div class="store-hero-copy">
          <span class="open-pill">${state.shop.isOpen ? 'Aberta agora' : 'Fechada'}</span>
          <h1>${esc(state.shop.name)}</h1>
          <p>${esc(state.shop.description)}</p>
          <small>${esc(state.shop.type)}</small>
        </div>
      </section>

      <nav class="customer-tabs">
        <button class="${state.customerView === 'menu' ? 'active' : ''}" data-customer-view="menu">Cardapio</button>
        <button class="${state.customerView === 'tracking' ? 'active' : ''}" data-customer-view="tracking">Acompanhar pedido</button>
      </nav>

      ${tracked && state.customerView === 'tracking' ? customerTrackingPanel(tracked) : ''}

      ${state.customerView === 'menu' ? `
        ${tracked ? customerTracker(tracked) : ''}
        ${state.shop.storefront?.title && (!state.shop.storefront.endsAt || Date.parse(state.shop.storefront.endsAt) > Date.now()) ? `<section class="store-promo" style="--store-accent:${/^#[0-9a-f]{6}$/i.test(state.shop.themeColor || '') ? state.shop.themeColor : '#b9362b'}"><div><span>OFERTA EM DESTAQUE</span><h2>${esc(state.shop.storefront.title)}</h2><p>${esc(state.shop.storefront.description || '')}</p>${state.shop.storefront.endsAt ? `<small>Válida até ${new Date(state.shop.storefront.endsAt).toLocaleString('pt-BR')}</small>` : ''}</div><b>OFERTA</b></section>` : ''}
        ${state.products.some(product => product.available && product.featured) ? `<section class="featured-products"><div class="category-heading"><h2>⭐ Em destaque</h2><span>Escolhas da loja</span></div><div class="customer-products">${state.products.filter(product => product.available && product.featured).map(customerProduct).join('')}</div></section>` : ''}
        <nav class="customer-categories">
          ${state.categories.map((category) => `<a href="#${encodeURIComponent(category)}">${esc(category)}</a>`).join('')}
        </nav>

        <main class="customer-menu">
          ${state.categories.length ? state.categories.map((category) => `
            <section id="${encodeURIComponent(category)}">
              <div class="category-heading">
                <h2>${esc(category)}</h2>
                <span>${state.products.filter((item) => (item.categories || [item.category]).includes(category) && item.available).length} opcoes</span>
              </div>
              <div class="customer-products">
                ${state.products.filter((item) => (item.categories || [item.category]).includes(category) && item.available).map(customerProduct).join('')}
              </div>
            </section>
          `).join('') : '<div class="customer-empty"><strong>O cardapio esta sendo preparado.</strong><small>Volte em breve.</small></div>'}
        </main>
      ` : ''}

      <button class="floating-cart ${state.cart.length ? '' : 'empty-floating'}" data-action="open-cart">
        Carrinho ${state.cart.length ? `· ${state.cart.length} item(s) · ${money(total)}` : ''}
      </button>
    </div>
  `;

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.onclick = handleAction;
  });

  document.querySelectorAll('.merchant-order-chat').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = form.elements.message;
      const text = String(input.value || '').trim();
      if (!text) return;
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        await merchantApiRequest('/api/merchant/order-messages', 'POST', {
          pedido_id: form.dataset.orderChat,
          conteudo: text
        });
        await loadMerchantOrderMessages();
        render();
      } catch (error) {
        notify(error.message || 'Não foi possível enviar a mensagem.');
      } finally {
        if (button) button.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-customer-view]').forEach((button) => {
    button.onclick = () => {
      state.customerView = button.dataset.customerView;
      save();
      customerShop();
    };
  });
}

function customerTrackingPanel(order) {
  const delivered = order.status === 'Entregue';
  const orderItems = (order.items || []).map((item) => `
    <div class="tracking-item">
      <div>
        <strong>${item.quantity}x ${esc(item.name)}</strong>
        <small>${esc(item.description || '')}</small>
      </div>
      <span>${money((Number(item.price || 0) * Number(item.quantity || 0)))}</span>
    </div>
  `).join('');

  return `
    <section class="customer-tracking-page">
      <article class="tracking-main-card">
        <div class="tracking-header">
          <div>
            <p class="eyebrow">PEDIDO ${esc(order.id)}</p>
            <h2>${statusLabel(order.status)}</h2>
          </div>
          <span class="tracking-pill ${order.status === 'Aguardando' ? 'waiting' : order.status === 'Em preparo' ? 'preparing' : order.status === 'Pronto' || order.status === 'Saiu para entrega' ? 'ready' : 'done'}">${esc(order.status)}</span>
        </div>

        <div class="tracker-steps">
          <span class="${order.status !== 'Aguardando' ? 'done' : 'current'}">Recebido</span>
          <span class="${['Em preparo', 'Pronto', 'Saiu para entrega', 'Entregue'].includes(order.status) ? 'done' : order.status === 'Aguardando' ? '' : 'current'}">Preparando</span>
          <span class="${['Pronto', 'Saiu para entrega', 'Entregue'].includes(order.status) ? 'done' : ''}">${order.fulfillment === 'delivery' ? 'A caminho' : 'Pronto'}</span>
          <span class="${delivered ? 'done' : ''}">Finalizado</span>
        </div>

        ${order.fulfillment==='delivery' && order.status==='Em rota' || order.status==='Saiu para entrega' ? `<div class="tracking-panel"><strong>Seu pedido está a caminho</strong>${order.courierLocation?`<p>Última localização recebida: ${Number(order.courierLocation.latitude).toFixed(5)}, ${Number(order.courierLocation.longitude).toFixed(5)}</p><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.courierLocation.latitude+','+order.courierLocation.longitude)}">Ver localização no mapa</a>`:'<p>Aguardando atualização da localização do entregador.</p>'}</div>`:''}
        <div class="tracking-meta">
          <div><span>Tempo</span><strong>${remaining(order)}</strong></div>
          <div><span>Forma</span><strong>${order.fulfillment === 'delivery' ? 'Entrega' : 'Retirada'}</strong></div>
          <div><span>Total</span><strong>${money(order.total || 0)}</strong></div>
        </div>
      </article>

      <div class="tracking-grid">
        <article class="tracking-panel">
          <p class="eyebrow">RESUMO</p>
          <div class="tracking-address-block">
            <strong>${esc(order.customer || 'Cliente')}</strong>
            <small>${esc(order.phone || '')}</small>
            ${order.fulfillment === 'delivery' ? `<small>${esc(order.address || 'Endereço não informado')}</small>` : '<small>Retirada no local</small>'}
          </div>
          <div class="tracking-items">${orderItems || '<p>Itens do pedido aparecerão aqui.</p>'}</div>
        </article>

        <article class="tracking-panel">
          <p class="eyebrow">ATUALIZACOES</p>
          <div class="tracking-updates">
            <div class="update-item"><strong>Pedido recebido</strong><small>Estamos processando seu pedido.</small></div>
            <div class="update-item"><strong>Em preparo</strong><small>A cozinha esta montando sua comanda.</small></div>
            <div class="update-item"><strong>Pronto</strong><small>Seu pedido esta pronto para retirada ou entrega.</small></div>
          </div>
          <div class="tracking-actions">
            <button class="primary-button" data-action="customer-chat">Falar com a loja</button>
            ${delivered && !order.confirmed ? `<button class="primary-button" data-action="confirm-receipt" data-id="${order.id}">Confirmar recebi</button>` : ''}
            ${delivered ? `<button class="secondary-button" data-action="rate-order" data-id="${order.id}">Avaliar pedido</button>` : ''}
          </div>
        </article>
      </div>
    </section>
  `;
}

function customerTracker(order) {
  const delivered = order.status === 'Entregue';
  return `
    <section class="customer-tracker">
      <div>
        <p class="eyebrow">SEU PEDIDO ${esc(order.id)}</p>
        <h2>${statusLabel(order.status)}</h2>
        <p>${remaining(order)} · ${order.fulfillment === 'delivery' ? 'Entrega' : 'Retirada'}</p>
      </div>
      <div class="tracker-steps">
        <span class="${order.status !== 'Aguardando' ? 'done' : 'current'}">Recebido</span>
        <span class="${['Pronto', 'Saiu para entrega', 'Entregue'].includes(order.status) ? 'done' : order.status === 'Em preparo' ? 'current' : ''}">Preparando</span>
        <span class="${['Saiu para entrega', 'Entregue'].includes(order.status) ? 'done' : ''}">${order.fulfillment === 'delivery' ? 'A caminho' : 'Pronto'}</span>
        <span class="${delivered ? 'done' : ''}">Finalizado</span>
      </div>
      ${delivered && !order.confirmed ? `<button class="primary-button" data-action="confirm-receipt" data-id="${order.id}">Confirmar que recebi</button>` : ''}
      ${delivered ? `<button class="secondary-button" data-action="rate-order" data-id="${order.id}">Avaliar pedido</button>` : ''}
    </section>
  `;
}

function statusLabel(status) {
  return {
    Aguardando: 'Pedido recebido',
    'Em preparo': 'A cozinha esta preparando',
    Pronto: 'Pedido pronto',
    'Saiu para entrega': 'Saiu para entrega',
    Entregue: 'Pedido finalizado'
  }[status] || status;
}

function customerProduct(product) {
  return `
    <article class="customer-product">
      <div class="food-image">${product.photo ? `<img src="${product.photo}" alt="">` : '<span class="food-placeholder"></span>'}</div>
      <div class="customer-product-info">
        <h3>${product.featured ? '⭐ ' : ''}${esc(product.name)}</h3>
        ${product.label ? `<span class="product-label">${esc(product.label)}</span>` : ''}
        <p>${esc(product.description)}</p>
        <strong>${(Array.isArray(product.options) && product.options.some(g=>g.key==='sizes')) ? `A partir de ${money(product.price)}` : money(product.price)}</strong>
      </div>
      <button class="add-food" data-action="add-cart" data-id="${product.id}">${(Array.isArray(product.options) && product.options.length) ? 'Personalizar' : 'Adicionar'}</button>
    </article>
  `;
}

function missingShop() {
  app.innerHTML = `
    <main class="missing-shop">
      ${brand()}
      <div>
        <div class="missing-icon">!</div>
        <h1>Loja nao encontrada</h1>
        <p>Confira o link recebido ou peça um novo endereco ao comercio.</p>
        <a class="primary-button" href="/">Voltar</a>
      </div>
    </main>
  `;
}

async function loadAdminSupportContact(){
  try{const r=await fetch('/api/support-contact',{headers: authenticatedUser ? {Authorization:`Bearer ${(await window.pedeiaSupabase.auth.getSession()).data?.session?.access_token||''}`} : {}});if(!r.ok)return adminSupportContact;const data=await r.json();adminSupportContact={name:String(data.name||''),phone:String(data.phone||'')};adminSupportContactLoaded=true;return adminSupportContact;}catch{return adminSupportContact;}
}
function whatsappDigits(phone){return String(phone||'').replace(/\D/g,'');}
async function openAdminWhatsapp(){
  const contact=await loadAdminSupportContact();
  const digits=whatsappDigits(contact.phone);
  if(!digits){notify('O administrador ainda não cadastrou o WhatsApp de atendimento.');return;}
  const text=encodeURIComponent(`Olá${contact.name?` ${contact.name}`:''}, preciso de ajuda com a minha assinatura no PedeIA.`);
  window.open(`https://wa.me/${digits}?text=${text}`,'_blank','noopener');
}

function subscriptionPendingView() {
  const status = shopSubscriptionStatus().replaceAll('-', '_').replaceAll(' ', '_');
  const expiresAt = verifiedSubscription?.fim_assinatura || state.shop?.subscriptionExpiresAt || state.shop?.subscription_expires_at;
  const expired = ['expired', 'expirada', 'incomplete_expired'].includes(status) ||
    (expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) < Date.now());
  app.innerHTML = `
    <main class="subscription-pending">
      <section class="subscription-pending-panel" role="status" aria-live="polite">
        <span class="subscription-pending-icon" aria-hidden="true">!</span>
        <p class="eyebrow">${merchantLogged() ? 'ACESSO AO SISTEMA BLOQUEADO' : 'LOJA TEMPORARIAMENTE INDISPONÍVEL'}</p>
        <h1>${expired ? 'Assinatura expirada' : 'Assinatura pendente'}</h1>
        <p>${merchantLogged() ? (expired ? 'O período da sua assinatura expirou.' : 'Sua assinatura ainda está pendente.') + ' O acesso ao PedeIA está suspenso até a regularização da mensalidade. Entre em contato com o administrador para renovar o acesso.' : (expired ? 'O período da assinatura de' : 'A assinatura de') + ' <strong>' + esc(state.shop?.name || 'esta loja') + '</strong> ' + (expired ? 'expirou' : 'está pendente') + '. Para voltar a fazer pedidos, o responsável pela loja precisa renovar a assinatura.'}</p>
        ${merchantLogged() ? '<button class="primary-button" data-action="open-admin-whatsapp">Falar com o administrador</button><button class="secondary-button" data-action="logout">Sair</button>' : '<a class="primary-button" href="/">Entendi</a>'}
      </section>
    </main>
  `;
  document.querySelector('[data-action="open-admin-whatsapp"]')?.addEventListener('click',openAdminWhatsapp);
  document.querySelector('[data-action="logout"]')?.addEventListener('click',()=>window.pedeiaSupabase.auth.signOut());
}

function subscriptionCheckingView() {
  app.innerHTML = `
    <main class="subscription-pending">
      <section class="subscription-pending-panel" role="status" aria-live="polite">
        <span class="subscription-pending-icon" aria-hidden="true">...</span>
        <p class="eyebrow">AGUARDE UM INSTANTE</p>
        <h1>Verificando assinatura</h1>
        <p>Estamos confirmando se esta loja está liberada para receber pedidos.</p>
      </section>
    </main>
  `;
}

function subscriptionUnavailableView() {
  app.innerHTML = `
    <main class="subscription-pending">
      <section class="subscription-pending-panel" role="alert">
        <span class="subscription-pending-icon" aria-hidden="true">!</span>
        <p class="eyebrow">ACESSO TEMPORARIAMENTE INDISPONÍVEL</p>
        <h1>Não foi possível confirmar</h1>
        <p>Não conseguimos verificar a assinatura desta loja agora. Tente novamente em alguns instantes.</p>
        <button class="primary-button" type="button" data-action="retry-subscription">Tentar novamente</button>
      </section>
    </main>
  `;
  document.querySelector('[data-action="retry-subscription"]')?.addEventListener('click', refreshShopSubscription);
  document.querySelector('[data-action="open-admin-whatsapp"]')?.addEventListener('click',openAdminWhatsapp);
  document.querySelector('[data-action="logout"]')?.addEventListener('click',()=>window.pedeiaSupabase.auth.signOut());
}

const TUTORIALS={
  dashboard:[['Visão geral','Aqui você acompanha os principais números da sua loja.'],['Pedidos ativos','O contador mostra somente pedidos que ainda estão em andamento.'],['Menu lateral','Use o menu para acessar pedidos, histórico, entregadores, conversas, suporte e configurações.']],
  orders:[['Pedidos','Esta é a central para acompanhar os pedidos recebidos.'],['Status','Use os botões do pedido para avançar o preparo e a entrega.'],['Atualização automática','Novos pedidos e mudanças de status chegam automaticamente depois do login.']],
  history:[['Histórico','Aqui ficam os pedidos já encerrados, separados dos pedidos ativos.'],['Filtros','Use período, delivery/retirada e busca para encontrar pedidos antigos.']],
  couriers:[['Entregadores','Cadastre cada entregador uma única vez e compartilhe o link individual.'],['Localização','Quando o entregador compartilhar GPS, a posição poderá aparecer no mapa de localização.'],['Link individual','Use “Copiar link” para enviar novamente o acesso do entregador.']],
  chat:[['Conversas','Aqui aparecem apenas conversas ligadas a pedidos que ainda estão ativos.'],['Abrir conversa','Clique no pedido para abrir a conversa e responder ao cliente.']],
  support:[['Suporte','Use esta área para falar diretamente com o administrador.'],['Iniciar conversa','Abra um novo chamado somente quando precisar de atendimento.'],['Anexos','Você pode enviar imagens e PDFs junto da mensagem.']],
  printers:[['Impressoras','Cadastre e teste suas impressoras térmicas nesta área.'],['Teste','Use o teste antes de ativar a impressão automática dos pedidos.']],
  menu:[['Cardápio','Cadastre e organize seus produtos e suas opções.'],['Adicionais','Os adicionais podem ser configurados com quantidade máxima e preço por unidade.']],
  categories:[['Categorias','Organize os produtos da loja por categorias.']],
  settings:[['Minha loja','Configure os dados, horários e aparência básica da loja.']]
};
function tutorialKey(view){return `${state.merchant?.authUserId||authenticatedUser?.id||'merchant'}:${view}`;}
function tutorialSeen(view){try{return localStorage.getItem(`pedeia-tutorial-seen:${tutorialKey(view)}`)==='1';}catch{return false;}}
function setTutorialSeen(view){try{localStorage.setItem(`pedeia-tutorial-seen:${tutorialKey(view)}`,'1');}catch{}}
function tutorialTarget(view,step){const map={dashboard:['.main-content .page-intro','.main-content .stats-grid','.side-nav'],orders:['.order-board','.order-board','.side-nav'],history:['.order-history-list','.history-period-bar'],couriers:['.courier-list','.courier-list','.courier-actions'],chat:['.merchant-conversations','.merchant-conversations'],support:['.support-layout','.support-new-form','.support-list'],printers:['.printer-row','.settings-grid'],menu:['.menu-grid','.menu-grid'],categories:['.category-grid','.category-grid'],settings:['.settings-grid']};return map[view]?.[step]||'.main-content';}
function closeTutorial(){document.querySelector('.pedeia-tutorial-overlay')?.remove();tutorialOverlayOpen=false;document.body.classList.remove('tutorial-lock');}
function showTutorial(view=state.view,force=false){const steps=TUTORIALS[view]||[['PedeIA','Este robô explica os recursos desta tela.']];if(!force&&tutorialSeen(view))return;closeTutorial();tutorialState={view,step:0};tutorialOverlayOpen=true;document.body.classList.add('tutorial-lock');
  const overlay=document.createElement('div');overlay.className='pedeia-tutorial-overlay';overlay.innerHTML=`<div class="pedeia-tutorial-backdrop"></div><section class="pedeia-tutorial-card" role="dialog" aria-modal="true"><div class="pedeia-tutorial-robot">🤖</div><div class="pedeia-tutorial-content"><span class="pedeia-tutorial-kicker">TUTORIAL DA TELA</span><h2></h2><p></p><div class="pedeia-tutorial-progress"></div><div class="pedeia-tutorial-actions"><button type="button" class="secondary-button" data-tutorial-skip>Pular</button><button type="button" class="primary-button" data-tutorial-next>Próximo</button></div></div></section>`;document.body.appendChild(overlay);
  const renderStep=()=>{const step=steps[tutorialState.step];overlay.querySelector('h2').textContent=step[0];overlay.querySelector('p').textContent=step[1];overlay.querySelector('.pedeia-tutorial-progress').textContent=`${tutorialState.step+1} de ${steps.length}`;overlay.querySelector('[data-tutorial-next]').textContent=tutorialState.step===steps.length-1?'Concluir':'Próximo';document.querySelectorAll('.pedeia-tutorial-highlight').forEach(e=>e.classList.remove('pedeia-tutorial-highlight'));const target=document.querySelector(tutorialTarget(view,tutorialState.step));if(target)target.classList.add('pedeia-tutorial-highlight');};
  overlay.querySelector('[data-tutorial-skip]').onclick=()=>{setTutorialSeen(view);closeTutorial();};overlay.querySelector('[data-tutorial-next]').onclick=()=>{if(tutorialState.step>=steps.length-1){setTutorialSeen(view);closeTutorial();}else{tutorialState.step++;renderStep();}};overlay.querySelector('.pedeia-tutorial-backdrop').onclick=()=>{};renderStep();
}
function mountTutorialRobot(){if(!merchantLogged()||isAdmin)return;document.querySelector('.pedeia-tutorial-robot-fab')?.remove();const fab=document.createElement('button');fab.className='pedeia-tutorial-robot-fab';fab.type='button';fab.title='Abrir tutorial desta tela';fab.setAttribute('aria-label','Abrir tutorial desta tela');fab.innerHTML='🤖<span data-tutorial-hide title="Ocultar robô até entrar novamente no site">×</span>';if(tutorialRobotHidden)return;document.body.appendChild(fab);let dragging=false,moved=false,startX=0,startY=0,left=0,top=0;const onDown=e=>{dragging=true;moved=false;const p=e.touches?.[0]||e;const r=fab.getBoundingClientRect();left=r.left;top=r.top;startX=p.clientX;startY=p.clientY;fab.setPointerCapture?.(e.pointerId);};const onMove=e=>{if(!dragging)return;const p=e.touches?.[0]||e;const dx=p.clientX-startX,dy=p.clientY-startY;if(Math.abs(dx)+Math.abs(dy)>6)moved=true;fab.style.left=`${Math.max(4,Math.min(window.innerWidth-64,left+dx))}px`;fab.style.top=`${Math.max(4,Math.min(window.innerHeight-64,top+dy))}px`;fab.style.right='auto';};const onUp=()=>{dragging=false;};fab.addEventListener('pointerdown',onDown);fab.addEventListener('pointermove',onMove);fab.addEventListener('pointerup',onUp);fab.addEventListener('click',e=>{if(moved){e.preventDefault();return;}showTutorial(state.view,true);});fab.querySelector('[data-tutorial-hide]').addEventListener('click',e=>{e.stopPropagation();tutorialRobotHidden=true;fab.remove();notify('Robô ocultado até você entrar novamente no site.');});}
function initTutorialForView(){if(!merchantLogged()||isAdmin)return;mountTutorialRobot();setTimeout(()=>{if(!tutorialSeen(state.view))showTutorial(state.view,false);},250);}

function bindMerchant() {
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const sideNav = document.querySelector('.side-nav');
  menuToggle?.addEventListener('click', () => {
    const isOpen = sideNav.classList.toggle('open');
    menuToggle.classList.toggle('active', isOpen);
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
  });

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.onclick = async () => {
      state.view = button.dataset.view;
      if(state.view==='support'){try{await loadMerchantTickets();supportThread=merchantTickets[0]?.id||null;if(supportThread){const r=await supportRequest(`/api/support/${supportThread}/messages`);supportMessagesList=await Promise.all((r.mensagens||[]).map(async m=>({...m,signedUrl:await signedSupportUrl(m.anexo_url)})));}}catch(e){notify(e.message);}}
      if(state.view==='chat'){try{await loadMerchantOrderMessages();}catch(e){notify(e.message||'Não foi possível carregar as conversas.');}}
      if(state.view==='couriers'){try{await loadCouriers();}catch(e){notify(e.message);}}
      if(state.view==='reports'){await loadReports(); return;}
      if(state.view==='promotions'){if(!promoLoaded) await loadPromotions();} 
      if(state.view==='courierMap'){await loadCourierLocations(); return;}
      renderSaved();
    };
  });

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.onclick = handleAction;
  });

  document.querySelectorAll('[data-report-tab]').forEach(b=>b.addEventListener('click',()=>{reportTab=b.dataset.reportTab||'overview';renderSaved();}));
  document.querySelector('[data-report-refresh]')?.addEventListener('click',loadReports);
  document.querySelector('[data-report-period]')?.addEventListener('change',e=>{reportFilters.period=e.target.value;loadReports();});
  document.querySelector('[data-report-delivery]')?.addEventListener('change',e=>{reportFilters.delivery=e.target.value;loadReports();});
  document.querySelector('[data-report-status]')?.addEventListener('change',e=>{reportFilters.status=e.target.value;loadReports();});
  document.querySelector('[data-report-payment]')?.addEventListener('change',e=>{reportFilters.payment=e.target.value;loadReports();});
  document.querySelector('[data-report-category]')?.addEventListener('change',e=>{reportFilters.category=e.target.value;loadReports();});
  document.querySelector('[data-report-product]')?.addEventListener('change',e=>{reportFilters.product=e.target.value;loadReports();});
  document.querySelector('[data-report-courier]')?.addEventListener('change',e=>{reportFilters.courier=e.target.value;loadReports();});
  document.querySelector('[data-courier-locations-refresh]')?.addEventListener('click',loadCourierLocations);
  if(state.view==='courierMap'){setTimeout(initCourierMap,0);}
  document.querySelector('[data-promo-refresh]')?.addEventListener('click',async()=>{await loadPromotions();renderSaved();});
  document.querySelector('#promo-form')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await merchantRequest('/api/merchant/promotions','POST',{nome:fd.get('nome'),tipo:fd.get('tipo'),escopo:fd.get('escopo'),valor:Number(fd.get('valor')||0),quantidade_x:Number(fd.get('quantidade_x')||0),quantidade_y:Number(fd.get('quantidade_y')||0),inicio:fd.get('inicio')||null,fim:fd.get('fim')||null,limite_total:fd.get('limite_total')?Number(fd.get('limite_total')):null,limite_por_cliente:fd.get('limite_por_cliente')?Number(fd.get('limite_por_cliente')):null,produto_ids:Array.from(e.currentTarget.elements.produtos?.selectedOptions||[]).map(x=>x.value),categoria_ids:Array.from(e.currentTarget.elements.categorias?.selectedOptions||[]).map(x=>x.value)});await loadPromotions();renderSaved();notify('Promoção criada.');}catch(e){notify(e.message)}});
  document.querySelectorAll('[data-promo-toggle]').forEach(b=>b.addEventListener('click',async()=>{try{await merchantRequest(`/api/merchant/promotions/${b.dataset.promoToggle}`,'PATCH',{ativa:b.dataset.active!=='true'});await loadPromotions();renderSaved();}catch(e){notify(e.message)}}));
  document.querySelectorAll('[data-promo-delete]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Excluir esta promoção?'))return;try{await merchantRequest(`/api/merchant/promotions/${b.dataset.promoDelete}`,'DELETE');await loadPromotions();renderSaved();}catch(e){notify(e.message)}}));

  const serviceNeighborhoodForm = document.querySelector('#service-neighborhood-form');
  const persistServiceNeighborhoods = async (values) => {
    state.shop.serviceNeighborhoods = values;
    state.shop.storefront = { ...(state.shop.storefront || {}), serviceNeighborhoods: values };
    localStorage.setItem(stateKey, JSON.stringify(state));
    if (authenticatedUser) {
      await merchantStateRequest('PUT', state);
      return;
    }
    const response = await fetch('/api/save-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
    if (!response.ok) throw new Error('Não foi possível salvar os bairros e as taxas.');
  };

  serviceNeighborhoodForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rows = [...serviceNeighborhoodForm.querySelectorAll('.service-neighborhood-row:not(.service-neighborhood-add)')];
    const values = rows.map((row) => ({
      nome: row.querySelector('[data-service-name]')?.value.trim() || '',
      taxa: Number(row.querySelector('[data-service-fee]')?.value)
    }));
    if (values.some((item) => !item.nome || !Number.isFinite(item.taxa) || item.taxa < 0)) {
      notify('Informe o nome de cada bairro e uma taxa válida.');
      return;
    }
    const names = values.map((item) => normalizeNeighborhoodName(item.nome));
    if (new Set(names).size !== names.length) {
      notify('Remova os bairros duplicados antes de salvar.');
      return;
    }
    try {
      await persistServiceNeighborhoods(values);
      render();
      document.querySelector('[data-disclosure="service-neighborhoods"]')?.setAttribute('open', '');
      notify('Bairros e taxas salvos.');
    } catch (error) {
      notify(error.message || 'Não foi possível salvar os bairros e as taxas.');
    }
  });
  document.querySelector('[data-add-service-neighborhood]')?.addEventListener('click', async () => {
    const name = String(serviceNeighborhoodForm?.elements.newNeighborhood.value || '').trim();
    const fee = Number(serviceNeighborhoodForm?.elements.newNeighborhoodFee.value);
    if (!name) { notify('Digite o nome do bairro.'); return; }
    if (!Number.isFinite(fee) || fee < 0) { notify('Informe uma taxa válida e não negativa.'); return; }
    const values = (state.shop.serviceNeighborhoods || []).map((item) => typeof item === 'string'
      ? { nome: item, taxa: 0 }
      : { nome: String(item.nome || item.name || '').trim(), taxa: Number(item.taxa ?? item.fee ?? 0) });
    if (values.some((item) => normalizeNeighborhoodName(item.nome) === normalizeNeighborhoodName(name))) {
      notify('Esse bairro já está cadastrado.');
      return;
    }
    values.push({ nome: name, taxa: fee });
    const addButton = document.querySelector('[data-add-service-neighborhood]');
    if (addButton) addButton.disabled = true;
    try {
      await persistServiceNeighborhoods(values);
      render();
      document.querySelector('[data-disclosure="service-neighborhoods"]')?.setAttribute('open', '');
      notify('Bairro e taxa adicionados.');
    } catch (error) {
      notify(error.message || 'Não foi possível adicionar o bairro.');
    } finally {
      if (addButton) addButton.disabled = false;
    }
  });
  document.querySelectorAll('[data-remove-service-neighborhood]').forEach((button) => button.addEventListener('click', () => {
    button.closest('.service-neighborhood-row')?.remove();
  }));

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.onclick = () => {
      state.orderFilter = button.dataset.filter;
      renderSaved();
    };
  });

  document.querySelectorAll('[data-chat-filter]').forEach((button) => {
    button.onclick = () => {
      state.chatFilter = button.dataset.chatFilter || 'all';
      merchantChatOpenId = null;
      save();
      renderSaved();
    };
  });

  document.querySelector('[data-chat-status-filter]')?.addEventListener('change', (event) => {
    state.chatStatusFilter = event.target.value || 'all';
    merchantChatOpenId = null;
    save();
    renderSaved();
  });

  document.querySelectorAll('[data-chat-open]').forEach((button) => {
    button.onclick = () => {
      const id = String(button.dataset.chatOpen || '');
      merchantChatOpenId = String(merchantChatOpenId || '') === id ? null : id;
      renderSaved();
    };
  });

  document.querySelectorAll('[data-history-period]').forEach((button) => {
    button.onclick = () => {
      state.historyPeriod = button.dataset.historyPeriod || 'all';
      save();
      renderSaved();
    };
  });

  document.querySelector('[data-order-search]')?.addEventListener('input', (event) => {
    state.orderQuery = event.target.value;
    save();
    const board = document.querySelector('.order-board');
    if (board) board.outerHTML = orderBoardResults(filteredOrders());
    const historyList = document.querySelector('.order-history-list');
    if (historyList) historyList.innerHTML = historyOrders().map((order) => orderCard(order, true)).join('') || empty('Histórico vazio', 'Não há pedidos concluídos ou cancelados no período selecionado.');
    document.querySelectorAll('.order-board [data-action], .order-history-list [data-action]').forEach((button) => {
      button.onclick = handleAction;
    });
  });

  document.querySelectorAll('[data-product]').forEach((input) => {
    input.onchange = () => {
      const item = state.products.find((product) => String(product.id) === String(input.dataset.product));
      if (item) {
        item.available = input.checked;
        renderSaved();
      }
    };
  });

  document.querySelector('[data-shop-cover]')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) { notify('Escolha uma imagem de até 4 MB.'); return; }
    readImage(file, image => { state.shop.cover = image; renderSaved(); document.querySelector('[data-disclosure="storefront-design"]')?.setAttribute('open',''); });
  });
  document.querySelector('[data-shop-photo]')?.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    readImage(file, (image) => {
      state.shop.photo = image;
      renderSaved();
    });
  });
}

function handleAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.action;

  if (action === 'open-admin-whatsapp') return openAdminWhatsapp();
  if (action === 'new-category') return categoryDialog();
  if (action === 'new-product' || action === 'edit-product') return productDialog(button.dataset.id);
  if (action === 'remove-category') {
    const categoryName = button.dataset.category;
    const remaining = state.categories.filter((item) => item !== categoryName);
    if (!remaining.length && state.products.some((item) => (item.categories || [item.category]).includes(categoryName))) {
      notify('Crie outra categoria e transfira os produtos antes de remover esta.');
      return;
    }
    state.categories = remaining;
    state.products = state.products.map((item) => {
      const categories = (item.categories || [item.category]).filter((name) => name !== categoryName);
      if (!categories.length && remaining.length) categories.push(remaining[0]);
      return { ...item, categories, category: categories[0] || remaining[0] || '' };
    });
    return renderSaved();
  }
  if (action === 'toggle-open') {
    const nextOpen = !state.shop.isOpen;
    if (!nextOpen) {
      if (!window.confirm('Deseja fechar a loja? Os pedidos em preparo e em entrega continuarão ativos.')) return;
    }
    state.shop.isOpen = nextOpen;
    return renderSaved();
  }
  if (action === 'save-storefront') {
    state.shop.themeColor = document.querySelector('[data-store-theme]')?.value || '#b9362b';
    state.shop.storefront = state.shop.storefront || {};
    document.querySelectorAll('[data-promo-field]').forEach(input => { state.shop.storefront[input.dataset.promoField] = input.value.trim(); });
    return Promise.resolve(save()).then(() => { render(); notify('Personalização da vitrine salva.'); });
  }
  if (action === 'save-shop') {
    document.querySelectorAll('[data-setting]').forEach((input) => {
      state.shop[input.dataset.setting] = input.value.trim();
    });
    state.shop.storefront = state.shop.storefront || {};
    state.shop.storefront.serviceNeighborhoods = state.shop.serviceNeighborhoods || [];
    return renderSaved();
  }
  if (action === 'save-delivery') {
    document.querySelectorAll('[data-delivery-min]').forEach((input) => {
      state.delivery[input.dataset.deliveryMin] = Number(input.value || 0);
    });
    return renderSaved();
  }
  if (action === 'edit-order-automation') {
    showDialog(`
      <div class="dialog-head">
        <span class="category-icon">Tempo</span>
        <h2>Configurar pedidos</h2>
        <p>Escolha se aceita automaticamente e ajuste os prazos.</p>
      </div>
      <form id="automation-form" class="dialog-form">
        <label class="choice-row">
          <input type="checkbox" name="autoAccept" ${state.delivery.autoAccept ? 'checked' : ''}>
          <span><strong>Aceitar pedidos automaticamente</strong><small>Sem precisar confirmar cada ordem nova</small></span>
        </label>
        <label>Tempo estimado para retirada<input type="number" min="1" name="pickupMinutes" value="${Number(state.delivery.pickupMinutes || 20)}"></label>
        <label>Tempo estimado para delivery<input type="number" min="1" name="deliveryMinutes" value="${Number(state.delivery.deliveryMinutes || 45)}"></label>
        <button class="primary-button" type="submit">Salvar ajustes</button>
      </form>
    `);

    const form = document.querySelector('#automation-form');
    if (!form) return;
    form.onsubmit = (event) => {
      event.preventDefault();
      const data = new FormData(form);
      state.delivery.autoAccept = Boolean(data.get('autoAccept'));
      state.delivery.pickupMinutes = Number(data.get('pickupMinutes') || 20);
      state.delivery.deliveryMinutes = Number(data.get('deliveryMinutes') || 45);
      save();
      closeDialog();
      render();
      notify('Configuração salva.');
    };
    return;
  }
  if (action === 'save-shop-hours') {
    const nextSchedule = { ...defaultShopSchedule(), ...(state.shop.schedule || {}) };
    weekDays.forEach((day) => {
      const enabled = document.querySelector(`[data-hours-day="${day}"]`)?.checked ?? true;
      const open = document.querySelector(`[data-hours-open="${day}"]`)?.value || '11:00';
      const close = document.querySelector(`[data-hours-close="${day}"]`)?.value || '22:00';
      nextSchedule[day] = { enabled, open, close };
    });
    state.shop.schedule = nextSchedule;
    state.shop.storefront = { ...(state.shop.storefront || {}), schedule: nextSchedule };
    return renderSaved();
  }
  if (action === 'save-printer-config') {
    const form = document.querySelector('[data-printer-field="mode"]');
    if (form) state.printerConfig.mode = form.value;
    document.querySelectorAll('[data-printer-field]').forEach((input) => {
      const field = input.dataset.printerField;
      if (field === 'mode') return;
      if (input.type === 'checkbox') state.printerConfig[field] = input.checked;
      else if (field === 'copies') state.printerConfig[field] = Number(input.value || 1);
      else state.printerConfig[field] = String(input.value || '');
    });
    return renderSaved();
  }
  if (action === 'new-printer') {
    const nextName = `Impressora ${state.printers.length + 1}`;
    state.printers.push({
      id: `printer-${Date.now()}`,
      name: nextName,
      type: 'bluetooth',
      status: 'Disponivel',
      default: false
    });
    renderSaved();
    document.querySelector('[data-disclosure="printer-devices"]')?.setAttribute('open', '');
    return;
  }
  if (action === 'connect-printer') {
    const target = state.printers.find((printer) => printer.id === button.dataset.printerId);
    if (!target) return;
    if (navigator.bluetooth && target.type === 'bluetooth') {
      navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['device_information'] })
        .then((device) => {
          target.name = device.name || target.name;
          target.status = 'Conectada';
          state.printerConfig.deviceName = target.name;
          state.printerConfig.mode = 'bluetooth';
          save();
          renderSaved();
          notify(`Impressora ${target.name} conectada.`);
        })
        .catch(() => {
          target.status = 'Disponivel';
          save();
          renderSaved();
          notify('Conexão não confirmada. Tente novamente.');
        });
      return;
    }
    target.status = 'Conectada';
    state.printerConfig.deviceName = target.name;
    state.printerConfig.mode = target.type === 'rede' ? 'rede' : target.type === 'bluetooth' ? 'bluetooth' : 'cabo';
    save();
    renderSaved();
    notify(`Impressora ${target.name} pronta para uso.`);
    return;
  }
  if (action === 'print-test') {
    const sample = sampleOrder();
    sample.id = `#TEST-${Date.now().toString().slice(-4)}`;
    return printReceipt(sample);
  }
  if (action === 'logout') {
    authenticatedUser = null;
    stateKey = baseStateKey;
    return window.pedeiaSupabase.auth.signOut().then(render);
  }
  if (action === 'copy') {
    const text = shopLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => notify('Link copiado para compartilhar')).catch(() => {
        notify('Link pronto para copiar');
      });
    }
    notify('Link pronto para copiar');
    return;
  }
  if (action === 'open-shop') return window.open(shopLink(), '_blank', 'noopener');
  if (action === 'open-order') return orderDetails(state.orders.find((order) => order.id === button.dataset.id));
  if (action === 'accept-order') return acceptOrder(button.dataset.id);
  if (action === 'quick-chat') {
    state.view = 'chat';
    return renderSaved();
  }
  if (action === 'advance-order') return advanceOrder(button.dataset.id);

  if (action === 'add-cart') {
    const product = state.products.find((item) => String(item.id) === String(button.dataset.id));
    if (!product) return;
    if (product.options?.some((group) => (group.choices || []).length)) return productOptionsDialog(product);
    addConfiguredProduct(product, [], 0);
    return;
  }

  if (action === 'open-cart') return cartDialog();
  if (action === 'customer-chat') return customerChat();
}

async function persistOrderStatus(order,status) {
  if (authenticatedUser && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(order.id))) {
    await merchantApiRequest('/api/merchant/orders','PATCH',{pedido_id:order.id,status});
  }
  order.status=status;order.updatedAt=Date.now();
  if(['Pronto','Saiu para entrega','Entregue'].includes(status))order.readyAt=Date.now()+12*60000;
  if(!authenticatedUser)save();
}

async function acceptOrder(id) {
  const order=state.orders.find(item=>item.id===id);if(!order)return;
  try{await persistOrderStatus(order,'Em preparo');if(state.printerConfig.autoPrint)printReceipt(order);render();notify(`Pedido ${order.id} aceito.`);}catch(e){notify(e.message||'Não foi possível aceitar o pedido.');}
}

async function advanceOrder(id) {
  const order=state.orders.find(item=>item.id===id);if(!order)return;
  const next={Aguardando:'Em preparo','Em preparo':'Pronto',Pronto:order.fulfillment==='delivery'?'Saiu para entrega':'Entregue','Saiu para entrega':'Entregue','Em rota':'Entregue'};
  try{await persistOrderStatus(order,next[order.status]||'Entregue');render();notify(`Pedido ${order.id} atualizado.`);}catch(e){notify(e.message||'Não foi possível atualizar o pedido.');}
}

function sampleOrder() {
  return {
    id: '#1042',
    customer: 'Maria Souza',
    phone: '(11) 99999-0000',
    address: 'Rua da Liberdade, 240 · Centro',
    payment: 'Pix',
    fulfillment: 'delivery',
    items: [
      { quantity: 1, name: 'X-Bacon', description: 'Sem cebola', price: 32.9 },
      { quantity: 2, name: 'Refrigerante 600ml', description: 'Cola-Cola', price: 8.5 }
    ],
    notes: 'Entregar depois das 19h.',
    total: 49.9,
    createdAt: Date.now()
  };
}

function buildReceiptMarkup(order, config = state.printerConfig, preview = false) {
  const customer = config.includeCustomer ? `<div class="receipt-line"><span>Cliente</span><strong>${esc(order.customer || 'Cliente')}</strong></div>` : '';
  const phone = config.includePhone ? `<div class="receipt-line"><span>Telefone</span><strong>${esc(order.phone || '')}</strong></div>` : '';
  const address = config.includeAddress && order.fulfillment === 'delivery' ? `<div class="receipt-line"><span>Entrega</span><strong>${esc(order.address || '')}</strong></div>` : '';
  const payment = config.includePayment ? `<div class="receipt-line"><span>Pagamento</span><strong>${esc(order.payment || 'Pix')}</strong></div>` : '';
  const notes = config.includeNotes && order.notes ? `<div class="receipt-note"><span>Obs.</span><strong>${esc(order.notes)}</strong></div>` : '';
  const items = config.includeItems ? (order.items || []).map((item) => `
    <div class="receipt-item">
      <div><strong>${item.quantity}x ${esc(item.name)}</strong><small>${esc(item.description || '')}</small>${item.selections?.length?`<small>${item.selections.map(x=>`${esc(x.group)}: ${esc(x.name)}`).join(' · ')}</small>`:''}${item.notes?`<small>Obs.: ${esc(item.notes)}</small>`:''}</div>
      <span>${money(item.price * (item.quantity || 1))}</span>
    </div>
  `).join('') : '';
  const footer = config.includeFooter ? `<div class="receipt-footer">${esc(config.footerText || 'Obrigado pela preferência!')}</div>` : '';

  return `
    <div class="receipt-paper ${preview ? 'preview' : ''}">
      <div class="receipt-brand">${esc(state.shop?.name || 'PedeIA')}</div>
      <div class="receipt-header">COMANDA ${esc(order.id || '#0000')}</div>
      <div class="receipt-meta">${new Date(order.createdAt || Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
      ${customer}
      ${phone}
      ${address}
      ${payment}
      <div class="receipt-divider"></div>
      ${items}
      <div class="receipt-divider"></div>
      <div class="receipt-total"><span>Total</span><strong>${money(order.total || 0)}</strong></div>
      ${notes}
      ${footer}
    </div>
  `;
}

function printReceipt(order) {
  const config = { ...state.printerConfig };
  const printWindow = window.open('', '_blank', 'width=420,height=900');
  if (!printWindow) {
    notify('Seu navegador bloqueou a janela de impressão. Permita popup e tente novamente.');
    return;
  }

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Comanda ${esc(order.id || '')}</title>
        <style>
          body { margin: 0; background: #f5f5f5; font-family: Arial, sans-serif; color: #1a1a1a; }
          .print-shell { width: 100%; display: flex; justify-content: center; padding: 16px; box-sizing: border-box; }
          .receipt-paper { width: 100%; max-width: 360px; background: #fff; padding: 18px 16px; box-sizing: border-box; }
          .receipt-brand { font-weight: 700; font-size: 17px; text-align: center; margin-bottom: 10px; }
          .receipt-header { font-weight: 700; text-align: center; letter-spacing: 1px; margin-bottom: 8px; }
          .receipt-meta, .receipt-line, .receipt-note, .receipt-total, .receipt-item { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
          .receipt-line, .receipt-note { margin-bottom: 8px; }
          .receipt-line span, .receipt-note span, .receipt-total span { opacity: .7; }
          .receipt-item { align-items: flex-start; margin: 8px 0; } .receipt-item strong { display:block; font-size: 12px; }
          .receipt-item small { display:block; font-size: 10px; opacity: .7; }
          .receipt-divider { border-top: 1px dashed #999; margin: 10px 0; }
          .receipt-total { font-size: 13px; font-weight: 700; margin-top: 8px; }
          .receipt-footer { margin-top: 12px; text-align:center; font-size: 11px; opacity: .8; }
          @media print { body { background: #fff; } .print-shell { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="print-shell">
          ${buildReceiptMarkup(order, config, false)}
        </div>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    try {
      printWindow.print();
    } catch {
      notify('A impressão foi disparada, mas seu navegador pode exigir confirmação do popup.');
    }
  }, 150);

  if (config.mode === 'bluetooth' && navigator.bluetooth) {
    notify('Comanda enviada diretamente para impressão Bluetooth.');
  } else {
    notify(`Comanda ${order.id} enviada diretamente para impressão.`);
  }
}

function categoryDialog() {
  showDialog(`
    <div class="dialog-head">
      <span class="category-icon">+</span>
      <h2>Nova categoria</h2>
      <p>Crie uma aba para organizar seus produtos.</p>
    </div>
    <form id="category-form" class="dialog-form">
      <label>Nome da categoria<input name="nome" required placeholder="Ex.: Tapiocas"></label>
      <button class="primary-button">Criar categoria</button>
    </form>
  `);

  document.querySelector('#category-form').onsubmit = (event) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') || '').trim();
    if (name && !state.categories.includes(name)) state.categories.push(name);
    closeDialog();
    renderSaved();
  };
}

function productDialog(id) {
  const product = state.products.find((item) => String(item.id) === String(id));
  const groups = Array.isArray(product?.options) ? product.options : [];
  const getGroup = (key) => groups.find((g) => g.key === key)?.choices || [];
  const choicesText = (key) => getGroup(key).map((c) => `${c.name}${Number(c.price) ? `|${Number(c.price)}` : ''}`).join('\n');
  const optionBlock = (key, title, hint, multi = false) => `
    <label class="option-config-label"><strong>${title}</strong><small>${hint}</small>
      <textarea name="${key}" rows="3" placeholder="Ex.: ${key === 'flavors' ? 'Calabresa|5' : key === 'edges' ? 'Catupiry|8' : 'Bacon|3'}">${esc(choicesText(key))}</textarea>
    </label>`;
  showDialog(`
    <div class="dialog-head"><span class="category-icon">Produto</span><h2>${product ? 'Editar produto' : 'Novo produto'}</h2><p>Cadastre o item e configure como o cliente poderá personalizar o pedido.</p></div>
    <form id="product-form" class="dialog-form">
      <label class="photo-picker">+<span>Adicionar foto<input name="photo" type="file" accept="image/*"></span></label>
      <label>Nome<input name="nome" required value="${esc(product?.name || '')}" placeholder="Ex.: Pizza grande"></label>
      <fieldset class="category-check-grid"><legend>Categorias disponíveis</legend><small>Marque todas as categorias em que este mesmo produto deve aparecer.</small>${state.categories.map((category) => `<label class="category-check"><input type="checkbox" name="categories" value="${esc(category)}" ${(product?.categories || [product?.category]).includes(category) ? 'checked' : ''}><span>${esc(category)}</span></label>`).join('')}</fieldset>
      <label>Descrição<textarea name="description" required placeholder="Ingredientes, tamanho e diferenciais.">${esc(product?.description || '')}</textarea></label>
      <section class="size-price-editor"><h3>Preços por tamanho/categoria</h3><p>Se as categorias forem tamanhos, informe o preço de cada uma. O cliente escolherá o tamanho antes de adicionar à sacola.</p>${state.categories.map((category) => { const oldSize=groups.find(g=>g.key==='sizes')?.choices?.find(c=>c.name===category); const price=oldSize?Number(product?.price||0)+Number(oldSize.price||0):Number(product?.price||0); return `<label class="size-price-row"><span>${esc(category)}</span><input name="sizeprice-${esc(slug(category))}" data-size-category="${esc(category)}" type="number" min="0.01" step="0.01" value="${product ? price.toFixed(2) : ''}" placeholder="Preço em R$"></label>`; }).join('')}</section>
      <label>Preço base <small>Usado como preço inicial; os valores por tamanho são configurados acima.</small><input name="price" type="number" min="0" step="0.01" value="${product?.price || ''}" placeholder="Informe se não usar preços por tamanho"></label>
      <label class="choice-row"><input name="featured" type="checkbox" ${product?.featured ? 'checked' : ''}><span><strong>Produto em destaque</strong><small>Mostrar também na seção de destaque da vitrine</small></span></label>
      <label>Etiqueta opcional<input name="label" maxlength="32" value="${esc(product?.label || '')}" placeholder="Ex.: Mais vendido"></label>
      <div class="product-options-config"><h3>Personalização do pedido</h3><p>Opcional. Cadastre uma opção por linha. Use <code>Nome|Preço adicional</code>; deixe o preço de fora para opções sem custo.</p>
        <label>Máximo de sabores (pizza)<input name="flavorMax" type="number" min="1" max="6" value="${Number(groups.find(g=>g.key==='flavors')?.max || 1)}"></label>
        ${optionBlock('flavors','Sabores','Para pizza ou produtos que permitem escolher sabores.')}
        ${optionBlock('edges','Bordas','Bordas recheadas ou tipos de acabamento.')}
        ${optionBlock('extras','Adicionais','Ingredientes extras, bebidas ou complementos.')}
      </div>
      <button class="primary-button">Salvar produto</button>
    </form>`);

  document.querySelector('#product-form').onsubmit = (event) => {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form);
    const parseChoices = (key) => String(data.get(key) || '').split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{
      const [name,...priceParts]=line.split('|'); return {id:`${key}-${slug(name)}-${Math.random().toString(36).slice(2,7)}`,name:name.trim().slice(0,70),price:Math.max(0,Number(priceParts.join('|').replace(',','.'))||0)};
    }).filter(c=>c.name);
    const flavors=parseChoices('flavors'), edges=parseChoices('edges'), extras=parseChoices('extras');
    const selectedCategories = data.getAll('categories').map((name) => String(name).trim()).filter((name) => state.categories.includes(name));
    const prices=selectedCategories.map(name=>({name,price:Math.max(0,Number(data.get(`sizeprice-${slug(name)}`)||0))})).filter(x=>x.price>0);
    if(!selectedCategories.length){notify('Selecione pelo menos uma categoria.');return;}
    if(selectedCategories.length>1 && prices.length!==selectedCategories.length){notify('Informe o preço de cada categoria selecionada.');return;}
    if(!prices.length && Number(data.get('price')||0)<=0){notify('Informe um preço válido para o produto.');return;}
    const minPrice=prices.length?Math.min(...prices.map(x=>x.price)):Math.max(0,Number(data.get('price')||0));
    const options=[];
    if(prices.length>1) options.push({key:'sizes',title:'Escolha o tamanho',type:'single',min:1,max:1,priceMode:'delta',choices:prices.map((x,i)=>({id:`size-${slug(x.name)}`,name:x.name,price:Number((x.price-minPrice).toFixed(2))}))});
    if(flavors.length) options.push({key:'flavors',title:'Escolha os sabores',type:'multi',min:1,max:Math.max(1,Math.min(6,Number(data.get('flavorMax')||1))),choices:flavors});
    if(edges.length) options.push({key:'edges',title:'Escolha a borda',type:'single',min:0,max:1,choices:edges});
    if(extras.length) options.push({key:'extras',title:'Adicionais',type:'multi',min:0,max:extras.length,choices:extras});
    const finish = (photo) => {
      const next={id:product?.id||Date.now(),name:String(data.get('name')||'').trim(),category:selectedCategories[0] || state.categories[0] || 'Geral',categories:selectedCategories.length ? selectedCategories : [state.categories[0] || 'Geral'],description:String(data.get('description')||'').trim(),price:prices.length?minPrice:Number(data.get('price')||0),photo:photo||product?.photo||null,available:product?.available??true,options,featured:data.get('featured')==='on',label:String(data.get('label')||'').trim()};
      if(product) Object.assign(product,next); else state.products.push(next);
      closeDialog(); renderSaved();
    };
    const file=form.querySelector('[name=photo]').files[0]; file?readImage(file,finish):finish(null);
  };
}

function addConfiguredProduct(product, selections, extraPrice) {
  const cartItem={...product,cartKey:`${product.id}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,quantity:1,notes:'',basePrice:Number(product.price||0),price:Number(product.price||0)+Number(extraPrice||0),selections};
  state.cart.push(cartItem); save(); closeDialog(); customerShop(); notify('Produto adicionado à sacola.');
}

function productOptionsDialog(product) {
  const groups=(product.options||[]).filter(g=>(g.choices||[]).length);
  const groupMarkup=groups.map(group=>`<section class="customer-option-group"><div class="option-group-heading"><strong>${esc(group.title||group.key)}</strong><small>${group.type==='multi'?`Escolha até ${group.max}`:'Escolha uma opção' }${group.min?` · mínimo ${group.min}`:''}</small></div>${group.choices.map(choice=>`<label class="customer-option-choice"><input type="${group.type==='multi'?'checkbox':'radio'}" name="option-${esc(group.key)}" value="${esc(choice.id)}" data-option-group="${esc(group.key)}" data-option-name="${esc(choice.name)}" data-option-price="${Number(choice.price)||0}"><span>${esc(choice.name)}</span><b>${group.key==='sizes'?money(Number(product.price||0)+Number(choice.price||0)):(Number(choice.price)?`+ ${money(choice.price)}`:'Grátis')}</b></label>`).join('')}</section>`).join('');
  showDialog(`<div class="dialog-head"><span class="category-icon">Personalizar</span><h2>${esc(product.name)}</h2><p>${esc(product.description||'Escolha as opções do seu pedido.')}</p></div><form id="custom-product-form" class="dialog-form"><div class="option-base-price">Preço base <strong>${money(product.price)}</strong></div>${groupMarkup}<label>Observações<textarea name="notes" placeholder="Ex.: retirar cebola (opcional)"></textarea></label><div class="option-total"><span>Total do item</span><strong id="custom-product-total">${money(product.price)}</strong></div><button class="primary-button">Adicionar à sacola</button></form>`);
  const form=document.querySelector('#custom-product-form');
  const update=()=>{let total=Number(product.price||0);groups.forEach(g=>form.querySelectorAll(`[data-option-group="${g.key}"]:checked`).forEach(input=>total+=Number(input.dataset.optionPrice||0)));document.querySelector('#custom-product-total').textContent=money(total);};
  form.querySelectorAll('[data-option-group]').forEach(input=>input.addEventListener('change',()=>{const group=groups.find(g=>g.key===input.dataset.optionGroup);if(group?.type==='multi'&&form.querySelectorAll(`[data-option-group="${group.key}"]:checked`).length>group.max){input.checked=false;notify(`Selecione no máximo ${group.max} opção(ões) em ${group.title}.`);}update();}));
  form.onsubmit=e=>{e.preventDefault();const selections=[];let extra=0,valid=true;groups.forEach(g=>{const checked=[...form.querySelectorAll(`[data-option-group="${g.key}"]:checked`)];if(checked.length<g.min||checked.length>g.max){valid=false;notify(`${g.title}: selecione ${g.min?`pelo menos ${g.min}`:'até '+g.max} opção(ões).`);return;}checked.forEach(input=>{selections.push({group:g.title,name:input.dataset.optionName,price:Number(input.dataset.optionPrice||0)});extra+=Number(input.dataset.optionPrice||0);});});if(!valid)return;const notes=String(new FormData(form).get('notes')||'').trim();addConfiguredProduct(product,selections,extra);const item=state.cart[state.cart.length-1];item.notes=notes;save();};
}

function showDialog(content) {
  const overlay = document.createElement('div');
  overlay.className = 'cart-overlay dialog-overlay';
  overlay.innerHTML = `<div class="cart-modal dialog-modal"><button class="modal-close">Fechar</button>${content}</div>`;
  overlay.querySelector('.modal-close').onclick = closeDialog;
  overlay.onclick = (event) => {
    if (event.target === overlay) closeDialog();
  };
  document.body.appendChild(overlay);
}

function closeDialog() {
  clearInterval(customerChatRefreshTimer);
  customerChatRefreshTimer = null;
  document.querySelector('.dialog-overlay')?.remove();
}

function readImage(file, callback) {
  if (!file) return callback(null);
  const reader = new FileReader();
  reader.onload = () => callback(reader.result);
  reader.readAsDataURL(file);
}

function cartDialog() {
  const total = state.cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

  showDialog(`
    <div class="dialog-head">
      <span class="category-icon">Carrinho</span>
      <h2>Sua sacola</h2>
      <p>Deixe um recado para a cozinha em cada item.</p>
    </div>
    <div class="cart-items">
      ${state.cart.length ? state.cart.map((item) => `
        <div class="cart-item">
          <span>${item.photo ? `<img src="${item.photo}" alt="">` : ''}</span>
          <div>
            <strong>${esc(item.name)}</strong>
            <small>${money(item.price)} · ${item.quantity}x</small>
            ${item.selections?.length ? `<small class="cart-customizations">${item.selections.map(x=>`${esc(x.group)}: ${esc(x.name)}${x.price?` (+${money(x.price)})`:''}`).join(' · ')}</small>` : ''}
            <label class="note-field">
              <span>OBSERVACOES DO ITEM</span>
              <input data-note="${item.cartKey || item.id}" value="${esc(item.notes || '')}" placeholder="Ex.: sem cebola, bem passado...">
              <small>Opcional - a loja vera este recado no pedido</small>
            </label>
          </div>
        </div>
      `).join('') : '<p>Sua sacola esta vazia.</p>'}
    </div>
    ${state.cart.length ? `<div class="cart-total"><span>Total</span><strong>${money(total)}</strong></div><button class="primary-button checkout-button">Continuar para entrega</button>` : ''}
  `);

  document.querySelectorAll('[data-note]').forEach((input) => {
    input.oninput = () => {
      const item = state.cart.find((entry) => String(entry.cartKey || entry.id) === String(input.dataset.note));
      if (item) item.notes = input.value;
      save();
    };
  });

  document.querySelector('.checkout-button')?.addEventListener('click', () => {
    closeDialog();
    checkoutDialog();
  });
}

function checkoutDialog() {
  const cached = JSON.parse(localStorage.getItem(clientKey) || 'null') || {};
  const modes = [
    state.delivery.delivery ? '<option value="delivery">Entrega</option>' : '',
    state.delivery.pickup ? '<option value="pickup">Retirada no local</option>' : ''
  ].join('');

  showDialog(`
    <div class="dialog-head">
      <span class="category-icon">Pedido</span>
      <h2>Finalizar pedido</h2>
      <p>Seus dados ficam salvos neste dispositivo para o proximo pedido.</p>
    </div>
    <form id="checkout-form" class="dialog-form">
      <label>Seu nome<input name="customer" required value="${esc(cached.name || '')}" placeholder="Como podemos chamar voce?"></label>
      <label>Telefone<input name="whatsapp" required value="${esc(cached.phone || '')}" placeholder="(00) 00000-0000"></label>
      <label>Forma de recebimento<select name="fulfillment">${modes}</select></label>
      <div class="address-field" id="checkout-address-fields">
        <strong class="address-section-title">Endereço de entrega</strong>
        <label>Rua / Avenida<input name="street" autocomplete="address-line1" value="${esc(cached.addressParts?.street || '')}" placeholder="Nome da rua ou avenida"></label>
        <div class="address-fields-row"><label>Número<input name="street_number" autocomplete="address-line2" value="${esc(cached.addressParts?.number || '')}" placeholder="Nº"></label><label>Complemento <span class="optional-label">(opcional)</span><input name="complement" value="${esc(cached.addressParts?.complement || '')}" placeholder="Apto, casa, bloco"></label></div>
        <label>Bairro de atendimento<select name="neighborhood" autocomplete="address-level3" required><option value="">Selecione seu bairro</option>${(state.shop?.serviceNeighborhoods||[]).map((item)=>{const n=typeof item==='string'?{nome:item,taxa:0}:item;const name=String(n.nome||n.name||'').trim();return name?`<option value="${esc(name)}" data-fee="${Math.max(0,Number(n.taxa??n.fee??0))}" ${normalizeNeighborhoodName(cached.addressParts?.neighborhood)===normalizeNeighborhoodName(name)?'selected':''}>${esc(name)}</option>`:'';}).join('')}</select><small>${(state.shop?.serviceNeighborhoods||[]).length?'Escolha um dos bairros atendidos pela loja.':'A loja ainda não cadastrou bairros de entrega.'}</small></label>
        <div class="checkout-delivery-fee" id="checkout-delivery-fee" aria-live="polite"><span>Taxa de entrega</span><strong>Selecione um bairro</strong></div>
        <div class="address-fields-row"><label>Cidade<input name="city" autocomplete="address-level2" value="${esc(cached.addressParts?.city || '')}" placeholder="Cidade"></label><label>Estado<input name="state" autocomplete="address-level1" value="${esc(cached.addressParts?.state || '')}" placeholder="UF"></label></div>
        <label>Ponto de referência <span class="optional-label">(opcional)</span><input name="reference" value="${esc(cached.addressParts?.reference || '')}" placeholder="Ex.: perto da praça"></label>
      </div>
      <label>Pagamento<select name="payment"><option>Pix</option><option>Cartao na entrega</option><option>Dinheiro</option></select></label>
      <button class="primary-button">Enviar pedido</button>
    </form>
  `);

  const form = document.querySelector('#checkout-form');
  const fulfillmentSelect=form.elements.fulfillment;
  const neighborhoodSelect=form.elements.neighborhood;
  const addressFields=document.querySelector('#checkout-address-fields');
  const feeBox=document.querySelector('#checkout-delivery-fee');
  const refreshDeliveryFields=()=>{
    const delivery=fulfillmentSelect.value==='delivery';
    if(addressFields)addressFields.hidden=!delivery;
    if(neighborhoodSelect)neighborhoodSelect.required=delivery;
    if(feeBox){const opt=neighborhoodSelect?.selectedOptions?.[0];const fee=Number(opt?.dataset?.fee||0);feeBox.innerHTML=`<span>Taxa de entrega</span><strong>${delivery&&opt?.value?money(fee):delivery?'Selecione um bairro':'R$ 0,00'}</strong>`;}
  };
  fulfillmentSelect?.addEventListener('change',refreshDeliveryFields);
  neighborhoodSelect?.addEventListener('change',refreshDeliveryFields);
  refreshDeliveryFields();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const fulfillment = String(data.get('fulfillment') || 'pickup');
    const addressParts = {street:String(data.get('street')||'').trim(),number:String(data.get('street_number')||'').trim(),complement:String(data.get('complement')||'').trim(),neighborhood:String(data.get('neighborhood')||'').trim(),city:String(data.get('city')||'').trim(),state:String(data.get('state')||'').trim(),reference:String(data.get('reference')||'').trim()};
    const address = fulfillment === 'delivery' ? [addressParts.street, addressParts.number && `nº ${addressParts.number}`, addressParts.complement, addressParts.neighborhood, [addressParts.city,addressParts.state].filter(Boolean).join(' - '), addressParts.reference && `Referência: ${addressParts.reference}`].filter(Boolean).join(', ') : '';
    if (fulfillment === 'delivery' && (!addressParts.street || !addressParts.number || !addressParts.neighborhood || !addressParts.city || !addressParts.state)) { notify('Preencha rua, número, bairro, cidade e estado.'); return; }
    if (fulfillment === 'delivery' && !(state.shop?.serviceNeighborhoods||[]).some(item=>normalizeNeighborhoodName(typeof item==='string'?item:(item.nome||item.name||''))===normalizeNeighborhoodName(addressParts.neighborhood))) { notify('Este bairro não está cadastrado como área de atendimento da loja.'); return; }
    const selectedNeighborhood=(state.shop?.serviceNeighborhoods||[]).find(item=>normalizeNeighborhoodName(typeof item==='string'?item:(item.nome||item.name||''))===normalizeNeighborhoodName(addressParts.neighborhood));
    const estimatedDeliveryFee=fulfillment==='delivery'?Math.max(0,Number(typeof selectedNeighborhood==='string'?0:(selectedNeighborhood?.taxa??selectedNeighborhood?.fee??0))):0;

    const customer = String(data.get('customer') || '').trim();
    const phone = String(data.get('phone') || '').trim();
    if (!customer || !phone) {
      notify('Informe seu nome e telefone para continuar.');
      return;
    }

    const total = state.cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
    const orderItems = state.cart.map((item) => ({
      produto_id: item.id, quantidade: Number(item.quantity || 1), observacao: item.notes || '',
      personalizacoes: item.selections || []
    }));
    const button=form.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent='Enviando pedido...';}
    try {
      let order;
      if (publicShop()) {
        const response=await fetch('/api/public-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loja:publicShop(),cliente:{nome:customer,telefone:phone},tipo_entrega:fulfillment,endereco:address,endereco_partes:addressParts,bairro_entrega:addressParts.neighborhood,taxa_entrega:estimatedDeliveryFee,pagamento:String(data.get('payment')||'Pix'),observacoes:'',itens:orderItems})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível enviar o pedido.');
        const minutes=Number(state.delivery.deliveryMinutes||45);
        order={id:result.pedido.id,customer,phone,address,payment:String(data.get('payment')||'Pix'),fulfillment,status:result.pedido.status,total:Number(result.pedido.total),deliveryFee:Number(result.pedido.taxa_entrega||0),items:state.cart.map(item=>({id:item.id,name:item.name,description:item.description,quantity:item.quantity,notes:item.notes,selections:item.selections||[],price:item.price})),notes:'',createdAt:new Date(result.pedido.created_at).getTime(),readyAt:Date.now()+minutes*60000,updatedAt:Date.now(),trackingToken:result.tracking_token};
        const oldProfile=JSON.parse(localStorage.getItem(clientKey)||'{}');localStorage.setItem(clientKey,JSON.stringify({ ...oldProfile,name:customer,phone,address,addressParts,lastTrackingToken:result.tracking_token,lastOrderId:order.id }));
      } else {
        order={id:`#${Date.now().toString().slice(-4)}`,customer,phone,address,payment:String(data.get('payment')||'Pix'),fulfillment,status:state.delivery.autoAccept?'Em preparo':'Aguardando',total:total+estimatedDeliveryFee,deliveryFee:estimatedDeliveryFee,items:state.cart.map(item=>({id:item.id,name:item.name,description:item.description,quantity:item.quantity,notes:item.notes,selections:item.selections||[],price:item.price})),notes:'',createdAt:Date.now(),readyAt:Date.now()+45*60000,updatedAt:Date.now()};
      }
      localStorage.setItem(clientKey,JSON.stringify({name:customer,phone,address,addressParts,...(order.trackingToken?{lastTrackingToken:order.trackingToken,lastOrderId:order.id}:{})}));
      state.orders=state.orders.filter(o=>o.id!==order.id);state.orders.push(order);state.cart=[];
      try{localStorage.setItem(stateKey,JSON.stringify(state));}catch{}
      if(order.trackingToken){
        const trackingUrl=`${location.origin}/acompanhar?token=${encodeURIComponent(order.trackingToken)}`;
        closeDialog();showDialog(`<div class="dialog-head"><span class="category-icon">Pedido confirmado</span><h2>Pedido enviado à loja!</h2><p>Guarde o link abaixo para acompanhar o andamento e a localização do entregador quando a entrega estiver em rota.</p></div><div class="dialog-form"><input id="customer-tracking-link" readonly value="${esc(trackingUrl)}" aria-label="Link de acompanhamento"><button type="button" class="primary-button" id="copy-customer-tracking">Copiar link de acompanhamento</button><a class="secondary-button" style="display:block;text-align:center;text-decoration:none" href="/acompanhar?token=${encodeURIComponent(order.trackingToken)}">Acompanhar pedido agora</a></div>`);
        document.querySelector('#copy-customer-tracking')?.addEventListener('click',async()=>{const input=document.querySelector('#customer-tracking-link');try{await navigator.clipboard.writeText(input.value);notify('Link de acompanhamento copiado.');}catch{input.select();notify('Selecione e copie o link.');}});
      }else{closeDialog();notify('Pedido registrado com sucesso!');}
      render();
    } catch(error) { notify(error.message||'Falha ao enviar pedido.');if(button){button.disabled=false;button.textContent='Enviar pedido';} }
  };
}

async function customerChat() {
  const profile = JSON.parse(localStorage.getItem(clientKey) || 'null') || {};
  const urlToken = new URLSearchParams(location.search).get('token');
  const trackingToken = urlToken || profile.lastTrackingToken;
  if (!trackingToken) {
    notify('Faça um pedido para iniciar uma conversa com a loja.');
    return;
  }

  // Mantém o último token válido no dispositivo para que o cliente não perca
  // a conversa ao recarregar a vitrine.
  if (urlToken && urlToken !== profile.lastTrackingToken) {
    localStorage.setItem(clientKey, JSON.stringify({
      ...profile,
      lastTrackingToken: urlToken
    }));
  }
  let storeMessages = [];
  try {
    const response = await fetch(`/api/order-chat?token=${encodeURIComponent(trackingToken)}&loja=${encodeURIComponent(publicShop() || '')}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a conversa.');
    storeMessages = result.mensagens || [];
  } catch (error) {
    notify(error.message || 'Não foi possível carregar a conversa.');
    return;
  }
  showDialog(`
    <div class="dialog-head">
      <span class="category-icon">Chat</span>
      <h2>Falar com a loja</h2>
      <p>Envie uma duvida e a loja respondera por aqui.</p>
    </div>
    <div class="chat-messages compact customer-chat-messages">
      ${storeMessages.length ? storeMessages.map((msg) => `<div class="message ${msg.remetente_tipo === 'cliente' ? 'mine' : ''}">${esc(msg.conteudo)}<small>${esc(new Date(msg.created_at).toLocaleString('pt-BR'))}</small></div>`).join('') : '<p>Nenhuma mensagem ainda.</p>'}
    </div>
    <form id="customer-chat" class="chat-compose">
      <input name="message" required placeholder="Escreva sua duvida...">
      <button>Enviar</button>
    </form>
  `);

  document.querySelector('#customer-chat').onsubmit = async (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.message;
    const text = String(input.value || '').trim();
    if (!text) return;

    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      const response = await fetch('/api/order-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: trackingToken, loja: publicShop(), conteudo: text })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar a mensagem.');
      notify('Mensagem enviada para a loja.');
      closeDialog();
      await customerChat();
    } catch (error) {
      notify(error.message || 'Não foi possível enviar a mensagem.');
      if (submit) submit.disabled = false;
    }
  };
  clearInterval(customerChatRefreshTimer);
  customerChatRefreshTimer = setInterval(async () => {
    if (!document.querySelector('.customer-chat-messages') || document.activeElement?.closest('#customer-chat')) return;
    try {
      const response = await fetch(`/api/order-chat?token=${encodeURIComponent(trackingToken)}&loja=${encodeURIComponent(publicShop() || '')}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao atualizar a conversa.');
      const messages = result.mensagens || [];
      document.querySelector('.customer-chat-messages').innerHTML = messages.length
        ? messages.map((message) => `<div class="message ${message.remetente_tipo === 'cliente' ? 'mine' : ''}">${esc(message.conteudo)}<small>${esc(new Date(message.created_at).toLocaleString('pt-BR'))}</small></div>`).join('')
        : '<p>Nenhuma mensagem ainda.</p>';
    } catch (error) {
      console.error('Falha ao atualizar a conversa:', error.message);
    }
  }, 5000);
}

function nowTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

render();
startLiveRefresh();

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-delivery]')) {
    state.delivery[event.target.dataset.delivery] = event.target.checked;
    save();
  }

  if (event.target.matches('[data-auto-accept]')) {
    state.delivery.autoAccept = event.target.checked;
    save();
    render();
  }

  if (event.target.matches('[data-printer-field]')) {
    const field = event.target.dataset.printerField;
    if (event.target.type === 'checkbox') {
      state.printerConfig[field] = event.target.checked;
    } else if (field === 'copies') {
      state.printerConfig[field] = Number(event.target.value || 1);
    } else {
      state.printerConfig[field] = event.target.value;
    }
    save();
  }
});

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-customer-view]');
  if (viewButton) {
    state.customerView = viewButton.dataset.customerView;
    save();
    customerShop();
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button) return;

  if (button.dataset.action === 'confirm-receipt') {
    const order = state.orders.find((item) => item.id === button.dataset.id);
    if (order) {
      order.confirmed = true;
      save();
      render();
      notify('Recebimento confirmado. Obrigado!');
    }
  }

  if (button.dataset.action === 'rate-order') {
    const order = state.orders.find((item) => item.id === button.dataset.id);
    if (!order) return;

    showDialog(`
      <div class="dialog-head">
        <span class="category-icon">Nota</span>
        <h2>Avalie seu pedido</h2>
        <p>Conte como foi a experiencia com a loja.</p>
      </div>
      <form id="rating-form" class="dialog-form">
        <label>Nota<select name="value"><option value="5">5 - Excelente</option><option value="4">4 - Muito bom</option><option value="3">3 - Bom</option><option value="2">2 - Pode melhorar</option><option value="1">1 - Ruim</option></select></label>
        <label>Comentario<textarea name="comment" placeholder="Escreva uma mensagem para a loja"></textarea></label>
        <label>Foto ou video (opcional)<input type="file" accept="image/*,video/*"></label>
        <button class="primary-button">Enviar avaliacao</button>
      </form>
    `);

    document.querySelector('#rating-form').onsubmit = (ratingEvent) => {
      ratingEvent.preventDefault();
      const data = new FormData(ratingEvent.currentTarget);
      state.ratings.push({
        orderId: order.id,
        value: Number(data.get('value') || 5),
        comment: String(data.get('comment') || '').trim(),
        createdAt: Date.now()
      });
      order.rated = true;
      save();
      closeDialog();
      notify('Avaliacao enviada para a loja');
      customerShop();
    };
  }
});
