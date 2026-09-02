/**
 * Disciplined Budget Tracker - Supabase Cloud Synced Logic
 */

const SUPABASE_URL = 'https://vwyiygetdbnibwlfpcjy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3eWl5Z2V0ZGJuaWJ3bGZwY2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMzU2ODMsImV4cCI6MjEwMzkxMTY4M30.1jldKZKmMlkRwqQ6TLsrPaoHDgWEo9mBYdcuL7WLNAQ';

let supabaseClient = null;
if (window.supabase && SUPABASE_URL && !SUPABASE_URL.includes('YOUR_')) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('Supabase initialization failed:', e);
  }
}

const CURRENT_USER_KEY = 'disciplined_active_user_id';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const CATEGORIES = [
  'Family & Giving',
  'Food & Dining',
  'Tithes & Offering',
  'Transport & Gas',
  'Utilities & Bills',
  'Housing & Rent',
  'Personal Care',
  'Credit Card Payment',
  'Others'
];

const BRAND_PRESETS = [
  { keywords: ['gotyme', 'tyme'], color: 'from-teal-700 to-cyan-950' },
  { keywords: ['gcash'], color: 'from-blue-600 to-indigo-700' },
  { keywords: ['maya', 'paymaya'], color: 'from-slate-900 to-emerald-900' },
  { keywords: ['unionbank', 'union bank', 'ubp'], color: 'from-amber-600 to-orange-700' },
  { keywords: ['bdo', 'bdo unibank'], color: 'from-blue-800 to-blue-950' },
  { keywords: ['bpi'], color: 'from-red-700 to-rose-950' },
  { keywords: ['metrobank', 'metro bank'], color: 'from-blue-700 to-blue-900' },
  { keywords: ['landbank', 'land bank'], color: 'from-emerald-700 to-green-950' },
  { keywords: ['security bank', 'sec bank'], color: 'from-emerald-600 to-teal-900' },
  { keywords: ['seabank', 'sea bank', 'shopee'], color: 'from-orange-500 to-red-700' },
  { keywords: ['cimb'], color: 'from-red-600 to-rose-800' },
  { keywords: ['rcbc'], color: 'from-blue-600 to-cyan-800' },
  { keywords: ['hsbc'], color: 'from-red-700 to-slate-900' },
  { keywords: ['citibank', 'citi'], color: 'from-blue-600 to-sky-900' },
  { keywords: ['eastwest', 'east west'], color: 'from-purple-800 to-slate-950' }
];

function getAutoBrandColor(accountName, type = 'bank') {
  if (!accountName) return type === 'credit' ? 'from-slate-900 to-zinc-950' : 'from-slate-800 to-slate-950';
  const query = accountName.toLowerCase().trim();
  const match = BRAND_PRESETS.find(preset =>
    preset.keywords.some(k => query.includes(k))
  );
  return match ? match.color : (type === 'credit' ? 'from-slate-900 to-zinc-950' : 'from-slate-800 to-slate-950');
}

const DEFAULT_STATE_TEMPLATE = {
  selectedYear: 2026,
  selectedMonth: 0,
  activeTab: 'monthly',
  accounts: [],
  months: {}
};

let currentUser = null;
let appState = null;

async function loadUserState(userId) {
  if (!supabaseClient) {
    const local = localStorage.getItem(`disciplined_vault_user_${userId}`);
    return local ? JSON.parse(local) : JSON.parse(JSON.stringify(DEFAULT_STATE_TEMPLATE));
  }

  try {
    const { data, error } = await supabaseClient
      .from('user_states')
      .select('state')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return JSON.parse(JSON.stringify(DEFAULT_STATE_TEMPLATE));
    }
    return data.state;
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_STATE_TEMPLATE));
  }
}

async function saveState() {
  if (!currentUser) return;

  localStorage.setItem(`disciplined_vault_user_${currentUser.id}`, JSON.stringify(appState));

  if (!supabaseClient) return;

  try {
    await supabaseClient
      .from('user_states')
      .upsert({ user_id: currentUser.id, state: appState, updated_at: new Date() });
  } catch (e) {
    console.warn('Cloud sync error (saved locally):', e);
  }
}

function ensureMonthData(year, month) {
  if (!appState) return { incomes: [], expenses: [], bills: [], savings: [] };
  const key = `${year}-${month}`;
  if (!appState.months[key]) {
    appState.months[key] = { incomes: [], expenses: [], bills: [], savings: [] };
  }
  return appState.months[key];
}

function calculateAccountBalance(accountId) {
  if (!appState) return 0;
  const account = appState.accounts.find((a) => a.id === accountId);
  if (!account) return 0;

  const currentMonthData = ensureMonthData(appState.selectedYear, appState.selectedMonth);

  if (account.type === 'credit' || account.type === 'loan') {
    let usedDebt = Number(account.creditUsed || 0);
    currentMonthData.expenses.forEach((exp) => { if (exp.accountId === accountId) usedDebt += Number(exp.amount || 0); });
    currentMonthData.bills.forEach((bill) => {
      if (bill.accountId === accountId && bill.paid) {
        if (bill.direction === 'credit') usedDebt -= Number(bill.amount || 0);
        else usedDebt += Number(bill.amount || 0);
      }
    });
    currentMonthData.incomes.forEach((inc) => { if (inc.accountId === accountId) usedDebt -= Number(inc.amount || 0); });
    return Math.max(0, usedDebt);
  }

  let balance = Number(account.baselineBalance || 0);
  currentMonthData.incomes.forEach((inc) => { if (inc.accountId === accountId) balance += Number(inc.amount || 0); });
  currentMonthData.bills.forEach((bill) => { if (bill.accountId === accountId && bill.paid && bill.direction !== 'credit') balance -= Number(bill.amount || 0); });
  currentMonthData.expenses.forEach((exp) => { if (exp.accountId === accountId) balance -= Number(exp.amount || 0); });
  return balance;
}

function formatPHP(val) {
  const num = Number(val || 0);
  return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let activeDialogResolver = null;

function showCenteredDialog({ title, badge = 'Action Required', description, defaultValue = '', inputType = 'number', prefix = '₱', isConfirm = false }) {
  return new Promise((resolve) => {
    activeDialogResolver = resolve;
    const modal = document.getElementById('dialog-modal');
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-badge').textContent = badge;
    document.getElementById('dialog-description').textContent = description;
    const inputContainer = document.getElementById('dialog-input-container');
    const inputEl = document.getElementById('dialog-input');
    const confirmBtn = document.getElementById('dialog-confirm-btn');

    if (isConfirm) {
      inputContainer.classList.add('hidden');
      confirmBtn.className = 'rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-500 shadow-md transition';
      confirmBtn.textContent = 'Confirm Delete';
    } else {
      inputContainer.classList.remove('hidden');
      inputEl.type = inputType;
      inputEl.value = defaultValue;
      confirmBtn.className = 'rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 shadow-md transition';
      confirmBtn.textContent = 'Save Changes';
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (!isConfirm) setTimeout(() => inputEl.focus(), 50);
  });
}

function closeCenteredDialog(result = null) {
  const modal = document.getElementById('dialog-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  if (activeDialogResolver) {
    activeDialogResolver(result);
    activeDialogResolver = null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupAuthViews();
  setupHeaderSelectors();
  setupTabNavigation();
  setupEntryModal();
  setupAccountModal();
  setupDialogListeners();
  checkAuthSession();
});

function setupHeaderSelectors() {
  const yearSelect = document.getElementById('year-select');
  const monthSelect = document.getElementById('month-select');
  const START_YEAR = 2026;
  const availableYears = [];
  for (let y = START_YEAR; y <= START_YEAR + 50; y++) availableYears.push(y);

  const activeYear = appState ? appState.selectedYear : START_YEAR;
  yearSelect.innerHTML = availableYears.map((y) => `<option value="${y}" ${y === activeYear ? 'selected' : ''}>Year ${y}</option>`).join('');

  const activeMonth = appState ? appState.selectedMonth : 0;
  monthSelect.innerHTML = MONTH_NAMES.map((m, idx) => `<option value="${idx}" ${idx === activeMonth ? 'selected' : ''}>${m}</option>`).join('');

  yearSelect.onchange = (e) => { if (appState) { appState.selectedYear = parseInt(e.target.value, 10); saveState(); renderApp(); } };
  monthSelect.onchange = (e) => { if (appState) { appState.selectedMonth = parseInt(e.target.value, 10); saveState(); renderApp(); } };
}

function setupTabNavigation() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!appState) return;
      appState.activeTab = btn.getAttribute('data-tab');
      document.querySelectorAll('[data-tab]').forEach((b) => b.className = 'tab-button inactive rounded-lg px-4 py-2 text-xs font-bold transition');
      btn.className = 'tab-button active rounded-lg px-4 py-2 text-xs font-bold transition';

      document.getElementById('monthly-view').classList.toggle('hidden', appState.activeTab !== 'monthly');
      document.getElementById('annual-view').classList.toggle('hidden', appState.activeTab !== 'annual');
      document.getElementById('accounts-view').classList.toggle('hidden', appState.activeTab !== 'accounts');
      saveState();
      renderApp();
    });
  });
}

function populateAccountSelectOptions() {
  if (!appState) return;
  const select = document.getElementById('entry-account');
  select.innerHTML = appState.accounts.map((acc) => `<option value="${acc.id}">${acc.name} (${acc.type})</option>`).join('');
}

function setupEntryModal() {
  const modal = document.getElementById('entry-modal');
  const form = document.getElementById('entry-form');
  const typeSelect = document.getElementById('entry-type');
  document.getElementById('entry-category').innerHTML = CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');

  document.getElementById('add-income-btn').onclick = () => openModal('income');
  document.getElementById('add-expense-btn').onclick = () => openModal('expense');
  document.getElementById('add-bill-btn').onclick = () => openModal('bill');
  document.getElementById('add-savings-btn').onclick = () => openModal('savings');
  document.getElementById('add-entry-btn').onclick = () => openModal('income');

  function openModal(type) {
    populateAccountSelectOptions();
    form.reset();
    typeSelect.value = type;
    updateFields(type);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function updateFields(type) {
    document.getElementById('entry-category-group').classList.toggle('hidden', type !== 'expense');
    document.getElementById('entry-due-group').classList.toggle('hidden', type !== 'bill');
    document.getElementById('entry-direction-group').classList.toggle('hidden', type !== 'bill');
    document.getElementById('entry-goal-group').classList.toggle('hidden', type !== 'savings');
  }

  typeSelect.onchange = (e) => updateFields(e.target.value);
  document.getElementById('close-entry-modal').onclick = () => modal.classList.add('hidden');
  document.getElementById('cancel-entry-btn').onclick = () => modal.classList.add('hidden');

  form.onsubmit = (e) => {
    e.preventDefault();
    if (!appState) return;
    const type = typeSelect.value;
    const label = document.getElementById('entry-label').value.trim();
    const amount = parseFloat(document.getElementById('entry-amount').value) || 0;
    const accountId = document.getElementById('entry-account').value;
    const monthData = ensureMonthData(appState.selectedYear, appState.selectedMonth);
    const newId = 'entry-' + Date.now();

    if (type === 'income') monthData.incomes.push({ id: newId, label, amount, accountId });
    else if (type === 'expense') monthData.expenses.push({ id: newId, label, amount, category: document.getElementById('entry-category').value, accountId });
    else if (type === 'bill') monthData.bills.push({ id: newId, label, amount, due: document.getElementById('entry-due').value || 'End of Month', accountId, direction: document.getElementById('entry-direction').value, paid: false });
    else if (type === 'savings') monthData.savings.push({ id: newId, label, amount, goal: parseFloat(document.getElementById('entry-goal').value) || amount, accountId });

    saveState();
    modal.classList.add('hidden');
    renderApp();
  };
}

function openAccountModal(editAccountId = null) {
  const modal = document.getElementById('account-modal');
  const form = document.getElementById('account-form');
  form.reset();
  const typeSelect = document.getElementById('account-type');
  
  typeSelect.onchange = () => {
    const isCredit = typeSelect.value === 'credit' || typeSelect.value === 'loan';
    document.getElementById('credit-card-fields').classList.toggle('hidden', !isCredit);
    document.getElementById('liquid-account-fields').classList.toggle('hidden', isCredit);
  };
  typeSelect.onchange();

  if (editAccountId) {
    const existing = appState.accounts.find((a) => a.id === editAccountId);
    if (existing) {
      document.getElementById('account-id').value = existing.id;
      document.getElementById('account-name').value = existing.name;
      typeSelect.value = existing.type;
      typeSelect.onchange();
      if (existing.type === 'credit' || existing.type === 'loan') {
        document.getElementById('account-limit').value = existing.creditLimit || '';
        document.getElementById('account-used').value = existing.creditUsed || '';
      } else {
        document.getElementById('account-balance').value = existing.baselineBalance || '';
      }
    }
  } else {
    document.getElementById('account-id').value = '';
  }
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function setupAccountModal() {
  const modal = document.getElementById('account-modal');
  document.getElementById('add-account-btn').onclick = () => openAccountModal();
  document.getElementById('close-account-modal').onclick = () => modal.classList.add('hidden');
  document.getElementById('cancel-account-btn').onclick = () => modal.classList.add('hidden');

  document.getElementById('account-form').onsubmit = (e) => {
    e.preventDefault();
    if (!appState) return;
    const id = document.getElementById('account-id').value || 'acc-' + Date.now();
    const name = document.getElementById('account-name').value.trim();
    const type = document.getElementById('account-type').value;
    const color = getAutoBrandColor(name, type);

    let acc = { id, name, type, color };
    if (type === 'credit' || type === 'loan') {
      acc.creditLimit = parseFloat(document.getElementById('account-limit').value) || 0;
      acc.creditUsed = parseFloat(document.getElementById('account-used').value) || 0;
      acc.dueDay = '15th';
    } else {
      acc.baselineBalance = parseFloat(document.getElementById('account-balance').value) || 0;
    }

    const idx = appState.accounts.findIndex((a) => a.id === id);
    if (idx >= 0) appState.accounts[idx] = acc;
    else appState.accounts.push(acc);

    saveState();
    modal.classList.add('hidden');
    renderApp();
  };
}

function setupDialogListeners() {
  document.getElementById('dialog-cancel-btn').onclick = () => closeCenteredDialog(null);
  document.getElementById('close-dialog-modal').onclick = () => closeCenteredDialog(null);
  document.getElementById('dialog-form').onsubmit = (e) => {
    e.preventDefault();
    closeCenteredDialog(document.getElementById('dialog-input').value || true);
  };
}

let monthlyChartInstance = null;
let annualChartInstance = null;

function renderApp() {
  if (!appState) return;
  const monthData = ensureMonthData(appState.selectedYear, appState.selectedMonth);

  renderKPIs(monthData);
  renderExpenses(monthData);
  renderSavings(monthData);
  renderIncomes(monthData);
  renderBills(monthData);
  renderAccounts();
  renderOverviewPanels();
  renderMonthlyChart(monthData);
  renderAnnualLedger();

  if (window.lucide) window.lucide.createIcons();
}

function renderOverviewPanels() {
  const liquidContainer = document.getElementById('overview-liquid-list');
  const creditContainer = document.getElementById('overview-credit-list');
  liquidContainer.innerHTML = '';
  creditContainer.innerHTML = '';
  let totalLiquid = 0, totalDebt = 0;

  appState.accounts.filter(a => a.type === 'bank' || a.type === 'wallet').forEach(acc => {
    const bal = calculateAccountBalance(acc.id);
    totalLiquid += bal;
    liquidContainer.innerHTML += `<div class="flex justify-between p-2 bg-slate-50 rounded-xl text-xs font-bold"><span>${acc.name}</span><span>${formatPHP(bal)}</span></div>`;
  });

  appState.accounts.filter(a => a.type === 'credit' || a.type === 'loan').forEach(acc => {
    const debt = calculateAccountBalance(acc.id);
    totalDebt += debt;
    creditContainer.innerHTML += `<div class="flex justify-between p-2 bg-amber-50 rounded-xl text-xs font-bold"><span>${acc.name}</span><span class="text-rose-600">${formatPHP(debt)}</span></div>`;
  });

  document.getElementById('overview-total-liquid').textContent = formatPHP(totalLiquid);
  document.getElementById('overview-total-debt').textContent = formatPHP(totalDebt);
}

function renderKPIs(monthData) {
  const inc = monthData.incomes.reduce((a, b) => a + Number(b.amount || 0), 0);
  const exp = monthData.expenses.reduce((a, b) => a + Number(b.amount || 0), 0);
  const bills = monthData.bills.filter(b => b.paid && b.direction !== 'credit').reduce((a, b) => a + Number(b.amount || 0), 0);
  const net = inc - exp - bills;

  document.getElementById('income-total').textContent = formatPHP(inc);
  document.getElementById('expense-total').textContent = formatPHP(exp);
  document.getElementById('bill-total').textContent = formatPHP(monthData.bills.reduce((a, b) => a + Number(b.amount || 0), 0));
  document.getElementById('net-total').textContent = formatPHP(net);
}

function renderIncomes(monthData) {
  const list = document.getElementById('income-list');
  list.innerHTML = monthData.incomes.length === 0 ? '<p class="text-xs text-slate-400">No income streams.</p>' : '';
  monthData.incomes.forEach(inc => {
    list.innerHTML += `<div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl text-xs font-bold"><span>${inc.label}</span><span class="text-emerald-600">${formatPHP(inc.amount)}</span></div>`;
  });
}

function renderBills(monthData) {
  const list = document.getElementById('bill-list');
  list.innerHTML = monthData.bills.length === 0 ? '<p class="text-xs text-slate-400">No bills recorded.</p>' : '';
  monthData.bills.forEach(bill => {
    list.innerHTML += `<div class="flex justify-between items-center p-3 bg-amber-50/50 rounded-xl text-xs font-bold"><span>${bill.label} (${bill.paid ? 'Paid' : 'Unpaid'})</span><span>${formatPHP(bill.amount)}</span></div>`;
  });
}

function renderExpenses(monthData) {
  const tbody = document.getElementById('expense-table-body');
  tbody.innerHTML = '';
  monthData.expenses.forEach(exp => {
    tbody.innerHTML += `<tr class="border-b text-xs"><td class="p-3">${exp.category}</td><td class="p-3 font-bold">${exp.label}</td><td class="p-3 text-right font-black">${formatPHP(exp.amount)}</td></tr>`;
  });
}

function renderSavings(monthData) {
  document.getElementById('savings-panel').innerHTML = monthData.savings.map(s => `<div class="p-3 bg-slate-50 rounded-xl text-xs font-bold"><span>${s.label}</span>: ${formatPHP(s.amount)} / ${formatPHP(s.goal)}</div>`).join('');
}

function renderAccounts() {
  const grid = document.getElementById('account-grid');
  grid.innerHTML = appState.accounts.map(acc => `<div class="p-4 bg-white border rounded-xl shadow-sm text-xs font-bold"><h4>${acc.name} (${acc.type})</h4><p class="text-sm font-black mt-2">${formatPHP(calculateAccountBalance(acc.id))}</p></div>`).join('');
}

function renderMonthlyChart(monthData) {
  const ctx = document.getElementById('monthlyChart').getContext('2d');
  const inc = monthData.incomes.reduce((a, b) => a + Number(b.amount || 0), 0);
  const exp = monthData.expenses.reduce((a, b) => a + Number(b.amount || 0), 0);
  if (monthlyChartInstance) monthlyChartInstance.destroy();
  monthlyChartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: ['Surplus', 'Expenses'], datasets: [{ data: [Math.max(0, inc - exp), exp], backgroundColor: ['#059669', '#e11d48'] }] } });
}

function renderAnnualLedger() {
  document.getElementById('annual-table-body').innerHTML = MONTH_NAMES.map((m, idx) => {
    const mData = appState.months[`${appState.selectedYear}-${idx}`] || { incomes: [], expenses: [], bills: [] };
    const inc = mData.incomes.reduce((a, b) => a + Number(b.amount || 0), 0);
    const exp = mData.expenses.reduce((a, b) => a + Number(b.amount || 0), 0);
    return `<tr class="border-b text-xs font-bold"><td class="p-3">${m}</td><td class="p-3 text-right text-emerald-600">${formatPHP(inc)}</td><td class="p-3 text-right text-rose-600">${formatPHP(exp)}</td></tr>`;
  }).join('');
}

function showAuthAlert(msg, type = 'error') {
  const alertEl = document.getElementById('auth-alert');
  alertEl.textContent = msg;
  alertEl.className = `mb-4 rounded-xl p-3 text-xs font-bold ${type === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`;
  alertEl.classList.remove('hidden');
}

function setupAuthViews() {
  const signinForm = document.getElementById('signin-form');
  const signupForm = document.getElementById('signup-form');

  document.getElementById('go-signup-btn').onclick = () => { signinForm.classList.add('hidden'); signupForm.classList.remove('hidden'); };
  document.getElementById('back-to-signin-btn').onclick = () => { signupForm.classList.add('hidden'); signinForm.classList.remove('hidden'); };

  signinForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('signin-identifier').value.trim();
    const password = document.getElementById('signin-password').value;

    if (!supabaseClient) { showAuthAlert('Supabase client missing.'); return; }

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { showAuthAlert(error.message); return; }

    loginUser(data.user);
  };

  signupForm.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (!supabaseClient) { showAuthAlert('Supabase client missing.'); return; }

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });

    if (error) { showAuthAlert(error.message); return; }

    if (data.user) {
      await supabaseClient.from('user_states').upsert({ user_id: data.user.id, state: DEFAULT_STATE_TEMPLATE });
      loginUser(data.user);
    }
  };

  document.getElementById('signout-btn').onclick = async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    localStorage.removeItem(CURRENT_USER_KEY);
    currentUser = null;
    appState = null;
    document.getElementById('auth-gate').classList.remove('hidden');
  };
}

async function loginUser(user) {
  currentUser = { id: user.id, email: user.email, name: user.user_metadata?.full_name || user.email.split('@')[0] };
  localStorage.setItem(CURRENT_USER_KEY, currentUser.id);
  appState = await loadUserState(currentUser.id);

  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('active-user-name').textContent = currentUser.name;
  document.getElementById('active-avatar').textContent = currentUser.name.substring(0, 2).toUpperCase();
  setupHeaderSelectors();
  renderApp();
}

async function checkAuthSession() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    loginUser(session.user);
  }
}
