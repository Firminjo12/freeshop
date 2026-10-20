const DEMO_KEY = 'freeshop-collecte-demo-v1';
const DEMO_PAYOUTS_KEY = 'freeshop-payouts-demo-v1';

const demoSeed = [
  { id: 'pi_demo_a93f2', name: 'Awa Kaboré', phone: '+22670123456', amount: 45000, amountReceived: 45000, operator: 'ORANGE_MONEY', status: 'settled', created: '2026-10-19T09:42:00.000Z', description: 'Commande #FS-1048' },
  { id: 'pi_demo_c26d8', name: 'Issa Ouédraogo', phone: '+22665789012', amount: 125000, amountReceived: 0, operator: 'MOOV_MONEY', status: 'requires_payment', created: '2026-10-19T09:18:00.000Z', description: 'Commande #FS-1047' },
  { id: 'pi_demo_f50a1', name: 'Mariam Diallo', phone: '+22676112233', amount: 18500, amountReceived: 18500, operator: 'ORANGE_MONEY', status: 'settled', created: '2026-10-18T16:05:00.000Z', description: 'Commande #FS-1046' },
  { id: 'pi_demo_b02e7', name: 'Ousmane Sawadogo', phone: '+22666443322', amount: 68000, amountReceived: 0, operator: 'YAS_TG', status: 'failed', created: '2026-10-18T14:27:00.000Z', description: 'Commande #FS-1045' },
  { id: 'pi_demo_d91c3', name: 'Fatou Traoré', phone: '+22670556677', amount: 32000, amountReceived: 0, operator: 'MOOV_MONEY', status: 'requires_payment', created: '2026-10-17T11:30:00.000Z', description: 'Commande #FS-1044' }
];

const demoPayoutSeed = [
  { id: '01a1589c-ebce-7437-a6e1-0861f0fe9a82', recipient_name: 'Mariame regtoumda', recipient_msisdn: '+22607066630', amount: 4000, fee: 0, currency: 'XOF', status: 'succeeded', created_at: '2026-10-20T09:20:41.423Z', wallet_id: 'wal_07e1d5641c492dd77008cdc0b246b707' },
  { id: '01a15856-720d-7257-a6e1-f9c178b819cf', recipient_name: 'Karel', recipient_msisdn: '+22604330547', amount: 1000, fee: 0, currency: 'XOF', status: 'succeeded', created_at: '2026-10-20T08:03:42.734Z', wallet_id: 'wal_07e1d5641c492dd77008cdc0b246b707' },
  { id: '01a15847-a0aa-7410-9e8b-8aab155b346d', recipient_name: 'Mariame regtoumda', recipient_msisdn: '+22607066630', amount: 5500, fee: 0, currency: 'XOF', status: 'succeeded', created_at: '2026-10-20T07:47:31.628Z', wallet_id: 'wal_07e1d5641c492dd77008cdc0b246b707' },
  { id: '01a1537a-8fe5-7f08-a0f2-702ae6fd948a', recipient_name: 'Mariame', recipient_msisdn: '+22667916752', amount: 500, fee: 0, currency: 'XOF', status: 'succeeded', created_at: '2026-10-19T09:25:03.590Z', wallet_id: 'wal_07e1d5641c492dd77008cdc0b246b707' }
];

const ops = {
  ORANGE_BF_AGENT: 'Orange BF',
  ORANGE_MONEY: 'Orange Money',
  MOOV_MONEY: 'Moov Money',
  MOOV_BF: 'Moov BF',
  YAS_TG: 'Yas',
  MTN_MOMO: 'MTN MoMo'
};

const statusInfo = {
  settled: ['Réussi', 'success'],
  succeeded: ['Réussi', 'success'],
  requires_payment: ['En attente', 'pending'],
  awaiting_confirmation: ['Confirmation', 'working'],
  pending_approval: ['En attente', 'pending'],
  queued: ['En file', 'working'],
  created: ['Créé', 'pending'],
  sent: ['Envoyé', 'working'],
  executing: ['En cours', 'working'],
  partially_paid: ['Montant partiel', 'pending'],
  matched: ['Rapproché', 'working'],
  overpaid: ['Trop-perçu', 'pending'],
  expired: ['Expiré', 'cancel'],
  cancelled: ['Annulé', 'cancel'],
  failed: ['Échoué', 'failed'],
  reversed: ['Contrepassé', 'failed']
};

const fmt = n => new Intl.NumberFormat('fr-FR').format(Number(n) || 0) + ' F';
const dt = x => x ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(x)) : '—';
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => String(n || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();

let mode = 'demo';
let apiEnvironment = 'test';
let items = [];
let payouts = [];
let summary = null;
let pendingCreateId = '';
let currentWallet = null;
let currentTab = 'collect'; // 'collect' | 'payouts'

function readDemo() {
  try { return [...JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'), ...demoSeed]; }
  catch { return demoSeed; }
}

function readDemoPayouts() {
  try { return [...JSON.parse(localStorage.getItem(DEMO_PAYOUTS_KEY) || '[]'), ...demoPayoutSeed]; }
  catch { return demoPayoutSeed; }
}

function toast(s) {
  let el = document.querySelector('#toast');
  el.textContent = s;
  el.classList.remove('hidden');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

async function api(url, options = {}) {
  let r;
  try {
    r = await fetch(url, {
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw Error('Impossible de joindre Freeshop. Relancez le serveur local.');
  }
  if (r.status === 401 && !window.location.pathname.endsWith('login.html')) {
    window.location.href = '/login.html';
    return {};
  }
  let d = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw Object.assign(Error(d.error?.message || 'La requête a échoué.'), {
      code: d.error?.code,
      status: r.status,
      requestId: d.error?.request_id
    });
  }
  return d;
}

function isPaid(x) {
  return ['settled', 'succeeded'].includes(String(x.status).toLowerCase());
}

function isPending(x) {
  return ['requires_payment', 'awaiting_confirmation', 'pending_approval', 'queued', 'sent', 'executing', 'partially_paid', 'matched', 'overpaid', 'created'].includes(String(x.status).toLowerCase());
}

function isPayoutCancellable(p) {
  return ['created', 'pending_approval', 'queued'].includes(String(p.status).toLowerCase());
}

function status(x) {
  return statusInfo[String(x.status).toLowerCase()] || ['En cours', 'working'];
}

function render() {
  if (currentTab === 'collect') {
    renderCollect();
  } else if (currentTab === 'payouts') {
    renderPayouts();
  }
}

function renderCollect() {
  const q = document.querySelector('#search').value.trim().toLocaleLowerCase('fr');
  const sf = document.querySelector('#status').value;
  const op = document.querySelector('#operator').value;

  const shown = items.filter(x =>
    (sf === 'all' || (sf === 'pending' ? isPending(x) : sf === 'succeeded' ? isPaid(x) : x.status === sf)) &&
    (op === 'all' || x.operator === op) &&
    (!q || (x.name + ' ' + x.phone + ' ' + x.id + ' ' + x.description + ' ' + (x.reference || '')).toLocaleLowerCase('fr').includes(q))
  ).sort((a, b) => new Date(b.created) - new Date(a.created));

  document.querySelector('#thead-row').innerHTML = `
    <th>CLIENT</th><th>MONTANT</th><th>RÉSEAU</th><th>STATUT</th><th>DATE</th><th>RÉFÉRENCE</th><th></th>
  `;

  document.querySelector('#rows').innerHTML = shown.map(x => `
    <tr data-id="${esc(x.id)}" data-type="collect">
      <td><div class="client"><div class="client-avatar">${esc(initials(x.name))}</div><div><strong>${esc(x.name || 'Client')}</strong><small>${esc(x.phone || '')}</small></div></div></td>
      <td class="amount">${fmt(x.amount)} <small>${esc(x.currency || 'XOF')}</small></td>
      <td><div class="operator ${x.operator === 'YAS_TG' ? 'yas' : x.operator === 'MTN_MOMO' ? 'mtn' : ''}"><i></i>${esc(ops[x.operator] || x.operator || 'Auto')}</div></td>
      <td><span class="pill ${status(x)[1]}">${status(x)[0]}</span></td>
      <td>${dt(x.created)}</td>
      <td class="ref">${esc(x.reference || x.id)}</td>
      <td><button class="more" title="Détails de l'encaissement">···</button></td>
    </tr>
  `).join('');

  document.querySelector('#empty').classList.toggle('hidden', shown.length > 0);
  document.querySelector('#rows').classList.toggle('hidden', shown.length === 0);
  document.querySelector('#empty-title').textContent = 'Aucun encaissement pour le moment';
  document.querySelector('#empty-desc').textContent = 'Créez une demande pour commencer à suivre vos paiements.';
  document.querySelector('#countlabel').textContent = `${shown.length} résultat${shown.length === 1 ? '' : 's'}`;
  document.querySelector('#showing').textContent = `${shown.length} demande${shown.length === 1 ? '' : 's'}`;

  // Metrics
  const paid = items.filter(isPaid);
  const pending = items.filter(isPending);
  const closed = items.filter(x => isPaid(x) || ['failed', 'cancelled', 'expired', 'reversed'].includes(x.status));
  const thisMonth = items.filter(x => new Date(x.created).getUTCMonth() === new Date().getUTCMonth() && new Date(x.created).getUTCFullYear() === new Date().getUTCFullYear() && isPaid(x));
  const apiStats = (summary?.data || []).reduce((a, x) => ({
    volume: a.volume + (Number(x.volume_minor) || 0),
    count: a.count + (Number(x.count) || 0),
    succeeded: a.succeeded + (Number(x.succeeded_count) || 0),
    failed: a.failed + (Number(x.failed_count) || 0)
  }), { volume: 0, count: 0, succeeded: 0, failed: 0 });

  document.querySelector('#c-top-2').innerHTML = 'Encaissé ce mois <span class="cardico">↗</span>';
  document.querySelector('#m-received').textContent = fmt(mode === 'tfc' ? apiStats.volume : thisMonth.reduce((a, x) => a + (Number(x.amountReceived ?? x.amount) || 0), 0));
  document.querySelector('#m-note-2').textContent = 'Paiements confirmés';

  document.querySelector('#c-top-3').innerHTML = 'En attente <span class="cardico" style="color:#a56308;background:#fff5df">◷</span>';
  document.querySelector('#m-pending').textContent = fmt(pending.reduce((a, x) => a + (Number(x.amount) || 0), 0));
  document.querySelector('#m-pending-note').textContent = `${pending.length} demande${pending.length === 1 ? '' : 's'} affichée${pending.length === 1 ? '' : 's'}`;

  document.querySelector('#c-top-4').innerHTML = 'Demandes créées <span class="cardico">▤</span>';
  document.querySelector('#m-count').textContent = mode === 'tfc' && summary ? apiStats.count : items.length;
  document.querySelector('#m-note-4').textContent = 'Depuis le début';

  document.querySelector('#c-top-5').innerHTML = 'Taux de réussite <span class="cardico">⌁</span>';
  const rateDen = mode === 'tfc' && summary ? (apiStats.succeeded + apiStats.failed) : closed.length;
  document.querySelector('#m-rate').textContent = rateDen ? Math.round((mode === 'tfc' && summary ? apiStats.succeeded : paid.length) / rateDen * 100) + '%' : '—';
  document.querySelector('#m-note-5').textContent = 'Sur les demandes clôturées';
}

function renderPayouts() {
  const q = document.querySelector('#search').value.trim().toLocaleLowerCase('fr');
  const sf = document.querySelector('#status').value;

  const shown = payouts.filter(p => {
    const isP = isPayoutPending(p);
    const isS = p.status === 'succeeded';
    const statusMatch = (sf === 'all' || (sf === 'pending' ? isP : sf === 'succeeded' ? isS : p.status === sf));
    const text = ((p.recipient_name || '') + ' ' + (p.recipient_msisdn || '') + ' ' + (p.id || '') + ' ' + (p.description || '')).toLocaleLowerCase('fr');
    const searchMatch = !q || text.includes(q);
    return statusMatch && searchMatch;
  }).sort((a, b) => new Date(b.created_at || b.created || 0) - new Date(a.created_at || a.created || 0));

  document.querySelector('#thead-row').innerHTML = `
    <th>BÉNÉFICIAIRE</th><th>MONTANT</th><th>TÉLÉPHONE</th><th>STATUT</th><th>DATE</th><th>ID DÉCAISSEMENT</th><th>ACTIONS</th>
  `;

  document.querySelector('#rows').innerHTML = shown.map(p => {
    const cancellable = isPayoutCancellable(p);
    return `
      <tr data-id="${esc(p.id)}" data-type="payout">
        <td>
          <div class="client">
            <div class="client-avatar" style="background:#fef3c7;color:#92400e">${esc(initials(p.recipient_name || 'Destinataire'))}</div>
            <div>
              <strong>${esc(p.recipient_name || 'Bénéficiaire')}</strong>
              <small>${esc(p.recipient_msisdn || '')}</small>
            </div>
          </div>
        </td>
        <td class="amount">${fmt(p.amount)} <small>${esc(p.currency || 'XOF')}</small></td>
        <td><div class="operator"><i></i>${esc(p.recipient_msisdn || '—')}</div></td>
        <td>
          <span class="pill ${status(p)[1]}">${status(p)[0]}</span>
          ${cancellable ? '<span style="font-size:10px;margin-left:4px;color:#b45309;font-weight:700">· Annulable</span>' : ''}
        </td>
        <td>${dt(p.created_at || p.created)}</td>
        <td class="ref">${esc(p.id)}</td>
        <td>
          ${cancellable
            ? `<button class="btn danger quick-cancel-btn" data-id="${esc(p.id)}" style="padding:4px 8px;font-size:11px" title="Annuler immédiatement ce décaissement">Annuler</button>`
            : `<button class="more" title="Détails du décaissement">···</button>`
          }
        </td>
      </tr>
    `;
  }).join('');

  document.querySelector('#empty').classList.toggle('hidden', shown.length > 0);
  document.querySelector('#rows').classList.toggle('hidden', shown.length === 0);
  document.querySelector('#empty-title').textContent = 'Aucun décaissement trouvé';
  document.querySelector('#empty-desc').textContent = 'Les transferts sortants apparaîtront ici.';
  document.querySelector('#countlabel').textContent = `${shown.length} résultat${shown.length === 1 ? '' : 's'}`;
  document.querySelector('#showing').textContent = `${shown.length} décaissement${shown.length === 1 ? '' : 's'}`;

  // Metrics for Payouts
  const succeededPayouts = payouts.filter(p => p.status === 'succeeded');
  const pendingPayouts = payouts.filter(isPayoutPending);
  const totalDecaisse = succeededPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalPending = pendingPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  document.querySelector('#c-top-2').innerHTML = 'Total décaissé <span class="cardico">↗</span>';
  document.querySelector('#m-received').textContent = fmt(totalDecaisse);
  document.querySelector('#m-note-2').textContent = `${succeededPayouts.length} transfert${succeededPayouts.length > 1 ? 's' : ''} réussi${succeededPayouts.length > 1 ? 's' : ''}`;

  document.querySelector('#c-top-3').innerHTML = 'En attente / Annulables <span class="cardico" style="color:#a56308;background:#fff5df">◷</span>';
  document.querySelector('#m-pending').textContent = fmt(totalPending);
  document.querySelector('#m-pending-note').textContent = `${pendingPayouts.length} transfert${pendingPayouts.length > 1 ? 's' : ''} en attente`;

  document.querySelector('#c-top-4').innerHTML = 'Total décaissements <span class="cardico">▤</span>';
  document.querySelector('#m-count').textContent = payouts.length;
  document.querySelector('#m-note-4').textContent = 'Depuis le début';

  document.querySelector('#c-top-5').innerHTML = 'Taux de succès <span class="cardico">⌁</span>';
  const closedCount = payouts.filter(p => ['succeeded', 'failed', 'cancelled'].includes(p.status)).length;
  document.querySelector('#m-rate').textContent = closedCount ? Math.round((succeededPayouts.length / closedCount) * 100) + '%' : '—';
  document.querySelector('#m-note-5').textContent = 'Sur les transferts clôturés';
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  const pageCrumb = document.querySelector('#page-crumb');
  const pageEyebrow = document.querySelector('#page-eyebrow');
  const pageTitle = document.querySelector('#page-title');
  const pageDesc = document.querySelector('#page-desc');
  const pageActions = document.querySelector('#page-actions');
  const toolTitle = document.querySelector('#tooltitle-text');
  const opFilter = document.querySelector('#operator');
  const searchInput = document.querySelector('#search');

  searchInput.value = '';

  if (tab === 'collect') {
    if (pageCrumb) pageCrumb.textContent = 'Encaissements';
    if (pageEyebrow) pageEyebrow.textContent = 'Espace de collecte';
    if (pageTitle) pageTitle.textContent = 'Encaissements';
    if (pageDesc) pageDesc.textContent = 'Créez des demandes de paiement et suivez les règlements de vos clients.';
    if (toolTitle) toolTitle.textContent = 'Toutes les demandes';
    if (opFilter) opFilter.style.display = '';
    searchInput.placeholder = 'Rechercher un client, numéro ou réf…';

    pageActions.innerHTML = `
      <button class="btn secondary" id="orphan-btn" title="Rattacher un versement reçu sans intention préalable">🔗&nbsp; Paiement sans intention</button>
      <button class="btn secondary" id="export">↓&nbsp; Exporter</button>
      <button class="btn primary" id="new">＋&nbsp; Nouvel encaissement</button>
    `;
  } else if (tab === 'payouts') {
    if (pageCrumb) pageCrumb.textContent = 'Décaissements';
    if (pageEyebrow) pageEyebrow.textContent = 'Transferts sortants';
    if (pageTitle) pageTitle.textContent = 'Décaissements';
    if (pageDesc) pageDesc.textContent = 'Suivez vos versements Mobile Money et annulez les transferts en attente.';
    if (toolTitle) toolTitle.textContent = 'Tous les décaissements';
    if (opFilter) opFilter.style.display = 'none';
    searchInput.placeholder = 'Rechercher un bénéficiaire, numéro ou ID…';

    pageActions.innerHTML = `
      <button class="btn secondary" id="refresh-payouts" title="Actualiser la liste">↻&nbsp; Actualiser</button>
      <button class="btn secondary" id="export">↓&nbsp; Exporter</button>
      <button class="btn primary" id="new-payout">＋&nbsp; Nouveau décaissement</button>
    `;
  }

  render();
}

async function load() {
  try {
    const config = await api('/api/config');
    mode = config.mode;
    apiEnvironment = config.environment || 'test';

    // Load Encaissements
    const d = await api('/api/payment-intents');
    if (mode === 'demo') {
      items = readDemo();
      summary = null;
      payouts = readDemoPayouts();
    } else {
      const saved = items;
      items = (d.data || []).map(x => {
        const cached = saved.find(y => y.id === x.id);
        return {
          ...cached,
          ...x,
          name: x.name || cached?.name || 'Client',
          description: x.description || cached?.description || '',
          operator: x.operator || cached?.operator
        };
      });
      summary = await api('/api/payment-intents/stats').catch(() => null);

      // Load Payouts from TFC PAY
      const poRes = await api('/api/payouts').catch(() => ({ data: [] }));
      payouts = poRes.data || [];
    }

    await loadWallet();

    document.querySelector('.env').textContent = mode === 'tfc' ? `TFC PAY · ${apiEnvironment === 'live' ? 'LIVE' : 'TEST'}` : 'DÉMO LOCALE';
    document.querySelector('.notice').innerHTML = mode === 'tfc'
      ? (apiEnvironment === 'live'
        ? '<span>!</span><div><strong>Mode LIVE actif.</strong> <span>Les encaissements et décaissements sont exécutés sur votre compte réel TFC PAY. L’annulation de décaissement libère immédiatement les fonds réservés.</span></div>'
        : '<span>●</span><div><strong>Connexion TFC PAY · TEST active.</strong> <span>Les opérations utilisent le bac à sable de test TFC PAY.</span></div>')
      : '<span>●</span><div><strong>Mode démonstration local.</strong> <span>Les exemples créés ici sont enregistrés sur cet appareil. Aucun virement réel n’est envoyé. Configurez une clé API dans les réglages ⚙.</span></div>';

    render();
  } catch (e) {
    toast(e.message);
  }
}

function closeModal() {
  document.querySelector('#modalroot').classList.add('hidden');
  document.querySelector('#modalroot').innerHTML = '';
  pendingCreateId = '';
}

function closeDrawer() {
  document.querySelector('#drawerroot').classList.add('hidden');
  document.querySelector('#drawerroot').innerHTML = '';
}

/* ------------------- WALLET DETAILS ------------------- */
async function loadWallet() {
  try {
    const res = await api('/api/wallets');
    const w = (res.wallets || [])[0];
    currentWallet = w;
    if (w) {
      const avail = Number(w.available_minor ?? w.available ?? 0);
      const resv = Number(w.reserved_minor ?? w.reserved ?? 0);
      const cur = w.currency || 'XOF';
      const isLive = String(w.environment || '').toUpperCase() === 'LIVE';

      const sideBal = document.querySelector('#side-wallet-balance');
      if (sideBal) sideBal.textContent = fmt(avail) + ' ' + cur;

      const sideId = document.querySelector('#side-wallet-id');
      if (sideId) sideId.textContent = w.id || '';

      const sideStat = document.querySelector('#side-wallet-status');
      if (sideStat) {
        sideStat.textContent = isLive ? 'LIVE' : (w.status || 'ACTIF').toUpperCase();
        sideStat.className = `pill ${w.status === 'active' ? 'success' : 'pending'}`;
      }

      const topAmt = document.querySelector('#top-wallet-amount');
      if (topAmt) topAmt.textContent = fmt(avail);

      const cardBal = document.querySelector('#m-wallet-balance');
      if (cardBal) cardBal.textContent = fmt(avail);

      const cardNote = document.querySelector('#m-wallet-note');
      if (cardNote) cardNote.innerHTML = resv > 0 ? `Disponible · Réservé: <b>${fmt(resv)}</b>` : `Disponible · ${esc(w.environment || 'LIVE')}`;
    }
  } catch (e) {
    console.error('Wallet load error:', e);
  }
}

function showWalletDetail() {
  if (!currentWallet) {
    toast('Chargement des informations du wallet…');
    loadWallet();
    return;
  }
  const w = currentWallet;
  const avail = Number(w.available_minor ?? w.available ?? 0);
  const resv = Number(w.reserved_minor ?? w.reserved ?? 0);
  const cur = w.currency || 'XOF';

  const root = document.querySelector('#drawerroot');
  root.innerHTML = `
    <div class="drawerback" id="db">
      <aside class="drawer">
        <div class="drawerhead">
          <div>
            <h2>Détails du Wallet TFC PAY</h2>
            <p class="intro">Solde et paramètres de votre compte de paiement</p>
          </div>
          <button class="close" id="dc">×</button>
        </div>
        <div style="margin-top:20px">
          <span class="pill ${w.status === 'active' ? 'success' : 'pending'}">${w.status === 'active' ? 'Actif' : 'Inactif'} · ${esc(w.environment || 'LIVE')}</span>
        </div>
        <div class="detailbox">
          <div class="detailrow"><span>Solde disponible</span><strong style="color:#176c47;font-size:16px">${fmt(avail)} ${esc(cur)}</strong></div>
          <div class="detailrow"><span>Solde réservé</span><strong>${fmt(resv)} ${esc(cur)}</strong></div>
          <div class="detailrow"><span>Identifiant Wallet</span><strong class="ref">${esc(w.id || '—')}</strong></div>
          <div class="detailrow"><span>Devise</span><strong>${esc(cur)} (Franc CFA)</strong></div>
          <div class="detailrow"><span>Environnement</span><strong>${esc(w.environment || 'LIVE')}</strong></div>
          <div class="detailrow"><span>Statut</span><strong>${esc(w.status || 'active')}</strong></div>
          ${w.created_at ? `<div class="detailrow"><span>Date de création</span><strong>${dt(w.created_at)}</strong></div>` : ''}
        </div>
        <div class="instruction">
          <b>À propos de votre wallet</b>
          Le solde disponible est crédité dès confirmation d’un encaissement et débité lors des transferts sortants. L'annulation d'un décaissement en attente libère les fonds réservés.
        </div>
        <div class="dactions">
          <button class="btn" id="copy-wal-id">Copier l'ID du Wallet</button>
          <button class="btn" id="refresh-wal">Actualiser le solde</button>
        </div>
      </aside>
    </div>
  `;
  root.classList.remove('hidden');
  document.querySelector('#dc').onclick = closeDrawer;
  document.querySelector('#db').addEventListener('click', e => { if (e.target.id === 'db') closeDrawer(); });
  document.querySelector('#copy-wal-id').onclick = async () => {
    try { await navigator.clipboard.writeText(w.id); toast('ID du wallet copié.'); }
    catch { toast(w.id); }
  };
  document.querySelector('#refresh-wal').onclick = async () => {
    await loadWallet();
    showWalletDetail();
    toast('Solde du wallet actualisé.');
  };
}

/* ------------------- PAYOUT CANCELLATION & DETAILS ------------------- */
function openScopeHelpModal(errMsg, requiredScope) {
  const root = document.querySelector('#modalroot');
  root.innerHTML = `
    <div class="modalback" id="back">
      <section class="modal" style="max-width:540px">
        <div class="modalhead">
          <div>
            <h2 style="color:#b91c1c;display:flex;align-items:center;gap:8px">
              <span>⚠️</span> Permission « ${esc(requiredScope)} » requise
            </h2>
            <p>Votre clé API actuelle n'a pas les droits nécessaires pour cette opération.</p>
          </div>
          <button class="close" id="x">×</button>
        </div>
        <div style="padding:20px 22px;font-size:12.5px;line-height:1.6;color:#374151">
          <div style="background:#fef2f2;border:1px solid #fee2e2;border-radius:9px;padding:12px;margin-bottom:15px;color:#991b1b">
            <strong>Réponse reçue de TFC PAY :</strong><br>
            ${esc(errMsg)}
          </div>
          <p style="margin-bottom:10px">
            Pour annuler des décaissements via l'API, TFC PAY exige que votre clé dispose explicitement de la portée <code>${esc(requiredScope)}</code>.
          </p>
          <strong style="display:block;margin:12px 0 6px;color:#111827">Comment activer cette portée :</strong>
          <ol style="padding-left:20px;margin:0 0 16px">
            <li style="margin-bottom:5px">Rendez-vous sur la console TFC PAY : <a href="https://pay.samir-tcf.com" target="_blank" rel="noreferrer" style="color:#176c47;font-weight:600">pay.samir-tcf.com</a></li>
            <li style="margin-bottom:5px">Allez dans la rubrique <strong>Développeurs &gt; Clés API</strong></li>
            <li style="margin-bottom:5px">Cochez la permission <strong>${esc(requiredScope)}</strong> sur votre clé (ou générez une nouvelle clé avec cette case cochée)</li>
            <li>Collez votre clé mise à jour dans les <strong>Réglages (icône ⚙)</strong> en haut à droite de Freeshop.</li>
          </ol>
        </div>
        <div class="formfoot" style="background:#f9fafb;padding:12px 22px;border-top:1px solid #e5e7eb">
          <button type="button" class="btn" id="open-settings-now">⚙ Ouvrir les réglages</button>
          <button type="button" class="btn primary" id="scope-close">Compris</button>
        </div>
      </section>
    </div>
  `;
  root.classList.remove('hidden');
  document.querySelector('#x').onclick = closeModal;
  document.querySelector('#scope-close').onclick = closeModal;
  document.querySelector('#back').addEventListener('click', e => { if (e.target.id === 'back') closeModal(); });
  document.querySelector('#open-settings-now').onclick = () => {
    closeModal();
    openSettings();
  };
}

async function cancelPayout(id) {
  const p = payouts.find(x => x.id === id);
  if (!p) return;

  const cancellable = isPayoutCancellable(p);
  if (!cancellable) {
    const proceed = confirm(`Ce décaissement a le statut « ${p.status} » (déjà exécuté ou clôturé).\n\nTFC PAY rejette normalement l'annulation d'un transfert déjà envoyé.\nSouhaitez-vous quand même envoyer la requête d'annulation à TFC PAY pour tester la clé API ?`);
    if (!proceed) return;
  } else {
    const proceed = confirm(`Confirmez-vous l'annulation du décaissement de ${fmt(p.amount)} vers ${p.recipient_name || p.recipient_msisdn} ?\nLes fonds réservés seront restitués au solde disponible.`);
    if (!proceed) return;
  }

  if (mode === 'demo') {
    p.status = 'cancelled';
    const saved = JSON.parse(localStorage.getItem(DEMO_PAYOUTS_KEY) || '[]');
    const idx = saved.findIndex(x => x.id === id);
    if (idx >= 0) saved[idx].status = 'cancelled';
    else saved.push({ ...p, status: 'cancelled' });
    localStorage.setItem(DEMO_PAYOUTS_KEY, JSON.stringify(saved));
    toast('Décaissement annulé (mode démonstration).');
    render();
    showPayoutDetail(id, p);
    return;
  }

  try {
    const res = await api('/api/payouts/' + encodeURIComponent(id) + '/cancel', { method: 'POST' });
    p.status = 'cancelled';
    toast('Décaissement annulé avec succès ! Fonds relâchés.');
    await loadWallet();
    render();
    showPayoutDetail(id, p);
  } catch (err) {
    if (err.code === 'insufficient_scope') {
      openScopeHelpModal(err.message, 'payout:cancel');
    } else if (err.code === 'payout_not_cancellable') {
      alert(`Impossible d'annuler : ce décaissement est déjà exécuté ou transmis définitivement par l'opérateur (${err.message}).`);
    } else {
      toast(`${err.message}${err.requestId ? ' (Ref: ' + err.requestId + ')' : ''}`);
    }
  }
}

async function showPayoutDetail(id, initial) {
  let p = initial || payouts.find(x => x.id === id);
  if (!p) return;

  if (mode === 'tfc') {
    try {
      const res = await api('/api/payouts/' + encodeURIComponent(id));
      if (res.payout) {
        p = { ...p, ...res.payout };
        payouts = payouts.map(y => y.id === id ? { ...y, ...res.payout } : y);
        render();
      }
    } catch {}
  }

  const stat = status(p);
  const cancellable = isPayoutCancellable(p);
  const root = document.querySelector('#drawerroot');

  root.innerHTML = `
    <div class="drawerback" id="db">
      <aside class="drawer">
        <div class="drawerhead">
          <div>
            <h2>Détail du décaissement</h2>
            <p class="intro">Transfert Mobile Money sortant</p>
          </div>
          <button class="close" id="dc">×</button>
        </div>
        <div style="margin-top:20px;display:flex;align-items:center;gap:8px">
          <span class="pill ${stat[1]}">${stat[0]}</span>
          ${cancellable ? '<span style="font-size:11px;font-weight:700;color:#b45309;background:#fef3c7;padding:3px 8px;border-radius:12px">Annulable</span>' : ''}
        </div>
        <div class="detailbox">
          <div class="detailrow"><span>Montant décaissé</span><strong style="color:#176c47;font-size:15px">${fmt(p.amount)} ${esc(p.currency || 'XOF')}</strong></div>
          <div class="detailrow"><span>Frais de transfert</span><strong>${fmt(p.fee || 0)} ${esc(p.currency || 'XOF')}</strong></div>
          <div class="detailrow"><span>Bénéficiaire</span><strong>${esc(p.recipient_name || 'Bénéficiaire')}</strong></div>
          <div class="detailrow"><span>Numéro de mobile</span><strong>${esc(p.recipient_msisdn || '—')}</strong></div>
          <div class="detailrow"><span>Date d'initiation</span><strong>${dt(p.created_at || p.created)}</strong></div>
          <div class="detailrow"><span>Identifiant</span><strong class="ref">${esc(p.id)}</strong></div>
          ${p.wallet_id ? `<div class="detailrow"><span>Wallet source</span><strong class="ref" style="font-size:10px">${esc(p.wallet_id)}</strong></div>` : ''}
          ${p.description ? `<div class="detailrow"><span>Motif</span><strong>${esc(p.description)}</strong></div>` : ''}
        </div>

        ${cancellable ? `
          <div class="instruction" style="background:#fffbeb;border-color:#fde68a;color:#92400e">
            <b>Transfert en attente</b>
            Ce décaissement n'a pas encore été finalisé par l'opérateur. Vous pouvez l'annuler pour récupérer les fonds réservés sur votre wallet.
          </div>
        ` : p.status === 'succeeded' ? `
          <div class="instruction">
            <b>Décaissement réussi</b>
            Ce virement a été confirmé et versé au bénéficiaire. Les fonds ont quitté le wallet.
          </div>
        ` : p.status === 'cancelled' ? `
          <div class="instruction" style="background:#f3f4f6;border-color:#e5e7eb;color:#4b5563">
            <b>Décaissement annulé</b>
            Ce décaissement a été annulé avec succès. Les fonds réservés ont été réintégrés à votre solde disponible.
          </div>
        ` : `
          <div class="instruction" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">
            <b>Statut : ${esc(stat[0])}</b>
            Le décaissement n'a pas pu aboutir ou a été interrompu.
          </div>
        `}

        <div class="dactions" style="flex-wrap:wrap">
          <button class="btn" id="copy-payout-id">Copier l'identifiant</button>
          <button class="btn" id="refresh-payout-stat">Actualiser le statut</button>
          ${cancellable ? `
            <button class="btn danger" id="btn-cancel-payout" style="margin-left:auto">✕ Annuler ce décaissement</button>
          ` : p.status === 'succeeded' ? `
            <button class="btn" id="btn-cancel-payout" style="color:#b14f4f;border-color:#fca5a5" title="Tenter l'annulation (test scope API)">Annuler ce décaissement</button>
          ` : ''}
        </div>
      </aside>
    </div>
  `;

  root.classList.remove('hidden');
  document.querySelector('#dc').onclick = closeDrawer;
  document.querySelector('#db').addEventListener('click', e => { if (e.target.id === 'db') closeDrawer(); });

  document.querySelector('#copy-payout-id').onclick = async () => {
    try { await navigator.clipboard.writeText(p.id); toast('Identifiant de décaissement copié.'); }
    catch { toast(p.id); }
  };

  document.querySelector('#refresh-payout-stat').onclick = async () => {
    if (mode === 'tfc') {
      try {
        const res = await api('/api/payouts/' + encodeURIComponent(p.id));
        if (res.payout) {
          p = { ...p, ...res.payout };
          payouts = payouts.map(y => y.id === p.id ? { ...y, ...res.payout } : y);
          render();
          showPayoutDetail(p.id, p);
          toast('Statut actualisé.');
        }
      } catch (err) { toast(err.message); }
    } else {
      toast('Statut actualisé.');
    }
  };

  const cancelBtn = document.querySelector('#btn-cancel-payout');
  if (cancelBtn) {
    cancelBtn.onclick = () => cancelPayout(p.id);
  }
}

/* ------------------- NEW PAYOUT MODAL ------------------- */
function openPayoutModal() {
  const avail = currentWallet ? Number(currentWallet.available_minor ?? currentWallet.available ?? 0) : 0;
  const root = document.querySelector('#modalroot');
  root.innerHTML = `
    <div class="modalback" id="back">
      <section class="modal">
        <div class="modalhead">
          <div>
            <h2>Nouveau décaissement</h2>
            <p>Transférer des fonds depuis votre wallet vers un compte Mobile Money.</p>
          </div>
          <button class="close" id="x">×</button>
        </div>
        <form class="form" id="payout-form">
          <div class="field">
            <label for="po-name">Nom du bénéficiaire</label>
            <input id="po-name" name="name" placeholder="Ex. Mariame Ouédraogo" required maxlength="80">
          </div>
          <div class="row">
            <div class="field">
              <label for="po-phone">Numéro Mobile Money</label>
              <input id="po-phone" name="phone" type="tel" placeholder="+226 70 00 00 00" required maxlength="22">
            </div>
            <div class="field">
              <label for="po-amount">Montant (F CFA)</label>
              <input id="po-amount" name="amount" type="number" min="1" step="1" placeholder="5 000" required>
            </div>
          </div>
          <div class="field">
            <label for="po-desc">Motif / Référence <span style="font-weight:400;color:#879189">(facultatif)</span></label>
            <input id="po-desc" name="description" placeholder="Ex. Règlement facture fournisseur #102" maxlength="120">
          </div>
          <div class="notice" style="margin:0 0 13px">
            <span>!</span>
            <div>
              <strong>Solde disponible du wallet : ${fmt(avail)} XOF.</strong>
              <span>Le virement est débité de votre solde disponible. Un transfert en attente peut être annulé avant transmission à l'opérateur.</span>
            </div>
          </div>
          <div class="formfoot">
            <button type="button" class="btn" id="cancel">Annuler</button>
            <button class="btn primary" type="submit" id="po-submit">Initier le décaissement</button>
          </div>
        </form>
      </section>
    </div>
  `;

  root.classList.remove('hidden');
  document.querySelector('#x').onclick = closeModal;
  document.querySelector('#cancel').onclick = closeModal;
  document.querySelector('#back').addEventListener('click', e => { if (e.target.id === 'back') closeModal(); });

  document.querySelector('#payout-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const btn = document.querySelector('#po-submit');
    const name = String(f.get('name') || '').trim();
    const phone = String(f.get('phone') || '').replace(/[\s()-]/g, '');
    const amount = Number(f.get('amount'));
    const description = String(f.get('description') || '').trim();

    if (!amount || amount < 1) {
      toast('Saisissez un montant valide.');
      return;
    }
    if (!phone) {
      toast('Saisissez un numéro de téléphone valide.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Envoi en cours…';

    if (mode === 'demo') {
      const newPo = {
        id: 'po_demo_' + Date.now().toString(36),
        recipient_name: name,
        recipient_msisdn: phone,
        amount,
        fee: 0,
        currency: 'XOF',
        status: 'pending_approval',
        created_at: new Date().toISOString(),
        description
      };
      const saved = JSON.parse(localStorage.getItem(DEMO_PAYOUTS_KEY) || '[]');
      saved.unshift(newPo);
      localStorage.setItem(DEMO_PAYOUTS_KEY, JSON.stringify(saved));
      payouts.unshift(newPo);
      closeModal();
      render();
      showPayoutDetail(newPo.id, newPo);
      toast('Décaissement créé en mode démonstration (statut en attente).');
      return;
    }

    try {
      const res = await api('/api/payouts', {
        method: 'POST',
        body: JSON.stringify({ name, phone, amount, description })
      });
      closeModal();
      await load();
      if (res.payout) {
        showPayoutDetail(res.payout.id, res.payout);
      }
      toast('Décaissement transmis à TFC PAY !');
    } catch (err) {
      toast(`${err.message}${err.requestId ? ' (Ref: ' + err.requestId + ')' : ''}`);
      btn.disabled = false;
      btn.textContent = 'Initier le décaissement';
    }
  });

  document.querySelector('#po-name').focus();
}

/* ------------------- PAYMENT INTENT (ENCAISSEMENT) CANCELLATION & DETAILS ------------------- */
async function cancelPaymentIntent(id) {
  const x = items.find(y => y.id === id);
  if (!x) return;

  if (!confirm(`Confirmez-vous l'annulation de l'intention de paiement de ${fmt(x.amount)} pour ${x.name || 'le client'} ?`)) {
    return;
  }

  if (mode === 'demo') {
    x.status = 'cancelled';
    const saved = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
    const idx = saved.findIndex(y => y.id === id);
    if (idx >= 0) saved[idx].status = 'cancelled';
    else saved.push({ ...x, status: 'cancelled' });
    localStorage.setItem(DEMO_KEY, JSON.stringify(saved));
    toast('Intention annulée (mode démonstration).');
    render();
    showDetail(id, x);
    return;
  }

  try {
    await api('/api/payment-intents/' + encodeURIComponent(id) + '/cancel', { method: 'POST' });
    x.status = 'cancelled';
    toast('Intention de paiement annulée avec succès.');
    render();
    showDetail(id, x);
  } catch (err) {
    toast(err.message);
  }
}

async function showDetail(id, initial) {
  let x = initial || items.find(y => y.id === id);
  if (!x) return;

  if (mode === 'tfc') {
    try {
      x = (await api('/api/payment-intents/' + encodeURIComponent(id))).intent;
      items = items.map(y => y.id === id ? { ...y, ...x } : y);
      render();
    } catch {}
  }

  const stat = status(x);
  const hasInstructions = (Array.isArray(x.instructions) && x.instructions.length > 0) || Boolean(x.ussdHint) || Boolean(x.collectMsisdn);
  const amountGot = Number(x.amountReceived) || 0;
  const isCancellable = ['requires_payment', 'awaiting_confirmation'].includes(String(x.status).toLowerCase());

  const root = document.querySelector('#drawerroot');
  root.innerHTML = `
    <div class="drawerback" id="db">
      <aside class="drawer">
        <div class="drawerhead">
          <div>
            <h2>Détail de l’encaissement</h2>
            <p class="intro">${esc(x.description || 'Demande de paiement mobile money')}</p>
          </div>
          <button class="close" id="dc">×</button>
        </div>
        <div style="margin-top:20px;display:flex;align-items:center;gap:8px">
          <span class="pill ${stat[1]}">${stat[0]}</span>
          ${isCancellable ? '<span style="font-size:11px;font-weight:700;color:#b45309;background:#fef3c7;padding:3px 8px;border-radius:12px">Annulable</span>' : ''}
        </div>
        <div class="detailbox">
          <div class="detailrow"><span>Montant demandé</span><strong>${fmt(x.amount)} ${esc(x.currency || 'XOF')}</strong></div>
          <div class="detailrow"><span>Montant reçu</span><strong>${fmt(amountGot)} ${esc(x.currency || 'XOF')}</strong></div>
          <div class="detailrow"><span>Client</span><strong>${esc(x.name || 'Client')}</strong></div>
          <div class="detailrow"><span>Téléphone</span><strong>${esc(x.phone || '—')}</strong></div>
          <div class="detailrow"><span>Réseau</span><strong>${esc(ops[x.operator] || x.operator || 'Automatique')}</strong></div>
          <div class="detailrow"><span>Date de création</span><strong>${dt(x.created)}</strong></div>
          <div class="detailrow"><span>Référence</span><strong class="ref">${esc(x.reference || x.id)}</strong></div>
          ${x.expires ? `<div class="detailrow"><span>Expire le</span><strong>${dt(x.expires)}</strong></div>` : ''}
        </div>
        ${hasInstructions ? `
          <div class="instruction">
            <b>Instructions de paiement</b>
            ${x.collectMsisdn ? `Numéro de collecte : <strong>${esc(x.collectMsisdn)}</strong><br>` : ''}
            ${x.reference ? `Code référence : <strong>${esc(x.reference)}</strong><br>` : ''}
            ${(x.instructions || []).map(s => `<div style="margin-top:6px">${esc(s)}</div>`).join('')}
            ${x.ussdHint ? `
              <div style="margin-top:10px;padding:9px 11px;background:#fff;border-radius:7px;border:1px dashed #d1b47b;display:flex;align-items:center;justify-content:space-between;gap:8px">
                <code style="font-size:12px;font-weight:700;color:#183d2c">${esc(x.ussdHint)}</code>
                <button class="btn" id="copy-ussd" style="padding:4px 8px;font-size:11px;white-space:nowrap">Copier USSD</button>
              </div>
            ` : ''}
          </div>
        ` : `
          <div class="instruction">
            <b>${mode === 'tfc' ? 'Paiement en cours' : 'Mode démonstration'}</b>
            ${mode === 'tfc' ? 'La demande est chez TFC PAY. Le statut « Réussi » sera affiché uniquement après confirmation.' : 'Aucun paiement réel n’a été lancé.'}
          </div>
        `}
        <div class="dactions" style="flex-wrap:wrap">
          <button class="btn" id="copy">Copier la référence</button>
          <button class="btn" id="sync">Actualiser le statut</button>
          ${isCancellable ? `
            <button class="btn danger" id="cancel-pi-btn" style="margin-left:auto">✕ Annuler cette demande</button>
          ` : ''}
        </div>
      </aside>
    </div>
  `;

  root.classList.remove('hidden');
  document.querySelector('#dc').onclick = closeDrawer;
  document.querySelector('#db').addEventListener('click', e => { if (e.target.id === 'db') closeDrawer(); });

  document.querySelector('#copy').onclick = async () => {
    try { await navigator.clipboard.writeText(x.reference || x.id); toast('Référence copiée.'); }
    catch { toast(x.reference || x.id); }
  };

  const ussdBtn = document.querySelector('#copy-ussd');
  if (ussdBtn) {
    ussdBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(x.ussdHint); toast('Code USSD copié : ' + x.ussdHint); }
      catch { toast(x.ussdHint); }
    };
  }

  document.querySelector('#sync').onclick = async () => {
    try {
      if (mode === 'tfc') {
        const d = await api('/api/payment-intents/' + encodeURIComponent(x.id));
        items = items.map(y => y.id === x.id ? { ...y, ...d.intent } : y);
        render();
        showDetail(x.id, d.intent);
        toast('Statut actualisé.');
      } else {
        toast('La démonstration ne reçoit pas de statut réel.');
      }
    } catch (err) {
      toast(err.message);
    }
  };

  const cancelPiBtn = document.querySelector('#cancel-pi-btn');
  if (cancelPiBtn) {
    cancelPiBtn.onclick = () => cancelPaymentIntent(x.id);
  }
}

/* ------------------- CREATE ENCAISSEMENT MODAL ------------------- */
function openModal() {
  pendingCreateId = crypto.randomUUID();
  const root = document.querySelector('#modalroot');
  root.innerHTML = `
    <div class="modalback" id="back">
      <section class="modal">
        <div class="modalhead">
          <div>
            <h2>Nouvel encaissement</h2>
            <p>${mode === 'tfc' ? 'Une demande de paiement sera créée chez TFC PAY.' : 'Créez une demande de démonstration enregistrée sur cet appareil.'}</p>
          </div>
          <button class="close" id="x">×</button>
        </div>
        <form class="form" id="form">
          <div class="field">
            <label for="name">Nom du client</label>
            <input id="name" name="name" placeholder="Ex. Awa Kaboré" required maxlength="80">
          </div>
          <div class="row">
            <div class="field">
              <label for="phone">Téléphone du payeur</label>
              <input id="phone" name="phone" type="tel" placeholder="+226 70 00 00 00" required maxlength="22">
            </div>
            <div class="field">
              <label for="amount">Montant (F CFA)</label>
              <input id="amount" name="amount" type="number" min="1" step="1" placeholder="25 000" required>
            </div>
          </div>
          <div class="field">
            <label for="operator">Réseau de paiement</label>
            <select id="operator" name="operator">
              <option value="">Automatique (recommandé)</option>
              <option value="ORANGE_BF_AGENT">Orange Money (Burkina Faso)</option>
              <option value="ORANGE_MONEY">Orange Money</option>
              <option value="MOOV_MONEY">Moov Money</option>
              <option value="YAS_TG">Yas (Togo)</option>
              <option value="MTN_MOMO">MTN MoMo</option>
            </select>
          </div>
          <div class="field">
            <label for="description">Référence / description <span style="font-weight:400;color:#879189">(facultatif)</span></label>
            <input id="description" name="description" placeholder="Ex. Commande #FS-1050" maxlength="120">
          </div>
          ${mode === 'tfc' ? '<div class="notice" style="margin:0 0 13px"><span>!</span><div><strong>Cette action contacte TFC PAY.</strong> Le client recevra les instructions pour effectuer le paiement.</div></div>' : ''}
          <div class="formfoot">
            <button type="button" class="btn" id="cancel">Annuler</button>
            <button class="btn primary" type="submit">${mode === 'tfc' ? 'Créer la demande' : 'Créer la démo'}</button>
          </div>
        </form>
      </section>
    </div>
  `;

  root.classList.remove('hidden');
  document.querySelector('#x').onclick = closeModal;
  document.querySelector('#cancel').onclick = closeModal;
  document.querySelector('#back').addEventListener('click', e => { if (e.target.id === 'back') closeModal(); });
  document.querySelector('#form').addEventListener('submit', submitCreate);
  document.querySelector('#name').focus();
}

async function submitCreate(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const button = form.querySelector('[type=submit]');
  const f = new FormData(form);
  const phone = String(f.get('phone')).replace(/[\s()-]/g, '');
  const amount = Number(f.get('amount'));

  if (!Number.isSafeInteger(amount) || amount < 1) {
    toast('Saisis un montant entier valide.');
    return;
  }

  if (mode === 'demo') {
    const x = {
      id: 'demo_' + pendingCreateId.replaceAll('-', '').slice(0, 12),
      name: String(f.get('name')).trim(),
      phone,
      amount,
      amountReceived: 0,
      operator: f.get('operator') || 'ORANGE_BF_AGENT',
      status: 'requires_payment',
      created: new Date().toISOString(),
      description: String(f.get('description')).trim() || 'Demande de démonstration'
    };
    const saved = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
    saved.unshift(x);
    localStorage.setItem(DEMO_KEY, JSON.stringify(saved));
    closeModal();
    await load();
    showDetail(x.id, x);
    toast('Demande de démonstration enregistrée localement.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Envoi en cours…';
  try {
    const d = await api('/api/payment-intents', {
      method: 'POST',
      body: JSON.stringify({
        name: String(f.get('name')).trim(),
        phone,
        amount,
        operator: f.get('operator') || '',
        description: String(f.get('description')).trim(),
        requestId: pendingCreateId
      })
    });
    closeModal();
    await load();
    showDetail(d.intent.id, d.intent);
    toast('Demande transmise à TFC PAY !');
  } catch (err) {
    toast(`${err.message}${err.requestId ? ' Référence support : ' + err.requestId : ''}`);
    button.disabled = false;
    button.textContent = 'Réessayer la même demande';
  }
}

/* ------------------- SETTINGS MODAL ------------------- */
async function openSettings() {
  try {
    const c = await api('/api/config');
    const root = document.querySelector('#modalroot');
    root.innerHTML = `
      <div class="modalback" id="back">
        <section class="modal">
          <div class="modalhead">
            <div>
              <h2>Connexion TFC PAY</h2>
              <p>La clé est enregistrée uniquement sur cet ordinateur.</p>
            </div>
            <button class="close" id="x">×</button>
          </div>
          <form class="form" id="settings-form">
            <div class="field">
              <label for="base-url">Adresse de l’API</label>
              <input id="base-url" name="baseUrl" type="url" value="${esc(c.baseUrl || 'https://tcf-pay.infra.dongobada.com')}" required>
            </div>
            <div class="field">
              <label for="api-key">Clé API TFC PAY</label>
              <input id="api-key" name="apiKey" type="password" placeholder="${c.configured ? `Clé ${c.environment === 'live' ? 'LIVE' : 'TEST'} enregistrée — laisser vide pour la conserver` : 'sk_test_… ou sk_live_…'}" autocomplete="new-password" ${c.configured ? '' : 'required'}>
            </div>
            <div class="field">
              <label for="webhook-secret">Secret webhook <span style="font-weight:400;color:#879189">(facultatif)</span></label>
              <input id="webhook-secret" name="webhookSecret" type="password" placeholder="${c.webhookConfigured ? 'Secret déjà enregistré — laisser vide pour le conserver' : 'whsec_…'}" autocomplete="new-password">
            </div>
            <div class="notice" style="margin:0 0 13px">
              <span>!</span>
              <div>
                <strong>Permissions recommandées sur votre clé :</strong>
                <code>read</code>, <code>collect:write</code>, et <code>payout:cancel</code> (pour annuler les décaissements en attente).
              </div>
            </div>
            <div class="formfoot">
              <a class="btn" href="https://pay.samir-tcf.com/documentation" target="_blank" rel="noreferrer">Documentation</a>
              <button type="button" class="btn" id="cancel">Annuler</button>
              <button class="btn primary" type="submit">Enregistrer</button>
            </div>
          </form>
        </section>
      </div>
    `;

    root.classList.remove('hidden');
    document.querySelector('#x').onclick = closeModal;
    document.querySelector('#cancel').onclick = closeModal;
    document.querySelector('#back').addEventListener('click', e => { if (e.target.id === 'back') closeModal(); });

    document.querySelector('#settings-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const b = e.currentTarget.querySelector('[type=submit]');
      b.disabled = true;
      b.textContent = 'Enregistrement…';
      try {
        await api('/api/config', {
          method: 'POST',
          body: JSON.stringify({
            baseUrl: f.get('baseUrl'),
            apiKey: f.get('apiKey'),
            webhookSecret: f.get('webhookSecret')
          })
        });
        closeModal();
        await load();
        toast('Configuration TFC PAY enregistrée avec succès.');
      } catch (err) {
        toast(err.message);
        b.disabled = false;
        b.textContent = 'Enregistrer';
      }
    });
  } catch (e) {
    toast(e.message);
  }
}

/* ------------------- ORPHAN PAYMENTS MODAL ------------------- */
function openOrphanModal() {
  const root = document.querySelector('#modalroot');
  root.innerHTML = `
    <div class="modalback" id="back">
      <section class="modal">
        <div class="modalhead">
          <div>
            <h2>Paiement sans intention</h2>
            <p>Rattacher un versement reçu directement sur votre numéro mobile money.</p>
          </div>
          <button class="close" id="x">×</button>
        </div>
        <form class="form" id="orphan-form">
          <div class="field">
            <label for="orph-phone">Numéro du payeur (facultatif si montant unique)</label>
            <input id="orph-phone" name="phone" type="tel" placeholder="+226 70 00 00 00">
          </div>
          <div class="field">
            <label for="orph-amount">Montant exact reçu (F CFA)</label>
            <input id="orph-amount" name="amount" type="number" min="1" step="1" placeholder="Ex: 5000" required>
          </div>
          <div class="field">
            <label for="orph-name">Nom du client (facultatif)</label>
            <input id="orph-name" name="name" placeholder="Ex: Awa Kaboré">
          </div>
          <div class="formfoot">
            <button type="button" class="btn" id="cancel">Annuler</button>
            <button class="btn primary" type="submit" id="search-orph">Rechercher</button>
          </div>
          <div id="orphan-results" style="margin-top:14px;max-height:220px;overflow:auto" class="hidden"></div>
        </form>
      </section>
    </div>
  `;

  root.classList.remove('hidden');
  document.querySelector('#x').onclick = closeModal;
  document.querySelector('#cancel').onclick = closeModal;
  document.querySelector('#back').addEventListener('click', e => { if (e.target.id === 'back') closeModal(); });

  document.querySelector('#orphan-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const btn = document.querySelector('#search-orph');
    const resDiv = document.querySelector('#orphan-results');
    btn.disabled = true;
    btn.textContent = 'Recherche…';
    resDiv.classList.add('hidden');
    resDiv.innerHTML = '';
    try {
      const phone = String(f.get('phone') || '').replace(/[\s()-]/g, '');
      const amount = Number(f.get('amount'));
      const name = String(f.get('name') || '').trim();
      const res = await api('/api/orphan-payments/search', {
        method: 'POST',
        body: JSON.stringify({ phone, amount })
      });
      const matches = res.matches || [];
      if (matches.length === 0) {
        resDiv.innerHTML = '<div style="padding:12px;background:#fef2f2;color:#991b1b;border-radius:8px;font-size:12px">Aucun versement correspondant trouvé dans les 72 dernières heures. Vérifiez le montant et le numéro.</div>';
      } else {
        resDiv.innerHTML = matches.map(m => `
          <div style="border:1px solid #dcebe0;background:#f7faf8;border-radius:8px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong style="color:#176c47;font-size:13px">${fmt(m.amount || m.amount_minor || amount)}</strong>
              <div style="font-size:11px;color:#556158">Payeur : ${esc(m.payer_msisdn || m.counterparty_msisdn || phone || 'Inconnu')}</div>
              <div style="font-size:10px;color:#889">${dt(m.created_at || m.created)}</div>
            </div>
            <button type="button" class="btn primary claim-btn" data-id="${esc(m.id)}" data-phone="${esc(m.payer_msisdn || m.counterparty_msisdn || phone)}" style="padding:5px 10px;font-size:11px">Rattacher</button>
          </div>
        `).join('');

        resDiv.querySelectorAll('.claim-btn').forEach(b => {
          b.onclick = async () => {
            b.disabled = true;
            b.textContent = 'Rattachement…';
            try {
              const claimRes = await api('/api/orphan-payments/' + encodeURIComponent(b.dataset.id) + '/claim', {
                method: 'POST',
                body: JSON.stringify({ phone: b.dataset.phone || phone, amount, name })
              });
              closeModal();
              await load();
              if (claimRes.intent) showDetail(claimRes.intent.id, claimRes.intent);
              toast('Versement rattaché avec succès sous forme d’encaissement réglé !');
            } catch (err) {
              toast(err.message);
              b.disabled = false;
              b.textContent = 'Rattacher';
            }
          };
        });
      }
      resDiv.classList.remove('hidden');
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Rechercher';
    }
  });
}

/* ------------------- EXPORT CSV ------------------- */
function exportCsv() {
  if (currentTab === 'collect') {
    const head = ['Référence', 'Client', 'Téléphone', 'Montant XOF', 'Réseau', 'Statut', 'Date', 'Description'];
    const csv = [head, ...items.map(x => [
      x.reference || x.id,
      x.name,
      x.phone,
      x.amount,
      ops[x.operator] || x.operator,
      status(x)[0],
      dt(x.created),
      x.description
    ])].map(r => r.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(';')).join('\r\n');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'encaissements-freeshop.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } else {
    const head = ['Identifiant', 'Bénéficiaire', 'Téléphone', 'Montant XOF', 'Frais', 'Statut', 'Date', 'Wallet ID'];
    const csv = [head, ...payouts.map(p => [
      p.id,
      p.recipient_name,
      p.recipient_msisdn,
      p.amount,
      p.fee || 0,
      status(p)[0],
      dt(p.created_at || p.created),
      p.wallet_id || ''
    ])].map(r => r.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(';')).join('\r\n');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'decaissements-freeshop.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

/* ------------------- EVENT LISTENERS ------------------- */
// Wallet drawer click
const sideW = document.querySelector('#side-wallet');
if (sideW) sideW.onclick = showWalletDetail;
const topW = document.querySelector('#top-wallet');
if (topW) topW.onclick = showWalletDetail;
const cardW = document.querySelector('#card-wallet');
if (cardW) cardW.onclick = showWalletDetail;

// Settings & Refresh
document.querySelector('#settings').onclick = openSettings;
document.querySelector('#refresh').onclick = async () => {
  await load();
  if (mode === 'tfc') {
    try {
      await api('/api/payment-intents/sync', { method: 'POST' });
      await load();
    } catch (e) { toast(e.message); }
  }
  toast('Données actualisées.');
};

// Delegated Page Actions
document.querySelector('#page-actions').addEventListener('click', e => {
  if (e.target.closest('#orphan-btn')) openOrphanModal();
  else if (e.target.closest('#export')) exportCsv();
  else if (e.target.closest('#new')) openModal();
  else if (e.target.closest('#new-payout')) openPayoutModal();
  else if (e.target.closest('#refresh-payouts')) {
    load();
    toast('Décaissements actualisés.');
  }
});

// Filters & Search
['search', 'status', 'operator'].forEach(id => {
  const el = document.querySelector('#' + id);
  if (el) el.addEventListener(id === 'search' ? 'input' : 'change', render);
});

// Table row clicks
document.querySelector('#rows').addEventListener('click', e => {
  const cancelBtn = e.target.closest('.quick-cancel-btn');
  if (cancelBtn) {
    e.stopPropagation();
    cancelPayout(cancelBtn.dataset.id);
    return;
  }
  const tr = e.target.closest('tr');
  if (!tr) return;
  const id = tr.dataset.id;
  const type = tr.dataset.type;
  if (type === 'payout') {
    showPayoutDetail(id);
  } else {
    showDetail(id);
  }
});

// Navigation tabs
document.querySelectorAll('.nav button').forEach(b => {
  b.onclick = () => {
    const tab = b.dataset.tab;
    if (tab === 'collect' || tab === 'payouts') {
      switchTab(tab);
    } else {
      toast(`La section « ${b.dataset.short || 'cette rubrique'} » sera disponible prochainement.`);
    }
  };
});

// Keyboard
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeDrawer();
  }
});

// Logout
const logoutBtn = document.querySelector('#logout-btn');
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    if (confirm('Voulez-vous vous déconnecter de Freeshop ?')) {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      window.location.href = '/login.html';
    }
  };
}

// Initial boot
load();
