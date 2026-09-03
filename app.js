/**
 * Disciplined Budget Tracker - Supabase Integrated Application Logic
 */

// Supabase Configuration
const SUPABASE_URL = 'https://vwyiygetdbnibwlfpcjy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3eWl5Z2V0ZGJuaWJ3bGZwY2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMzU2ODMsImV4cCI6MjEwMzkxMTY4M30.1jldKZKmMlkRwqQ6TLsrPaoHDgWEo9mBYdcuL7WLNAQ';

let supabaseClient = null;
if (window.supabase && SUPABASE_URL && !SUPABASE_URL.includes('YOUR_')) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('Supabase initialization failed, running offline local storage:', e);
  }
}

const USERS_STORAGE_KEY = 'disciplined_users_db_v1';
const CURRENT_USER_KEY = 'disciplined_active_user_id';
const MAX_PROFILES = 5;

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

let usersDb = loadUsersDatabase();
let currentUserId = localStorage.getItem(CURRENT_USER_KEY);
let appState = null;

function loadUsersDatabase() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveUsersDatabase() {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(usersDb));
}

function getUserStorageKey(userId) {
  return `disciplined_vault_user_${userId}`;
}

// Asynchronous State Loading from Supabase with Local Cache Fallback
async function loadUserState(userId) {
  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('user_vaults')
        .select('state')
        .eq('user_id', userId)
        .single();

      if (!error && data && data.state) {
        localStorage.setItem(getUserStorageKey(userId), JSON.stringify(data.state));
        return data.state;
      }
    }
  } catch (e) {
    console.warn('Network offline or Supabase unreachable, loading from local cache:', e);
  }

  try {
    const raw = localStorage.getItem(getUserStorageKey(userId));
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE_TEMPLATE));
    return JSON.parse(raw);
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_STATE_TEMPLATE));
  }
}

// Asynchronous State Saving to Supabase & Local Storage
async function saveState() {
  if (!currentUserId || !appState) return;

  localStorage.setItem(getUserStorageKey(currentUserId), JSON.stringify(appState));

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('user_vaults')
        .upsert({
          user_id: currentUserId,
          state: appState,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Failed to sync state to Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Supabase save network error:', err);
    }
  }
}

function ensureMonthData(year, month) {
  if (!appState) return { incomes: [], expenses: [], bills: [], savings: [] };
  const key = `${year}-${month}`;
  if (!appState.months[key]) {
    appState.months[key] = {
      incomes: [],
      expenses: [],
      bills: [],
      savings: []
    };
  }

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear = year - 1;
  }
  const prevKey = `${prevYear}-${prevMonth}`;
  const prevData = appState.months[prevKey];

  if (prevData && prevData.bills) {
    prevData.bills.forEach((prevBill) => {
      if (!prevBill.paid) {
        const alreadyRolled = appState.months[key].bills.some(
          (b) => b.originalId === prevBill.id || (b.label === prevBill.label && b.arrearsFrom === MONTH_NAMES[prevMonth])
        );

        if (!alreadyRolled) {
          appState.months[key].bills.unshift({
            id: 'rollover-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
            originalId: prevBill.id,
            label: prevBill.label,
            amount: prevBill.amount,
            due: prevBill.due || 'Past Due',
            accountId: prevBill.accountId,
            direction: prevBill.direction || 'debit',
            paid: false,
            arrearsFrom: MONTH_NAMES[prevMonth]
          });
        }
      }
    });
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

    currentMonthData.expenses.forEach((exp) => {
      if (exp.accountId === accountId) {
        usedDebt += Number(exp.amount || 0);
      }
    });

    currentMonthData.bills.forEach((bill) => {
      if (bill.accountId === accountId && bill.paid) {
        if (bill.direction === 'credit') {
          usedDebt -= Number(bill.amount || 0);
        } else {
          usedDebt += Number(bill.amount || 0);
        }
      }
    });

    currentMonthData.incomes.forEach((inc) => {
      if (inc.accountId === accountId) {
        usedDebt -= Number(inc.amount || 0);
      }
    });

    return Math.max(0, usedDebt);
  }

  let balance = Number(account.baselineBalance || 0);

  currentMonthData.incomes.forEach((inc) => {
    if (inc.accountId === accountId) {
      balance += Number(inc.amount || 0);
    }
  });

  currentMonthData.bills.forEach((bill) => {
    if (bill.accountId === accountId && bill.paid) {
      if (bill.direction !== 'credit') {
        balance -= Number(bill.amount || 0);
      }
    }
  });

  currentMonthData.expenses.forEach((exp) => {
    if (exp.accountId === accountId) {
      balance -= Number(exp.amount || 0);
    }
  });

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
    const titleEl = document.getElementById('dialog-title');
    const badgeEl = document.getElementById('dialog-badge');
    const descEl = document.getElementById('dialog-description');
    const inputContainer = document.getElementById('dialog-input-container');
    const inputEl = document.getElementById('dialog-input');
    const prefixEl = document.getElementById('dialog-input-prefix');
    const confirmBtn = document.getElementById('dialog-confirm-btn');

    titleEl.textContent = title;
    badgeEl.textContent = badge;
    descEl.textContent = description;

    if (isConfirm) {
      inputContainer.classList.add('hidden');
      confirmBtn.className = 'rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-500 shadow-md transition';
      confirmBtn.textContent = 'Confirm Delete';
    } else {
      inputContainer.classList.remove('hidden');
      inputEl.type = inputType;
      inputEl.value = defaultValue;
      prefixEl.style.display = prefix ? 'flex' : 'none';
      if (!prefix) inputEl.classList.remove('pl-8');
      else inputEl.classList.add('pl-8');

      confirmBtn.className = 'rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 shadow-md transition';
      confirmBtn.textContent = 'Save Changes';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (!isConfirm) {
      setTimeout(() => inputEl.focus(), 50);
    }
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
  const currentActualYear = new Date().getFullYear();
  const endYear = Math.max(currentActualYear + 30, (appState?.selectedYear || START_YEAR) + 10, START_YEAR + 50);

  const availableYears = [];
  for (let y = START_YEAR; y <= endYear; y++) {
    availableYears.push(y);
  }

  if (!appState || !appState.selectedYear || appState.selectedYear < START_YEAR) {
    if (appState) appState.selectedYear = START_YEAR;
  }

  const activeYear = appState ? appState.selectedYear : START_YEAR;
  yearSelect.innerHTML = availableYears
    .map((y) => `<option value="${y}" ${y === activeYear ? 'selected' : ''}>Year ${y}</option>`)
    .join('');

  const activeMonth = appState ? appState.selectedMonth : 0;
  monthSelect.innerHTML = MONTH_NAMES.map((m, idx) => `<option value="${idx}" ${idx === activeMonth ? 'selected' : ''}>${m}</option>`).join('');

  yearSelect.addEventListener('change', (e) => {
    if (!appState) return;
    appState.selectedYear = parseInt(e.target.value, 10);
    saveState();
    renderApp();
  });

  monthSelect.addEventListener('change', (e) => {
    if (!appState) return;
    appState.selectedMonth = parseInt(e.target.value, 10);
    saveState();
    renderApp();
  });
}

function setupTabNavigation() {
  const tabButtons = document.querySelectorAll('[data-tab]');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!appState) return;
      appState.activeTab = btn.getAttribute('data-tab');
      tabButtons.forEach((b) => {
        b.className = 'tab-button inactive rounded-lg px-4 py-2 text-xs font-bold transition';
      });
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
  select.innerHTML = appState.accounts
    .map((acc) => {
      const typeLabel = acc.type === 'credit' ? 'Credit Card' : (acc.tag || acc.type);
      return `<option value="${acc.id}">${acc.name} (${typeLabel})</option>`;
    })
    .join('');
}

function setupEntryModal() {
  const modal = document.getElementById('entry-modal');
  const form = document.getElementById('entry-form');
  const addEntryBtn = document.getElementById('add-entry-btn');
  const closeBtn = document.getElementById('close-entry-modal');
  const cancelBtn = document.getElementById('cancel-entry-btn');
  const typeSelect = document.getElementById('entry-type');
  const categorySelect = document.getElementById('entry-category');
  const directionSelect = document.getElementById('entry-direction');

  document.getElementById('add-income-btn').addEventListener('click', () => openEntryModalFor('income'));
  document.getElementById('add-expense-btn').addEventListener('click', () => openEntryModalFor('expense'));
  document.getElementById('add-bill-btn').addEventListener('click', () => openEntryModalFor('bill'));
  document.getElementById('add-savings-btn').addEventListener('click', () => openEntryModalFor('savings'));

  categorySelect.innerHTML = CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');
  addEntryBtn.addEventListener('click', () => openEntryModalFor('income'));

  function openEntryModalFor(type) {
    populateAccountSelectOptions();
    typeSelect.value = type;
    document.getElementById('entry-id').value = '';
    form.reset();
    typeSelect.value = type;
    updateModalFields(type);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => document.getElementById('entry-label').focus(), 50);
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  typeSelect.addEventListener('change', (e) => updateModalFields(e.target.value));

  function updateModalFields(type) {
    const isExpense = type === 'expense';
    const isBill = type === 'bill';
    const isSavings = type === 'savings';

    document.getElementById('entry-category-group').classList.toggle('hidden', !isExpense);
    document.getElementById('entry-due-group').classList.toggle('hidden', !isBill);
    document.getElementById('entry-direction-group').classList.toggle('hidden', !isBill);
    document.getElementById('entry-goal-group').classList.toggle('hidden', !isSavings);

    const accountLabel = document.getElementById('entry-account-label');
    if (type === 'income') accountLabel.textContent = 'Deposit Into Account';
    else if (type === 'expense') accountLabel.textContent = 'Deduct From Card / Account';
    else if (type === 'bill') accountLabel.textContent = 'Associated Account / Card';
    else accountLabel.textContent = 'Linked Account';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!appState) return;

    const type = typeSelect.value;
    const label = document.getElementById('entry-label').value.trim();
    const amount = parseFloat(document.getElementById('entry-amount').value) || 0;
    const accountId = document.getElementById('entry-account').value;
    const monthData = ensureMonthData(appState.selectedYear, appState.selectedMonth);
    const newId = 'entry-' + Date.now();

    if (type === 'income') {
      monthData.incomes.push({ id: newId, label, amount, accountId });
    } else if (type === 'expense') {
      const category = categorySelect.value;
      monthData.expenses.push({ id: newId, label, amount, category, accountId });
    } else if (type === 'bill') {
      const due = document.getElementById('entry-due').value.trim() || 'End of Month';
      const direction = directionSelect.value || 'debit';
      monthData.bills.push({ id: newId, label, amount, due, accountId, direction, paid: false, arrearsFrom: null });
    } else if (type === 'savings') {
      const goal = parseFloat(document.getElementById('entry-goal').value) || amount;
      monthData.savings.push({ id: newId, label, amount, goal, accountId });
    }

    saveState();
    closeModal();
    renderApp();
  });
}

function openAccountModal(editAccountId = null) {
  const modal = document.getElementById('account-modal');
  const form = document.getElementById('account-form');
  const titleEl = document.getElementById('account-modal-title');
  const badgeEl = document.getElementById('account-modal-badge');
  const saveBtn = document.getElementById('save-account-btn');
  const typeSelect = document.getElementById('account-type');

  const liquidGroup = document.getElementById('liquid-account-fields');
  const creditGroup = document.getElementById('credit-card-fields');

  form.reset();

  function toggleAccountTypeFields() {
    const isCredit = typeSelect.value === 'credit' || typeSelect.value === 'loan';
    creditGroup.classList.toggle('hidden', !isCredit);
    liquidGroup.classList.toggle('hidden', isCredit);
  }

  typeSelect.onchange = toggleAccountTypeFields;

  if (editAccountId) {
    const existing = appState.accounts.find((a) => a.id === editAccountId);
    if (existing) {
      document.getElementById('account-id').value = existing.id;
      document.getElementById('account-name').value = existing.name;
      typeSelect.value = existing.type || 'bank';
      document.getElementById('account-last-four').value = existing.lastFour || '';

      if (existing.type === 'credit' || existing.type === 'loan') {
        document.getElementById('account-limit').value = existing.creditLimit || '';
        document.getElementById('account-used').value = existing.creditUsed || '';
        document.getElementById('account-due-day').value = existing.dueDay || '';
      } else {
        document.getElementById('account-balance').value = existing.baselineBalance || '';
        document.getElementById('account-tag').value = existing.tag || '';
      }

      titleEl.textContent = 'Edit Card / Account';
      badgeEl.textContent = 'Update Details';
      saveBtn.textContent = 'Update Changes';
    }
  } else {
    document.getElementById('account-id').value = '';
    titleEl.textContent = 'Add Account / Card';
    badgeEl.textContent = 'Account Setup';
    saveBtn.textContent = 'Save Account';
  }

  toggleAccountTypeFields();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => document.getElementById('account-name').focus(), 50);
}

function setupAccountModal() {
  const modal = document.getElementById('account-modal');
  const form = document.getElementById('account-form');
  const openBtn = document.getElementById('add-account-btn');
  const closeBtn = document.getElementById('close-account-modal');
  const cancelBtn = document.getElementById('cancel-account-btn');
  const typeSelect = document.getElementById('account-type');

  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  openBtn.addEventListener('click', () => openAccountModal(null));
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!appState) return;

    const id = document.getElementById('account-id').value || 'acc-' + Date.now();
    const name = document.getElementById('account-name').value.trim();
    const type = typeSelect.value;
    const lastFour = document.getElementById('account-last-four').value.trim() || '0000';
    const color = getAutoBrandColor(name, type);

    let newAccount = { id, name, type, color, lastFour };

    if (type === 'credit' || type === 'loan') {
      newAccount.creditLimit = parseFloat(document.getElementById('account-limit').value) || 0;
      newAccount.creditUsed = parseFloat(document.getElementById('account-used').value) || 0;
      newAccount.dueDay = document.getElementById('account-due-day').value.trim() || '15th';
      newAccount.tag = type === 'credit' ? 'Credit Card' : 'Financing';
    } else {
      newAccount.baselineBalance = parseFloat(document.getElementById('account-balance').value) || 0;
      newAccount.tag = document.getElementById('account-tag').value.trim() || (type === 'bank' ? 'Savings' : 'Digital');
    }

    const existingIdx = appState.accounts.findIndex((a) => a.id === id);
    if (existingIdx >= 0) {
      appState.accounts[existingIdx] = newAccount;
    } else {
      appState.accounts.push(newAccount);
    }

    saveState();
    closeModal();
    renderApp();
  });
}

function setupDialogListeners() {
  const modal = document.getElementById('dialog-modal');
  const form = document.getElementById('dialog-form');
  const cancelBtn = document.getElementById('dialog-cancel-btn');
  const closeBtn = document.getElementById('close-dialog-modal');

  cancelBtn.addEventListener('click', () => closeCenteredDialog(null));
  closeBtn.addEventListener('click', () => closeCenteredDialog(null));

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCenteredDialog(null);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeCenteredDialog(null);
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputVal = document.getElementById('dialog-input').value;
    closeCenteredDialog(inputVal || true);
  });
}

let monthlyChartInstance = null;
let annualChartInstance = null;

function renderApp() {
  if (!appState) return;

  const currentMonthData = ensureMonthData(appState.selectedYear, appState.selectedMonth);

  renderKPIs(currentMonthData);
  renderExpenses(currentMonthData);
  renderSavings(currentMonthData);
  renderIncomes(currentMonthData);
  renderBills(currentMonthData);
  renderAccounts();
  renderOverviewPanels();
  renderMonthlyChart(currentMonthData);
  renderAnnualLedger();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderOverviewPanels() {
  const liquidContainer = document.getElementById('overview-liquid-list');
  const creditContainer = document.getElementById('overview-credit-list');
  
  liquidContainer.innerHTML = '';
  creditContainer.innerHTML = '';

  let totalLiquid = 0;
  let totalDebt = 0;

  const liquidAccounts = appState.accounts.filter(a => a.type === 'bank' || a.type === 'wallet');
  const creditAccounts = appState.accounts.filter(a => a.type === 'credit' || a.type === 'loan');

  if (liquidAccounts.length === 0) {
    liquidContainer.innerHTML = '<p class="text-xs text-slate-400 py-2">No bank accounts registered.</p>';
  } else {
    liquidAccounts.forEach(acc => {
      const balance = calculateAccountBalance(acc.id);
      totalLiquid += balance;

      const item = document.createElement('div');
      item.className = 'flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 hover:bg-slate-100/70 transition';
      item.innerHTML = `
        <div class="flex items-center gap-2.5">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-black text-xs">
            <i data-lucide="${acc.type === 'wallet' ? 'smartphone' : 'building'}" class="h-4 w-4"></i>
          </div>
          <div>
            <h4 class="text-xs font-bold text-slate-900">${acc.name}</h4>
            <p class="text-[10px] text-slate-500 font-semibold">${acc.tag || 'Savings'} •••• ${acc.lastFour || '0000'}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-xs font-black text-slate-900">${formatPHP(balance)}</p>
          <span class="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Remaining</span>
        </div>
      `;
      liquidContainer.appendChild(item);
    });
  }

  if (creditAccounts.length === 0) {
    creditContainer.innerHTML = '<p class="text-xs text-slate-400 py-2">No credit cards or financing active.</p>';
  } else {
    creditAccounts.forEach(acc => {
      const debtToPay = calculateAccountBalance(acc.id);
      const limit = Number(acc.creditLimit || 0);
      const available = Math.max(0, limit - debtToPay);
      totalDebt += debtToPay;

      const item = document.createElement('div');
      item.className = 'rounded-xl border border-amber-100 bg-amber-50/40 p-3 hover:bg-amber-50/70 transition';
      item.innerHTML = `
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <span class="flex h-2 w-2 rounded-full bg-rose-500"></span>
            <h4 class="text-xs font-bold text-slate-900">${acc.name}</h4>
          </div>
          <span class="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md">
            Due ${acc.dueDay || '15th'}
          </span>
        </div>

        <div class="flex items-baseline justify-between mt-1">
          <div>
            <p class="text-sm font-black text-rose-600">${formatPHP(debtToPay)}</p>
            <p class="text-[10px] font-semibold text-slate-500">Balance to pay this cycle</p>
          </div>
          <div class="text-right">
            <p class="text-xs font-bold text-slate-700">${formatPHP(available)}</p>
            <p class="text-[10px] font-semibold text-slate-400">Available credit</p>
          </div>
        </div>
      `;
      creditContainer.appendChild(item);
    });
  }

  document.getElementById('overview-total-liquid').textContent = formatPHP(totalLiquid);
  document.getElementById('overview-total-debt').textContent = formatPHP(totalDebt);
}

function renderKPIs(monthData) {
  const totalIncome = monthData.incomes.reduce((acc, i) => acc + Number(i.amount || 0), 0);
  const totalExpenses = monthData.expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
  
  const totalPaidBills = monthData.bills
    .filter((b) => b.paid && b.direction !== 'credit')
    .reduce((acc, b) => acc + Number(b.amount || 0), 0);

  const totalBillsDue = monthData.bills.reduce((acc, b) => acc + Number(b.amount || 0), 0);
  const netSurplus = totalIncome - totalExpenses - totalPaidBills;

  document.getElementById('income-total').textContent = formatPHP(totalIncome);
  document.getElementById('income-subtext').textContent = `${monthData.incomes.length} verified income stream(s)`;

  document.getElementById('expense-total').textContent = formatPHP(totalExpenses);
  document.getElementById('expense-subtext').textContent = `${monthData.expenses.length} itemized transaction(s)`;

  document.getElementById('bill-total').textContent = formatPHP(totalBillsDue);
  const unpaidCount = monthData.bills.filter((b) => !b.paid).length;
  document.getElementById('bill-subtext').textContent = unpaidCount > 0 ? `${unpaidCount} unpaid / pending balance` : 'All bills settled for this month!';

  document.getElementById('net-total').textContent = formatPHP(netSurplus);
  const margin = totalIncome > 0 ? ((netSurplus / totalIncome) * 100).toFixed(1) : 0;
  document.getElementById('net-subtext').textContent = `${margin}% net cash margin`;
}

function renderIncomes(monthData) {
  const list = document.getElementById('income-list');
  list.innerHTML = '';

  if (monthData.incomes.length === 0) {
    list.innerHTML = '<p class="text-sm text-slate-400 font-medium py-3">No income streams credited this month.</p>';
    return;
  }

  monthData.incomes.forEach((inc) => {
    const acc = appState.accounts.find((a) => a.id === inc.accountId);
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 hover:bg-slate-50 transition';
    item.innerHTML = `
      <div>
        <h4 class="font-bold text-slate-900">${inc.label}</h4>
        <p class="text-xs font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
          <i data-lucide="arrow-down-left" class="h-3.5 w-3.5"></i> Credited to ${acc ? acc.name : 'Unlinked Account'}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-black text-emerald-600 text-base">${formatPHP(inc.amount)}</span>
        <button data-action="edit-income" data-id="${inc.id}" class="text-slate-400 hover:text-slate-700 transition"><i data-lucide="edit-3" class="h-4 w-4"></i></button>
        <button data-action="delete-income" data-id="${inc.id}" class="text-slate-400 hover:text-rose-600 transition"><i data-lucide="trash-2" class="h-4 w-4"></i></button>
      </div>
    `;

    item.querySelector('[data-action="edit-income"]').addEventListener('click', async () => {
      const val = await showCenteredDialog({
        title: 'Edit Income Amount',
        badge: 'Income Stream',
        description: `Update the received salary or deposit amount for "${inc.label}":`,
        defaultValue: inc.amount
      });
      if (val !== null && !isNaN(parseFloat(val))) {
        inc.amount = parseFloat(val);
        saveState();
        renderApp();
      }
    });

    item.querySelector('[data-action="delete-income"]').addEventListener('click', async () => {
      const ok = await showCenteredDialog({
        title: 'Delete Income Stream',
        badge: 'Delete Item',
        description: `Are you sure you want to remove "${inc.label}"?`,
        isConfirm: true
      });
      if (ok) {
        monthData.incomes = monthData.incomes.filter((i) => i.id !== inc.id);
        saveState();
        renderApp();
      }
    });

    list.appendChild(item);
  });
}

function renderBills(monthData) {
  const list = document.getElementById('bill-list');
  list.innerHTML = '';

  if (monthData.bills.length === 0) {
    list.innerHTML = '<p class="text-sm text-slate-400 font-medium py-3">No recurring dues or bills recorded.</p>';
    return;
  }

  monthData.bills.forEach((bill) => {
    const acc = appState.accounts.find((a) => a.id === bill.accountId);
    const isCreditCardPayment = bill.direction === 'credit' || (acc && (acc.type === 'credit' || acc.type === 'loan'));
    
    const item = document.createElement('div');
    item.className = `flex items-center justify-between rounded-xl border p-3.5 transition ${
      bill.paid ? 'border-slate-200 bg-white opacity-85' : 'border-amber-200 bg-amber-50/50'
    }`;

    const arrearsBadge = bill.arrearsFrom
      ? `<span class="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800 border border-amber-300">
           <i data-lucide="alert-circle" class="h-3 w-3"></i> Past Due (${bill.arrearsFrom})
         </span>`
      : '';

    const typeBadge = isCreditCardPayment
      ? `<span class="rounded-md bg-blue-100 px-2 py-0.5 text-[9px] font-bold uppercase text-blue-700 border border-blue-200">Payment to Card</span>`
      : `<span class="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600">Debit Out</span>`;

    item.innerHTML = `
      <div class="flex items-center gap-3">
        <button data-action="toggle-bill" data-id="${bill.id}" class="flex h-7 w-7 items-center justify-center rounded-lg border ${
      bill.paid ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-300 bg-white text-transparent hover:border-emerald-400'
    } transition">
          <i data-lucide="check" class="h-4 w-4"></i>
        </button>
        <div>
          <div class="flex items-center gap-2">
            <h4 class="font-bold text-slate-900 ${bill.paid ? 'line-through text-slate-500' : ''}">${bill.label}</h4>
            ${typeBadge}
            ${arrearsBadge}
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Due day ${bill.due} • ${isCreditCardPayment ? 'Crediting' : 'via'} <span class="font-bold text-slate-700">${acc ? acc.name : 'Default Card'}</span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-right">
          <span class="block font-black text-slate-900 text-base ${bill.paid ? 'text-slate-500' : ''}">${formatPHP(bill.amount)}</span>
          <span class="text-[10px] font-black uppercase tracking-widest ${bill.paid ? 'text-emerald-600' : 'text-amber-600'}">
            ${bill.paid ? (isCreditCardPayment ? 'PAID & APPLIED' : 'PAID & DEBITED') : 'UNPAID'}
          </span>
        </div>
        <button data-action="edit-bill" data-id="${bill.id}" class="text-slate-400 hover:text-slate-700 transition"><i data-lucide="edit-3" class="h-4 w-4"></i></button>
        <button data-action="delete-bill" data-id="${bill.id}" class="text-slate-400 hover:text-rose-600 transition"><i data-lucide="trash-2" class="h-4 w-4"></i></button>
      </div>
    `;

    item.querySelector('[data-action="toggle-bill"]').addEventListener('click', () => {
      bill.paid = !bill.paid;
      saveState();
      renderApp();
    });

    item.querySelector('[data-action="edit-bill"]').addEventListener('click', async () => {
      const val = await showCenteredDialog({
        title: 'Edit Bill Amount',
        badge: 'Recurring Bill',
        description: `Update the amount due for "${bill.label}":`,
        defaultValue: bill.amount
      });
      if (val !== null && !isNaN(parseFloat(val))) {
        bill.amount = parseFloat(val);
        saveState();
        renderApp();
      }
    });

    item.querySelector('[data-action="delete-bill"]').addEventListener('click', async () => {
      const ok = await showCenteredDialog({
        title: 'Delete Bill',
        badge: 'Delete Item',
        description: `Delete "${bill.label}"? If paid, amounts will automatically adjust.`,
        isConfirm: true
      });
      if (ok) {
        monthData.bills = monthData.bills.filter((b) => b.id !== bill.id);
        saveState();
        renderApp();
      }
    });

    list.appendChild(item);
  });
}

function renderExpenses(monthData) {
  const tbody = document.getElementById('expense-table-body');
  const empty = document.getElementById('expense-empty');
  tbody.innerHTML = '';

  if (monthData.expenses.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  monthData.expenses.forEach((exp) => {
    const acc = appState.accounts.find((a) => a.id === exp.accountId);
    const row = document.createElement('tr');
    row.className = 'hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0';
    row.innerHTML = `
      <td class="px-4 py-3 font-semibold text-slate-800 text-xs">
        <span class="inline-block rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">${exp.category}</span>
      </td>
      <td class="px-4 py-3 font-bold text-slate-900 text-sm">${exp.label}</td>
      <td class="px-4 py-3 text-xs font-semibold text-slate-600">
        <span class="flex items-center gap-1.5"><i data-lucide="credit-card" class="h-3.5 w-3.5 text-slate-400"></i> ${acc ? acc.name : 'Direct Cash'}</span>
      </td>
      <td class="px-4 py-3 font-black text-right text-slate-900 text-sm">${formatPHP(exp.amount)}</td>
      <td class="px-4 py-3 text-center">
        <div class="flex items-center justify-center gap-2">
          <button data-action="edit-expense" data-id="${exp.id}" class="text-slate-400 hover:text-slate-700 transition"><i data-lucide="edit-3" class="h-4 w-4"></i></button>
          <button data-action="delete-expense" data-id="${exp.id}" class="text-slate-400 hover:text-rose-600 transition"><i data-lucide="trash-2" class="h-4 w-4"></i></button>
        </div>
      </td>
    `;

    row.querySelector('[data-action="edit-expense"]').addEventListener('click', async () => {
      const val = await showCenteredDialog({
        title: 'Edit Expense Amount',
        badge: 'Itemized Expense',
        description: `Update the expense amount for "${exp.label}":`,
        defaultValue: exp.amount
      });
      if (val !== null && !isNaN(parseFloat(val))) {
        exp.amount = parseFloat(val);
        saveState();
        renderApp();
      }
    });

    row.querySelector('[data-action="delete-expense"]').addEventListener('click', async () => {
      const ok = await showCenteredDialog({
        title: 'Delete Expense',
        badge: 'Delete Item',
        description: `Remove expense "${exp.label}"?`,
        isConfirm: true
      });
      if (ok) {
        monthData.expenses = monthData.expenses.filter((e) => e.id !== exp.id);
        saveState();
        renderApp();
      }
    });

    tbody.appendChild(row);
  });
}

function renderSavings(monthData) {
  const panel = document.getElementById('savings-panel');
  panel.innerHTML = '';

  if (monthData.savings.length === 0) {
    panel.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-200 p-8 text-center">
        <p class="text-sm font-semibold text-slate-400">No savings targets allocated for this month.</p>
      </div>
    `;
    return;
  }

  monthData.savings.forEach((s) => {
    const acc = appState.accounts.find((a) => a.id === s.accountId);
    const progress = Math.min(100, Math.round(((s.amount || 0) / (s.goal || 1)) * 100));
    const card = document.createElement('div');
    card.className = 'rounded-xl border border-slate-100 bg-slate-50/70 p-4';
    card.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div>
          <h4 class="font-bold text-slate-900">${s.label}</h4>
          <p class="text-xs text-slate-500">Fund: ${acc ? acc.name : 'Liquid Vault'}</p>
        </div>
        <div class="text-right">
          <span class="font-black text-indigo-600 text-sm">${formatPHP(s.amount)}</span>
          <span class="text-xs text-slate-400">/ ${formatPHP(s.goal)}</span>
        </div>
      </div>
      <div class="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
        <div class="h-full bg-indigo-600 transition-all duration-300" style="width: ${progress}%"></div>
      </div>
      <div class="mt-2 flex items-center justify-between text-xs text-slate-500 font-bold">
        <span>${progress}% reached</span>
        <button data-action="delete-savings" data-id="${s.id}" class="text-slate-400 hover:text-rose-600"><i data-lucide="trash-2" class="h-3.5 w-3.5"></i></button>
      </div>
    `;

    card.querySelector('[data-action="delete-savings"]').addEventListener('click', async () => {
      const ok = await showCenteredDialog({
        title: 'Delete Savings Goal',
        badge: 'Delete Item',
        description: `Delete savings goal for "${s.label}"?`,
        isConfirm: true
      });
      if (ok) {
        monthData.savings = monthData.savings.filter((item) => item.id !== s.id);
        saveState();
        renderApp();
      }
    });

    panel.appendChild(card);
  });
}

function renderAccounts() {
  const grid = document.getElementById('account-grid');
  const empty = document.getElementById('account-empty');
  grid.innerHTML = '';

  if (appState.accounts.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  let totalLiquid = 0;
  let totalDebtUsed = 0;
  let totalAvailableCredit = 0;

  appState.accounts.forEach((acc) => {
    const isCredit = acc.type === 'credit' || acc.type === 'loan';
    const dynamicBalance = calculateAccountBalance(acc.id);
    const cardColor = acc.color || getAutoBrandColor(acc.name, acc.type);

    const card = document.createElement('div');
    card.className = 'flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm hover:shadow-md transition';

    if (isCredit) {
      const limit = Number(acc.creditLimit || 0);
      const used = dynamicBalance;
      const available = Math.max(0, limit - used);
      const utilPercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

      totalDebtUsed += used;
      totalAvailableCredit += available;

      card.innerHTML = `
        <div>
          <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br ${cardColor} p-5 text-white shadow-lg min-h-[170px] flex flex-col justify-between">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-extrabold uppercase tracking-widest opacity-80 flex items-center gap-1.5">
                <i data-lucide="credit-card" class="h-3.5 w-3.5"></i> ${acc.type.toUpperCase()}
              </span>
              <span class="rounded-full bg-amber-400/25 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200 border border-amber-300/40">
                Due ${acc.dueDay || '15th'}
              </span>
            </div>
            
            <div class="my-2">
              <h4 class="text-xl font-black tracking-tight text-white leading-tight break-words">${acc.name}</h4>
              <p class="text-xs font-semibold text-slate-200 opacity-80">${acc.tag || 'Revolving Line'}</p>
            </div>

            <div>
              <div class="flex justify-between text-[11px] font-bold opacity-85 mb-1">
                <span>Used: ${formatPHP(used)}</span>
                <span>Limit: ${formatPHP(limit)}</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div class="h-full bg-amber-400 rounded-full" style="width: ${utilPercent}%"></div>
              </div>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-white/15 text-xs font-semibold opacity-85">
              <span>•••• ${acc.lastFour || '0000'}</span>
              <span>${utilPercent}% Utilized</span>
            </div>
          </div>

          <div class="mt-4 px-1">
            <div class="flex items-baseline justify-between">
              <div>
                <p class="text-2xl font-black text-rose-600 tracking-tight">${formatPHP(used)}</p>
                <p class="text-xs font-semibold text-slate-500 mt-0.5">Outstanding Balance to Pay</p>
              </div>
              
              <div class="flex items-center gap-1.5">
                <button data-action="edit-full-account" data-id="${acc.id}" title="Edit Card Details" class="p-2 rounded-xl text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition border border-slate-200/60">
                  <i data-lucide="sliders-horizontal" class="h-4 w-4"></i>
                </button>
                <button data-action="delete-account" data-id="${acc.id}" title="Delete Card" class="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition border border-slate-200/60">
                  <i data-lucide="trash-2" class="h-4 w-4"></i>
                </button>
              </div>
            </div>

            <div class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600 flex items-center justify-between">
              <span>Available: <strong class="text-emerald-600">${formatPHP(available)}</strong></span>
              <span class="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Due ${acc.dueDay || '15th'}</span>
            </div>
          </div>
        </div>
      `;
    } else {
      totalLiquid += dynamicBalance;

      card.innerHTML = `
        <div>
          <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br ${cardColor} p-5 text-white shadow-lg min-h-[170px] flex flex-col justify-between">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-extrabold uppercase tracking-widest opacity-80">${acc.type.toUpperCase()}</span>
              <span class="rounded-full bg-white/20 backdrop-blur-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white border border-white/25">
                ${acc.tag || 'Active'}
              </span>
            </div>
            
            <div class="my-3">
              <h4 class="text-xl font-black tracking-tight text-white leading-tight break-words">${acc.name}</h4>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-white/15 text-xs font-semibold opacity-85">
              <span>•••• ${acc.lastFour || '9031'}</span>
              <i data-lucide="shield-check" class="h-4 w-4"></i>
            </div>
          </div>

          <div class="mt-4 px-1">
            <div class="flex items-baseline justify-between">
              <div>
                <p class="text-2xl font-black text-slate-900 tracking-tight">${formatPHP(dynamicBalance)}</p>
                <p class="text-xs font-semibold text-slate-500 mt-0.5">Liquid balance (Calculated)</p>
              </div>

              <div class="flex items-center gap-1.5">
                <button data-action="edit-full-account" data-id="${acc.id}" title="Edit Account Details" class="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition border border-slate-200/60">
                  <i data-lucide="sliders-horizontal" class="h-4 w-4"></i>
                </button>
                <button data-action="adjust-baseline" data-id="${acc.id}" title="Adjust Baseline Amount" class="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition border border-slate-200/60">
                  <i data-lucide="edit-3" class="h-4 w-4"></i>
                </button>
                <button data-action="delete-account" data-id="${acc.id}" title="Delete account" class="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition border border-slate-200/60">
                  <i data-lucide="trash-2" class="h-4 w-4"></i>
                </button>
              </div>
            </div>

            <div class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>Starting baseline: <strong class="text-slate-700">${formatPHP(acc.baselineBalance)}</strong></span>
              <span class="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Live Synced</span>
            </div>
          </div>
        </div>
      `;

      card.querySelector('[data-action="adjust-baseline"]').addEventListener('click', async () => {
        const val = await showCenteredDialog({
          title: 'Adjust Baseline Balance',
          badge: acc.name,
          description: `Set manual baseline adjustment for "${acc.name}":`,
          defaultValue: acc.baselineBalance
        });
        if (val !== null && !isNaN(parseFloat(val))) {
          acc.baselineBalance = parseFloat(val);
          saveState();
          renderApp();
        }
      });
    }

    card.querySelector('[data-action="edit-full-account"]').addEventListener('click', () => {
      openAccountModal(acc.id);
    });

    card.querySelector('[data-action="delete-account"]').addEventListener('click', async () => {
      const ok = await showCenteredDialog({
        title: 'Delete Account / Card',
        badge: 'Delete Item',
        description: `Remove "${acc.name}" from your portfolio? Linked transaction history will remain safe.`,
        isConfirm: true
      });
      if (ok) {
        appState.accounts = appState.accounts.filter((a) => a.id !== acc.id);
        saveState();
        renderApp();
      }
    });

    grid.appendChild(card);
  });

  document.getElementById('cash-total').textContent = formatPHP(totalLiquid);
  document.getElementById('debt-total').textContent = formatPHP(totalDebtUsed);
  document.getElementById('available-total').textContent = formatPHP(totalAvailableCredit);
  document.getElementById('wallet-total').textContent = formatPHP(totalLiquid - totalDebtUsed);
}

function renderMonthlyChart(monthData) {
  const ctx = document.getElementById('monthlyChart').getContext('2d');
  const totalIncome = monthData.incomes.reduce((acc, i) => acc + Number(i.amount || 0), 0);
  const totalExpenses = monthData.expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const totalBills = monthData.bills
    .filter((b) => b.paid && b.direction !== 'credit')
    .reduce((acc, b) => acc + Number(b.amount || 0), 0);

  if (monthlyChartInstance) {
    monthlyChartInstance.destroy();
  }

  monthlyChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Income Surplus', 'Itemized Expenses', 'Paid Bills'],
      datasets: [
        {
          data: [Math.max(0, totalIncome - totalExpenses - totalBills), totalExpenses, totalBills],
          backgroundColor: ['#059669', '#e11d48', '#d97706'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Inter', weight: 'bold' } } }
      },
      cutout: '72%'
    }
  });
}

function renderAnnualLedger() {
  const tbody = document.getElementById('annual-table-body');
  tbody.innerHTML = '';

  let annualInc = 0;
  let annualOut = 0;

  const chartMonths = [];
  const chartIncome = [];
  const chartOutgoings = [];

  MONTH_NAMES.forEach((name, idx) => {
    const key = `${appState.selectedYear}-${idx}`;
    const mData = appState.months[key] || { incomes: [], expenses: [], bills: [] };

    const inc = mData.incomes.reduce((a, b) => a + Number(b.amount || 0), 0);
    const exp = mData.expenses.reduce((a, b) => a + Number(b.amount || 0), 0);
    const bills = mData.bills.filter((b) => b.paid && b.direction !== 'credit').reduce((a, b) => a + Number(b.amount || 0), 0);
    const net = inc - exp - bills;

    annualInc += inc;
    annualOut += exp + bills;

    chartMonths.push(name.substring(0, 3));
    chartIncome.push(inc);
    chartOutgoings.push(exp + bills);

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0';
    tr.innerHTML = `
      <td class="px-4 py-3 font-bold text-slate-800 text-xs">${name}</td>
      <td class="px-4 py-3 font-bold text-right text-emerald-600 text-xs">${formatPHP(inc)}</td>
      <td class="px-4 py-3 font-bold text-right text-rose-600 text-xs">${formatPHP(exp)}</td>
      <td class="px-4 py-3 font-bold text-right text-amber-600 text-xs">${formatPHP(bills)}</td>
      <td class="px-4 py-3 font-black text-right text-xs ${net >= 0 ? 'text-indigo-600' : 'text-rose-600'}">${formatPHP(net)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('annual-income').textContent = formatPHP(annualInc);
  document.getElementById('annual-outgoings').textContent = formatPHP(annualOut);
  document.getElementById('annual-net').textContent = formatPHP(annualInc - annualOut);

  const actx = document.getElementById('annualChart').getContext('2d');
  if (annualChartInstance) {
    annualChartInstance.destroy();
  }

  annualChartInstance = new Chart(actx, {
    type: 'bar',
    data: {
      labels: chartMonths,
      datasets: [
        { label: 'Income', data: chartIncome, backgroundColor: '#10b981', borderRadius: 6 },
        { label: 'Outgoings', data: chartOutgoings, backgroundColor: '#f43f5e', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Inter', weight: 'bold' } } }
      }
    }
  });
}

function showAuthAlert(msg, type = 'error') {
  const alertEl = document.getElementById('auth-alert');
  alertEl.textContent = msg;
  alertEl.className = `mb-4 rounded-xl p-3 text-xs font-bold ${
    type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  }`;
  alertEl.classList.remove('hidden');
}

function clearAuthAlert() {
  const alertEl = document.getElementById('auth-alert');
  alertEl.classList.add('hidden');
  alertEl.textContent = '';
}

function setupAuthViews() {
  const authGate = document.getElementById('auth-gate');
  const signinForm = document.getElementById('signin-form');
  const signupForm = document.getElementById('signup-form');
  const forgotForm = document.getElementById('forgot-form');
  const authTitle = document.getElementById('auth-title');

  document.getElementById('go-signup-btn').addEventListener('click', () => {
    clearAuthAlert();
    if (usersDb.length >= MAX_PROFILES) {
      showAuthAlert(`Profile limit reached (${MAX_PROFILES} maximum users allowed).`);
      return;
    }
    signinForm.classList.add('hidden');
    forgotForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    authTitle.textContent = 'Create Profile';
  });

  document.getElementById('back-to-signin-btn').addEventListener('click', () => {
    clearAuthAlert();
    signupForm.classList.add('hidden');
    forgotForm.classList.add('hidden');
    signinForm.classList.remove('hidden');
    authTitle.textContent = 'Sign In to Disciplined';
  });

  document.getElementById('go-forgot-btn').addEventListener('click', () => {
    clearAuthAlert();
    signinForm.classList.add('hidden');
    signupForm.classList.add('hidden');
    forgotForm.classList.remove('hidden');
    authTitle.textContent = 'Reset Password';
  });

  document.getElementById('cancel-forgot-btn').addEventListener('click', () => {
    clearAuthAlert();
    forgotForm.classList.add('hidden');
    signinForm.classList.remove('hidden');
    authTitle.textContent = 'Sign In to Disciplined';
  });

  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthAlert();
    const identifier = document.getElementById('signin-identifier').value.trim();
    const password = document.getElementById('signin-password').value;

    if (supabaseClient && supabaseClient.auth) {
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: identifier,
          password: password,
        });

        if (!error && data?.user) {
          await loginUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.email.split('@')[0]
          });
          return;
        }
      } catch (err) {
        console.warn('Supabase auth failed, trying local storage:', err);
      }
    }

    const user = usersDb.find(u => 
      (u.username?.toLowerCase() === identifier.toLowerCase() || u.email?.toLowerCase() === identifier.toLowerCase()) && 
      u.password === password
    );

    if (!user) {
      showAuthAlert('Invalid username/email or password.');
      return;
    }

    await loginUser(user);
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthAlert();

    if (usersDb.length >= MAX_PROFILES) {
      showAuthAlert(`Cannot create profile. Maximum ${MAX_PROFILES} user accounts reached.`);
      return;
    }

    const name = document.getElementById('signup-name').value.trim();
    const username = document.getElementById('signup-username').value.trim().toLowerCase();
    const email = document.getElementById('signup-email').value.trim().toLowerCase();
    const password = document.getElementById('signup-password').value;

    if (usersDb.some(u => u.username.toLowerCase() === username)) {
      showAuthAlert('Username already taken.');
      return;
    }

    if (usersDb.some(u => u.email.toLowerCase() === email)) {
      showAuthAlert('Email already registered.');
      return;
    }

    let userId = 'usr-' + Date.now();

    if (supabaseClient && supabaseClient.auth) {
      try {
        const { data, error } = await supabaseClient.auth.signUp({
          email: email,
          password: password,
          options: { data: { full_name: name } }
        });
        if (!error && data?.user) {
          userId = data.user.id;
        }
      } catch (err) {
        console.warn('Supabase signup fallback:', err);
      }
    }

    const newUser = {
      id: userId,
      name,
      username,
      email,
      password
    };

    usersDb.push(newUser);
    saveUsersDatabase();

    await loginUser(newUser);
  });

  forgotForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAuthAlert();

    const identifier = document.getElementById('forgot-identifier').value.trim().toLowerCase();
    const newPassword = document.getElementById('forgot-new-password').value;

    const user = usersDb.find(u => u.username.toLowerCase() === identifier || u.email.toLowerCase() === identifier);

    if (!user) {
      showAuthAlert('No registered profile matches that username or email.');
      return;
    }

    user.password = newPassword;
    saveUsersDatabase();

    showAuthAlert('Password reset successful! You can now sign in with your new password.', 'success');
    setTimeout(() => {
      forgotForm.classList.add('hidden');
      signinForm.classList.remove('hidden');
      authTitle.textContent = 'Sign In to Disciplined';
      clearAuthAlert();
    }, 1500);
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    if (supabaseClient && supabaseClient.auth) {
      await supabaseClient.auth.signOut();
    }
    localStorage.removeItem(CURRENT_USER_KEY);
    currentUserId = null;
    appState = null;
    checkAuthSession();
  });
}

async function loginUser(user) {
  currentUserId = user.id;
  localStorage.setItem(CURRENT_USER_KEY, currentUserId);
  appState = await loadUserState(currentUserId);

  document.getElementById('auth-gate').classList.add('hidden');
  updateNavUserProfile(user);
  setupHeaderSelectors();
  renderApp();
}

function updateNavUserProfile(user) {
  const nameEl = document.getElementById('active-user-name');
  const avatarEl = document.getElementById('active-avatar');
  if (nameEl) nameEl.textContent = user.name;
  if (avatarEl) {
    const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    avatarEl.textContent = initials || 'U';
  }
}

async function checkAuthSession() {
  const authGate = document.getElementById('auth-gate');
  
  if (supabaseClient && supabaseClient.auth) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session?.user) {
        currentUserId = session.user.id;
        localStorage.setItem(CURRENT_USER_KEY, currentUserId);
      }
    } catch (e) {
      console.warn('Could not fetch Supabase session:', e);
    }
  }

  if (currentUserId) {
    let user = usersDb.find(u => u.id === currentUserId);
    if (!user) {
      user = { id: currentUserId, name: 'User', email: 'account@user.com' };
    }
    
    authGate.classList.add('hidden');
    appState = await loadUserState(currentUserId);
    updateNavUserProfile(user);
    setupHeaderSelectors();
    renderApp();
    return;
  }
  
  authGate.classList.remove('hidden');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => console.log('Disciplined Service Worker registered successfully.'))
      .catch((err) => console.warn('Service Worker registration failed:', err));
  });
}

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

function setupInstallButton() {
  const installBtn = document.getElementById('pwa-install-btn');
  if (!installBtn) return;

  installBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        installBtn.classList.add('hidden');
      }
      deferredPrompt = null;
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS) {
        alert("To install on iOS:\n1. Tap the Share icon (box with upward arrow ↑) in Safari.\n2. Scroll down and tap 'Add to Home Screen'.");
      } else {
        alert("To install on this device:\n1. Click the browser menu (⋮) in the top-right.\n2. Select 'Install Disciplined' or 'Add to Home Screen'.");
      }
    }
  });
}

window.addEventListener('appinstalled', () => {
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.classList.add('hidden');
  deferredPrompt = null;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupInstallButton);
} else {
  setupInstallButton();
}
