/**
 * Disciplined Budget Tracker
 * Application Logic
 *
 * Version: Stable Hybrid Auth / Local Storage Build
 */

/* =========================================================
   SUPABASE CONFIGURATION
   ========================================================= */

const SUPABASE_URL = 'https://vwyiygetdbnibwlfpcjy.supabase.co';

const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3eWl5Z2V0ZGJuaWJ3bGZwY2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMzU2ODMsImV4cCI6MjEwMzkxMTY4M30.1jldKZKmMlkRwqQ6TLsrPaoHDgWEo9mBYdcuL7WLNAQ';

let supabaseClient = null;

/*
 * IMPORTANT:
 * Supabase JS v2 loaded from the CDN exposes:
 *
 * window.supabase
 *
 * We deliberately use the global namespace rather than declaring
 * another variable named "supabase".
 */

function initializeSupabase() {
  if (
    typeof window === 'undefined' ||
    !window.supabase ||
    typeof window.supabase.createClient !== 'function'
  ) {
    console.warn(
      'Supabase library was not detected. Running in local/offline mode.'
    );
    return null;
  }

  if (
    !SUPABASE_URL ||
    SUPABASE_URL.includes('YOUR_') ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY.includes('YOUR_')
  ) {
    console.warn(
      'Supabase credentials are not configured. Running in local/offline mode.'
    );
    return null;
  }

  try {
    return window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  } catch (error) {
    console.error('Supabase initialization failed:', error);
    return null;
  }
}

supabaseClient = initializeSupabase();


/* =========================================================
   STORAGE
   ========================================================= */

const USERS_STORAGE_KEY = 'disciplined_users_db_v1';
const CURRENT_USER_KEY = 'disciplined_active_user_id';
const MAX_PROFILES = 5;


/* =========================================================
   CONSTANTS
   ========================================================= */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
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
  {
    keywords: ['gotyme', 'tyme'],
    color: 'from-teal-700 to-cyan-950'
  },
  {
    keywords: ['gcash'],
    color: 'from-blue-600 to-indigo-700'
  },
  {
    keywords: ['maya', 'paymaya'],
    color: 'from-slate-900 to-emerald-900'
  },
  {
    keywords: ['unionbank', 'union bank', 'ubp'],
    color: 'from-amber-600 to-orange-700'
  },
  {
    keywords: ['bdo', 'bdo unibank'],
    color: 'from-blue-800 to-blue-950'
  },
  {
    keywords: ['bpi'],
    color: 'from-red-700 to-rose-950'
  },
  {
    keywords: ['metrobank', 'metro bank'],
    color: 'from-blue-700 to-blue-900'
  },
  {
    keywords: ['landbank', 'land bank'],
    color: 'from-emerald-700 to-green-950'
  },
  {
    keywords: ['security bank', 'sec bank'],
    color: 'from-emerald-600 to-teal-900'
  },
  {
    keywords: ['seabank', 'sea bank', 'shopee'],
    color: 'from-orange-500 to-red-700'
  },
  {
    keywords: ['cimb'],
    color: 'from-red-600 to-rose-800'
  },
  {
    keywords: ['rcbc'],
    color: 'from-blue-600 to-cyan-800'
  },
  {
    keywords: ['hsbc'],
    color: 'from-red-700 to-slate-900'
  },
  {
    keywords: ['citibank', 'citi'],
    color: 'from-blue-600 to-sky-900'
  },
  {
    keywords: ['eastwest', 'east west'],
    color: 'from-purple-800 to-slate-950'
  }
];


/* =========================================================
   DEFAULT APPLICATION STATE
   ========================================================= */

const DEFAULT_STATE_TEMPLATE = {
  selectedYear: 2026,
  selectedMonth: 0,
  activeTab: 'monthly',
  accounts: [],
  months: {}
};


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let usersDb = loadUsersDatabase();

let currentUserId =
  localStorage.getItem(CURRENT_USER_KEY) || null;

let appState = null;

let activeDialogResolver = null;

let monthlyChartInstance = null;
let annualChartInstance = null;

let headerSelectorsInitialized = false;
let authViewsInitialized = false;
let entryModalInitialized = false;
let accountModalInitialized = false;
let dialogListenersInitialized = false;
let installButtonInitialized = false;


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatPHP(value) {
  const number = safeNumber(value);

  return (
    '₱' +
    number.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateId(prefix = 'item') {
  return (
    prefix +
    '-' +
    Date.now() +
    '-' +
    Math.random().toString(36).slice(2, 8)
  );
}

function getUserStorageKey(userId) {
  return `disciplined_vault_user_${userId}`;
}


/* =========================================================
   USER DATABASE
   ========================================================= */

function loadUsersDatabase() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Unable to load local users database:', error);
    return [];
  }
}

function saveUsersDatabase() {
  try {
    localStorage.setItem(
      USERS_STORAGE_KEY,
      JSON.stringify(usersDb)
    );
  } catch (error) {
    console.error('Unable to save local users database:', error);
  }
}


/* =========================================================
   USER STATE
   ========================================================= */

function loadUserState(userId) {
  if (!userId) {
    return deepClone(DEFAULT_STATE_TEMPLATE);
  }

  try {
    const raw = localStorage.getItem(
      getUserStorageKey(userId)
    );

    if (!raw) {
      return deepClone(DEFAULT_STATE_TEMPLATE);
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return deepClone(DEFAULT_STATE_TEMPLATE);
    }

    parsed.selectedYear =
      Number.isInteger(parsed.selectedYear)
        ? parsed.selectedYear
        : 2026;

    parsed.selectedMonth =
      Number.isInteger(parsed.selectedMonth)
        ? Math.max(0, Math.min(11, parsed.selectedMonth))
        : 0;

    parsed.activeTab =
      parsed.activeTab || 'monthly';

    parsed.accounts =
      Array.isArray(parsed.accounts)
        ? parsed.accounts
        : [];

    parsed.months =
      parsed.months && typeof parsed.months === 'object'
        ? parsed.months
        : {};

    return parsed;
  } catch (error) {
    console.warn('Unable to load user state:', error);
    return deepClone(DEFAULT_STATE_TEMPLATE);
  }
}

function saveState() {
  if (!currentUserId || !appState) {
    return;
  }

  try {
    localStorage.setItem(
      getUserStorageKey(currentUserId),
      JSON.stringify(appState)
    );
  } catch (error) {
    console.error('Unable to save application state:', error);
  }
}


/* =========================================================
   MONTH DATA
   ========================================================= */

function createEmptyMonthData() {
  return {
    incomes: [],
    expenses: [],
    bills: [],
    savings: []
  };
}

function ensureMonthData(year, month) {
  if (!appState) {
    return createEmptyMonthData();
  }

  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);

  const key = `${normalizedYear}-${normalizedMonth}`;

  if (!appState.months[key]) {
    appState.months[key] = createEmptyMonthData();
  }

  const monthData = appState.months[key];

  monthData.incomes =
    Array.isArray(monthData.incomes)
      ? monthData.incomes
      : [];

  monthData.expenses =
    Array.isArray(monthData.expenses)
      ? monthData.expenses
      : [];

  monthData.bills =
    Array.isArray(monthData.bills)
      ? monthData.bills
      : [];

  monthData.savings =
    Array.isArray(monthData.savings)
      ? monthData.savings
      : [];


  /*
   * Carry unpaid bills forward from the previous month.
   */

  let previousMonth = normalizedMonth - 1;
  let previousYear = normalizedYear;

  if (previousMonth < 0) {
    previousMonth = 11;
    previousYear--;
  }

  const previousKey =
    `${previousYear}-${previousMonth}`;

  const previousData =
    appState.months[previousKey];

  if (
    previousData &&
    Array.isArray(previousData.bills)
  ) {
    previousData.bills.forEach((previousBill) => {
      if (previousBill.paid) {
        return;
      }

      const alreadyRolledOver =
        monthData.bills.some((bill) => {
          return (
            bill.originalId === previousBill.id ||
            (
              bill.label === previousBill.label &&
              bill.arrearsFrom ===
                MONTH_NAMES[previousMonth]
            )
          );
        });

      if (alreadyRolledOver) {
        return;
      }

      monthData.bills.unshift({
        id: generateId('rollover'),
        originalId: previousBill.id,
        label: previousBill.label,
        amount: safeNumber(previousBill.amount),
        due: previousBill.due || 'Past Due',
        accountId: previousBill.accountId || '',
        direction: previousBill.direction || 'debit',
        paid: false,
        arrearsFrom: MONTH_NAMES[previousMonth]
      });
    });
  }

  return monthData;
}


/* =========================================================
   ACCOUNT BRANDING
   ========================================================= */

function getAutoBrandColor(
  accountName,
  type = 'bank'
) {
  if (!accountName) {
    return type === 'credit'
      ? 'from-slate-900 to-zinc-950'
      : 'from-slate-800 to-slate-950';
  }

  const query =
    String(accountName)
      .toLowerCase()
      .trim();

  const match =
    BRAND_PRESETS.find((preset) =>
      preset.keywords.some((keyword) =>
        query.includes(keyword)
      )
    );

  if (match) {
    return match.color;
  }

  return type === 'credit'
    ? 'from-slate-900 to-zinc-950'
    : 'from-slate-800 to-slate-950';
}


/* =========================================================
   ACCOUNT BALANCE CALCULATION
   ========================================================= */

function calculateAccountBalance(accountId) {
  if (!appState || !accountId) {
    return 0;
  }

  const account =
    appState.accounts.find(
      (item) => item.id === accountId
    );

  if (!account) {
    return 0;
  }

  const monthData =
    ensureMonthData(
      appState.selectedYear,
      appState.selectedMonth
    );


  /*
   * CREDIT CARD / LOAN
   *
   * Starting debt
   * + expenses charged to card
   * + debit bills charged to card
   * - credit/payment bills
   * - income/credit adjustment
   */

  if (
    account.type === 'credit' ||
    account.type === 'loan'
  ) {
    let debt =
      safeNumber(account.creditUsed);

    monthData.expenses.forEach((expense) => {
      if (expense.accountId === accountId) {
        debt += safeNumber(expense.amount);
      }
    });

    monthData.bills.forEach((bill) => {
      if (
        bill.accountId === accountId &&
        bill.paid
      ) {
        const amount =
          safeNumber(bill.amount);

        if (bill.direction === 'credit') {
          debt -= amount;
        } else {
          debt += amount;
        }
      }
    });

    monthData.incomes.forEach((income) => {
      if (income.accountId === accountId) {
        debt -= safeNumber(income.amount);
      }
    });

    return Math.max(0, debt);
  }


  /*
   * BANK / WALLET
   */

  let balance =
    safeNumber(account.baselineBalance);

  monthData.incomes.forEach((income) => {
    if (income.accountId === accountId) {
      balance += safeNumber(income.amount);
    }
  });

  monthData.bills.forEach((bill) => {
    if (
      bill.accountId === accountId &&
      bill.paid
    ) {
      if (bill.direction !== 'credit') {
        balance -= safeNumber(bill.amount);
      }
    }
  });

  monthData.expenses.forEach((expense) => {
    if (expense.accountId === accountId) {
      balance -= safeNumber(expense.amount);
    }
  });

  return balance;
}


/* =========================================================
   CENTERED DIALOG
   ========================================================= */

function showCenteredDialog({
  title,
  badge = 'Action Required',
  description,
  defaultValue = '',
  inputType = 'number',
  prefix = '₱',
  isConfirm = false
}) {
  return new Promise((resolve) => {
    const modal =
      document.getElementById('dialog-modal');

    const titleEl =
      document.getElementById('dialog-title');

    const badgeEl =
      document.getElementById('dialog-badge');

    const descEl =
      document.getElementById(
        'dialog-description'
      );

    const inputContainer =
      document.getElementById(
        'dialog-input-container'
      );

    const inputEl =
      document.getElementById('dialog-input');

    const prefixEl =
      document.getElementById(
        'dialog-input-prefix'
      );

    const confirmBtn =
      document.getElementById(
        'dialog-confirm-btn'
      );

    if (!modal) {
      resolve(null);
      return;
    }

    activeDialogResolver = resolve;

    if (titleEl) {
      titleEl.textContent = title;
    }

    if (badgeEl) {
      badgeEl.textContent = badge;
    }

    if (descEl) {
      descEl.textContent = description;
    }

    if (isConfirm) {
      if (inputContainer) {
        inputContainer.classList.add('hidden');
      }

      if (confirmBtn) {
        confirmBtn.className =
          'rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-500 shadow-md transition';

        confirmBtn.textContent =
          'Confirm Delete';
      }
    } else {
      if (inputContainer) {
        inputContainer.classList.remove('hidden');
      }

      if (inputEl) {
        inputEl.type = inputType;
        inputEl.value = defaultValue ?? '';
      }

      if (prefixEl) {
        prefixEl.style.display =
          prefix ? 'flex' : 'none';
      }

      if (inputEl) {
        if (prefix) {
          inputEl.classList.add('pl-8');
        } else {
          inputEl.classList.remove('pl-8');
        }
      }

      if (confirmBtn) {
        confirmBtn.className =
          'rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 shadow-md transition';

        confirmBtn.textContent =
          'Save Changes';
      }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (!isConfirm && inputEl) {
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 50);
    }
  });
}

function closeCenteredDialog(result = null) {
  const modal =
    document.getElementById('dialog-modal');

  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  if (activeDialogResolver) {
    const resolver =
      activeDialogResolver;

    activeDialogResolver = null;

    resolver(result);
  }
}


/* =========================================================
   DOM READY
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {
    initializeApplication();
  },
  { once: true }
);

function initializeApplication() {
  setupAuthViews();
  setupTabNavigation();
  setupEntryModal();
  setupAccountModal();
  setupDialogListeners();
  setupInstallButton();
  checkAuthSession();
}


/* =========================================================
   HEADER SELECTORS
   ========================================================= */

function setupHeaderSelectors() {
  const yearSelect =
    document.getElementById('year-select');

  const monthSelect =
    document.getElementById('month-select');

  if (!yearSelect || !monthSelect) {
    console.warn(
      'Year/month selectors were not found.'
    );
    return;
  }

  if (!headerSelectorsInitialized) {
    yearSelect.addEventListener(
      'change',
      (event) => {
        if (!appState) {
          return;
        }

        appState.selectedYear =
          Number(event.target.value);

        saveState();
        renderApp();
      }
    );

    monthSelect.addEventListener(
      'change',
      (event) => {
        if (!appState) {
          return;
        }

        appState.selectedMonth =
          Number(event.target.value);

        saveState();
        renderApp();
      }
    );

    headerSelectorsInitialized = true;
  }

  const START_YEAR = 2026;

  const currentActualYear =
    new Date().getFullYear();

  const selectedYear =
    appState?.selectedYear || START_YEAR;

  const endYear =
    Math.max(
      currentActualYear + 30,
      selectedYear + 10,
      START_YEAR + 50
    );

  const availableYears = [];

  for (
    let year = START_YEAR;
    year <= endYear;
    year++
  ) {
    availableYears.push(year);
  }

  if (
    appState &&
    (
      !appState.selectedYear ||
      appState.selectedYear < START_YEAR
    )
  ) {
    appState.selectedYear =
      START_YEAR;
  }

  const activeYear =
    appState?.selectedYear ||
    START_YEAR;

  const activeMonth =
    Number.isInteger(
      appState?.selectedMonth
    )
      ? appState.selectedMonth
      : 0;

  yearSelect.innerHTML =
    availableYears
      .map(
        (year) =>
          `<option value="${year}" ${
            year === activeYear
              ? 'selected'
              : ''
          }>Year ${year}</option>`
      )
      .join('');

  monthSelect.innerHTML =
    MONTH_NAMES
      .map(
        (month, index) =>
          `<option value="${index}" ${
            index === activeMonth
              ? 'selected'
              : ''
          }>${month}</option>`
      )
      .join('');
}


/* =========================================================
   TAB NAVIGATION
   ========================================================= */

function setupTabNavigation() {
  const tabButtons =
    document.querySelectorAll('[data-tab]');

  if (!tabButtons.length) {
    return;
  }

  tabButtons.forEach((button) => {
    button.addEventListener(
      'click',
      () => {
        if (!appState) {
          return;
        }

        appState.activeTab =
          button.getAttribute('data-tab');

        tabButtons.forEach((item) => {
          item.className =
            'tab-button inactive rounded-lg px-4 py-2 text-xs font-bold transition';
        });

        button.className =
          'tab-button active rounded-lg px-4 py-2 text-xs font-bold transition';

        const monthlyView =
          document.getElementById(
            'monthly-view'
          );

        const annualView =
          document.getElementById(
            'annual-view'
          );

        const accountsView =
          document.getElementById(
            'accounts-view'
          );

        if (monthlyView) {
          monthlyView.classList.toggle(
            'hidden',
            appState.activeTab !==
              'monthly'
          );
        }

        if (annualView) {
          annualView.classList.toggle(
            'hidden',
            appState.activeTab !==
              'annual'
          );
        }

        if (accountsView) {
          accountsView.classList.toggle(
            'hidden',
            appState.activeTab !==
              'accounts'
          );
        }

        saveState();
        renderApp();
      }
    );
  });
}


/* =========================================================
   ACCOUNT SELECT
   ========================================================= */

function populateAccountSelectOptions() {
  const select =
    document.getElementById(
      'entry-account'
    );

  if (!select || !appState) {
    return;
  }

  select.innerHTML = '';

  if (!appState.accounts.length) {
    const option =
      document.createElement('option');

    option.value = '';
    option.textContent =
      'No accounts available';

    select.appendChild(option);

    return;
  }

  appState.accounts.forEach((account) => {
    const option =
      document.createElement('option');

    option.value = account.id;

    const typeLabel =
      account.type === 'credit'
        ? 'Credit Card'
        : account.tag ||
          account.type ||
          'Account';

    option.textContent =
      `${account.name} (${typeLabel})`;

    select.appendChild(option);
  });
}


/* =========================================================
   ENTRY MODAL
   ========================================================= */

function setupEntryModal() {
  if (entryModalInitialized) {
    return;
  }

  const modal =
    document.getElementById(
      'entry-modal'
    );

  const form =
    document.getElementById(
      'entry-form'
    );

  const addEntryBtn =
    document.getElementById(
      'add-entry-btn'
    );

  const closeBtn =
    document.getElementById(
      'close-entry-modal'
    );

  const cancelBtn =
    document.getElementById(
      'cancel-entry-btn'
    );

  const typeSelect =
    document.getElementById(
      'entry-type'
    );

  const categorySelect =
    document.getElementById(
      'entry-category'
    );

  const directionSelect =
    document.getElementById(
      'entry-direction'
    );

  if (
    !modal ||
    !form ||
    !typeSelect ||
    !categorySelect
  ) {
    console.warn(
      'Entry modal elements are missing.'
    );
    return;
  }

  const incomeButton =
    document.getElementById(
      'add-income-btn'
    );

  const expenseButton =
    document.getElementById(
      'add-expense-btn'
    );

  const billButton =
    document.getElementById(
      'add-bill-btn'
    );

  const savingsButton =
    document.getElementById(
      'add-savings-btn'
    );

  categorySelect.innerHTML =
    CATEGORIES
      .map(
        (category) =>
          `<option value="${escapeHTML(
            category
          )}">${escapeHTML(
            category
          )}</option>`
      )
      .join('');

  if (incomeButton) {
    incomeButton.addEventListener(
      'click',
      () => openEntryModalFor('income')
    );
  }

  if (expenseButton) {
    expenseButton.addEventListener(
      'click',
      () => openEntryModalFor('expense')
    );
  }

  if (billButton) {
    billButton.addEventListener(
      'click',
      () => openEntryModalFor('bill')
    );
  }

  if (savingsButton) {
    savingsButton.addEventListener(
      'click',
      () => openEntryModalFor('savings')
    );
  }

  if (addEntryBtn) {
    addEntryBtn.addEventListener(
      'click',
      () => openEntryModalFor('income')
    );
  }

  function openEntryModalFor(type) {
    if (!appState) {
      return;
    }

    populateAccountSelectOptions();

    form.reset();

    const entryId =
      document.getElementById(
        'entry-id'
      );

    if (entryId) {
      entryId.value = '';
    }

    typeSelect.value = type;

    updateModalFields(type);

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const labelInput =
      document.getElementById(
        'entry-label'
      );

    if (labelInput) {
      setTimeout(
        () => labelInput.focus(),
        50
      );
    }
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  if (closeBtn) {
    closeBtn.addEventListener(
      'click',
      closeModal
    );
  }

  if (cancelBtn) {
    cancelBtn.addEventListener(
      'click',
      closeModal
    );
  }

  typeSelect.addEventListener(
    'change',
    (event) => {
      updateModalFields(
        event.target.value
      );
    }
  );

  function updateModalFields(type) {
    const expenseGroup =
      document.getElementById(
        'entry-category-group'
      );

    const dueGroup =
      document.getElementById(
        'entry-due-group'
      );

    const directionGroup =
      document.getElementById(
        'entry-direction-group'
      );

    const goalGroup =
      document.getElementById(
        'entry-goal-group'
      );

    if (expenseGroup) {
      expenseGroup.classList.toggle(
        'hidden',
        type !== 'expense'
      );
    }

    if (dueGroup) {
      dueGroup.classList.toggle(
        'hidden',
        type !== 'bill'
      );
    }

    if (directionGroup) {
      directionGroup.classList.toggle(
        'hidden',
        type !== 'bill'
      );
    }

    if (goalGroup) {
      goalGroup.classList.toggle(
        'hidden',
        type !== 'savings'
      );
    }

    const accountLabel =
      document.getElementById(
        'entry-account-label'
      );

    if (accountLabel) {
      if (type === 'income') {
        accountLabel.textContent =
          'Deposit Into Account';
      } else if (type === 'expense') {
        accountLabel.textContent =
          'Deduct From Card / Account';
      } else if (type === 'bill') {
        accountLabel.textContent =
          'Associated Account / Card';
      } else {
        accountLabel.textContent =
          'Linked Account';
      }
    }
  }

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();

      if (!appState) {
        return;
      }

      const type =
        typeSelect.value;

      const labelInput =
        document.getElementById(
          'entry-label'
        );

      const amountInput =
        document.getElementById(
          'entry-amount'
        );

      const accountInput =
        document.getElementById(
          'entry-account'
        );

      const label =
        labelInput?.value.trim() || '';

      const amount =
        parseFloat(
          amountInput?.value || '0'
        ) || 0;

      const accountId =
        accountInput?.value || '';

      if (!label) {
        alert(
          'Please enter a description.'
        );
        return;
      }

      if (amount <= 0) {
        alert(
          'Please enter an amount greater than ₱0.'
        );
        return;
      }

      const monthData =
        ensureMonthData(
          appState.selectedYear,
          appState.selectedMonth
        );

      const newId =
        generateId('entry');

      if (type === 'income') {
        monthData.incomes.push({
          id: newId,
          label,
          amount,
          accountId
        });
      }

      else if (type === 'expense') {
        monthData.expenses.push({
          id: newId,
          label,
          amount,
          category:
            categorySelect.value,
          accountId
        });
      }

      else if (type === 'bill') {
        const due =
          document
            .getElementById(
              'entry-due'
            )
            ?.value.trim() ||
          'End of Month';

        const direction =
          directionSelect?.value ||
          'debit';

        monthData.bills.push({
          id: newId,
          label,
          amount,
          due,
          accountId,
          direction,
          paid: false,
          arrearsFrom: null
        });
      }

      else if (type === 'savings') {
        const goal =
          parseFloat(
            document
              .getElementById(
                'entry-goal'
              )
              ?.value || '0'
          ) || amount;

        monthData.savings.push({
          id: newId,
          label,
          amount,
          goal,
          accountId
        });
      }

      saveState();

      closeModal();

      renderApp();
    }
  );

  entryModalInitialized = true;
}


/* =========================================================
   ACCOUNT MODAL
   ========================================================= */

function openAccountModal(
  editAccountId = null
) {
  if (!appState) {
    return;
  }

  const modal =
    document.getElementById(
      'account-modal'
    );

  const form =
    document.getElementById(
      'account-form'
    );

  const titleEl =
    document.getElementById(
      'account-modal-title'
    );

  const badgeEl =
    document.getElementById(
      'account-modal-badge'
    );

  const saveBtn =
    document.getElementById(
      'save-account-btn'
    );

  const typeSelect =
    document.getElementById(
      'account-type'
    );

  const liquidGroup =
    document.getElementById(
      'liquid-account-fields'
    );

  const creditGroup =
    document.getElementById(
      'credit-card-fields'
    );

  if (
    !modal ||
    !form ||
    !typeSelect
  ) {
    return;
  }

  form.reset();

  const accountIdInput =
    document.getElementById(
      'account-id'
    );

  function toggleAccountTypeFields() {
    const isCredit =
      typeSelect.value === 'credit' ||
      typeSelect.value === 'loan';

    if (creditGroup) {
      creditGroup.classList.toggle(
        'hidden',
        !isCredit
      );
    }

    if (liquidGroup) {
      liquidGroup.classList.toggle(
        'hidden',
        isCredit
      );
    }
  }

  typeSelect.onchange =
    toggleAccountTypeFields;

  if (editAccountId) {
    const existing =
      appState.accounts.find(
        (account) =>
          account.id === editAccountId
      );

    if (existing) {
      if (accountIdInput) {
        accountIdInput.value =
          existing.id;
      }

      const nameInput =
        document.getElementById(
          'account-name'
        );

      if (nameInput) {
        nameInput.value =
          existing.name || '';
      }

      typeSelect.value =
        existing.type || 'bank';

      const lastFourInput =
        document.getElementById(
          'account-last-four'
        );

      if (lastFourInput) {
        lastFourInput.value =
          existing.lastFour || '';
      }

      if (
        existing.type === 'credit' ||
        existing.type === 'loan'
      ) {
        const limitInput =
          document.getElementById(
            'account-limit'
          );

        const usedInput =
          document.getElementById(
            'account-used'
          );

        const dueDayInput =
          document.getElementById(
            'account-due-day'
          );

        if (limitInput) {
          limitInput.value =
            existing.creditLimit ?? '';
        }

        if (usedInput) {
          usedInput.value =
            existing.creditUsed ?? '';
        }

        if (dueDayInput) {
          dueDayInput.value =
            existing.dueDay || '';
        }
      } else {
        const balanceInput =
          document.getElementById(
            'account-balance'
          );

        const tagInput =
          document.getElementById(
            'account-tag'
          );

        if (balanceInput) {
          balanceInput.value =
            existing.baselineBalance ?? '';
        }

        if (tagInput) {
          tagInput.value =
            existing.tag || '';
        }
      }

      if (titleEl) {
        titleEl.textContent =
          'Edit Card / Account';
      }

      if (badgeEl) {
        badgeEl.textContent =
          'Update Details';
      }

      if (saveBtn) {
        saveBtn.textContent =
          'Update Changes';
      }
    }
  } else {
    if (accountIdInput) {
      accountIdInput.value = '';
    }

    if (titleEl) {
      titleEl.textContent =
        'Add Account / Card';
    }

    if (badgeEl) {
      badgeEl.textContent =
        'Account Setup';
    }

    if (saveBtn) {
      saveBtn.textContent =
        'Save Account';
    }
  }

  toggleAccountTypeFields();

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const nameInput =
    document.getElementById(
      'account-name'
    );

  if (nameInput) {
    setTimeout(
      () => nameInput.focus(),
      50
    );
  }
}

function setupAccountModal() {
  if (accountModalInitialized) {
    return;
  }

  const modal =
    document.getElementById(
      'account-modal'
    );

  const form =
    document.getElementById(
      'account-form'
    );

  const openBtn =
    document.getElementById(
      'add-account-btn'
    );

  const closeBtn =
    document.getElementById(
      'close-account-modal'
    );

  const cancelBtn =
    document.getElementById(
      'cancel-account-btn'
    );

  const typeSelect =
    document.getElementById(
      'account-type'
    );

  if (
    !modal ||
    !form ||
    !openBtn ||
    !typeSelect
  ) {
    console.warn(
      'Account modal elements are missing.'
    );
    return;
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  openBtn.addEventListener(
    'click',
    () => openAccountModal(null)
  );

  if (closeBtn) {
    closeBtn.addEventListener(
      'click',
      closeModal
    );
  }

  if (cancelBtn) {
    cancelBtn.addEventListener(
      'click',
      closeModal
    );
  }

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();

      if (!appState) {
        return;
      }

      const existingId =
        document.getElementById(
          'account-id'
        )?.value || '';

      const id =
        existingId ||
        generateId('acc');

      const name =
        document
          .getElementById(
            'account-name'
          )
          ?.value.trim() || '';

      const type =
        typeSelect.value;

      const lastFour =
        document
          .getElementById(
            'account-last-four'
          )
          ?.value.trim() || '0000';

      if (!name) {
        alert(
          'Please enter an account name.'
        );
        return;
      }

      const color =
        getAutoBrandColor(
          name,
          type
        );

      const newAccount = {
        id,
        name,
        type,
        color,
        lastFour
      };

      if (
        type === 'credit' ||
        type === 'loan'
      ) {
        newAccount.creditLimit =
          parseFloat(
            document.getElementById(
              'account-limit'
            )?.value || '0'
          ) || 0;

        newAccount.creditUsed =
          parseFloat(
            document.getElementById(
              'account-used'
            )?.value || '0'
          ) || 0;

        newAccount.dueDay =
          document
            .getElementById(
              'account-due-day'
            )
            ?.value.trim() ||
          '15th';

        newAccount.tag =
          type === 'credit'
            ? 'Credit Card'
            : 'Financing';
      } else {
        newAccount.baselineBalance =
          parseFloat(
            document.getElementById(
              'account-balance'
            )?.value || '0'
          ) || 0;

        newAccount.tag =
          document
            .getElementById(
              'account-tag'
            )
            ?.value.trim() ||
          (
            type === 'bank'
              ? 'Savings'
              : 'Digital'
          );
      }

      const existingIndex =
        appState.accounts.findIndex(
          (account) =>
            account.id === id
        );

      if (existingIndex >= 0) {
        appState.accounts[
          existingIndex
        ] = newAccount;
      } else {
        appState.accounts.push(
          newAccount
        );
      }

      saveState();

      closeModal();

      renderApp();
    }
  );

  accountModalInitialized = true;
}


/* =========================================================
   DIALOG LISTENERS
   ========================================================= */

function setupDialogListeners() {
  if (dialogListenersInitialized) {
    return;
  }

  const modal =
    document.getElementById(
      'dialog-modal'
    );

  const form =
    document.getElementById(
      'dialog-form'
    );

  const cancelBtn =
    document.getElementById(
      'dialog-cancel-btn'
    );

  const closeBtn =
    document.getElementById(
      'close-dialog-modal'
    );

  if (!modal || !form) {
    console.warn(
      'Dialog elements are missing.'
    );
    return;
  }

  if (cancelBtn) {
    cancelBtn.addEventListener(
      'click',
      () => closeCenteredDialog(null)
    );
  }

  if (closeBtn) {
    closeBtn.addEventListener(
      'click',
      () => closeCenteredDialog(null)
    );
  }

  modal.addEventListener(
    'click',
    (event) => {
      if (event.target === modal) {
        closeCenteredDialog(null);
      }
    }
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Escape' &&
        !modal.classList.contains('hidden')
      ) {
        closeCenteredDialog(null);
      }
    }
  );

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();

      const input =
        document.getElementById(
          'dialog-input'
        );

      const value =
        input?.value ?? '';

      closeCenteredDialog(
        value !== ''
          ? value
          : true
      );
    }
  );

  dialogListenersInitialized = true;
}


/* =========================================================
   MAIN RENDER
   ========================================================= */

function renderApp() {
  if (!appState) {
    return;
  }

  try {
    const monthData =
      ensureMonthData(
        appState.selectedYear,
        appState.selectedMonth
      );

    renderKPIs(monthData);
    renderExpenses(monthData);
    renderSavings(monthData);
    renderIncomes(monthData);
    renderBills(monthData);
    renderAccounts();
    renderOverviewPanels();
    renderMonthlyChart(monthData);
    renderAnnualLedger();

    updateTabVisibility();

    if (
      window.lucide &&
      typeof window.lucide.createIcons ===
        'function'
    ) {
      window.lucide.createIcons();
    }
  } catch (error) {
    console.error(
      'Application rendering error:',
      error
    );
  }
}

function updateTabVisibility() {
  if (!appState) {
    return;
  }

  const monthlyView =
    document.getElementById(
      'monthly-view'
    );

  const annualView =
    document.getElementById(
      'annual-view'
    );

  const accountsView =
    document.getElementById(
      'accounts-view'
    );

  if (monthlyView) {
    monthlyView.classList.toggle(
      'hidden',
      appState.activeTab !== 'monthly'
    );
  }

  if (annualView) {
    annualView.classList.toggle(
      'hidden',
      appState.activeTab !== 'annual'
    );
  }

  if (accountsView) {
    accountsView.classList.toggle(
      'hidden',
      appState.activeTab !== 'accounts'
    );
  }

  document
    .querySelectorAll('[data-tab]')
    .forEach((button) => {
      const active =
        button.getAttribute(
          'data-tab'
        ) === appState.activeTab;

      button.className =
        active
          ? 'tab-button active rounded-lg px-4 py-2 text-xs font-bold transition'
          : 'tab-button inactive rounded-lg px-4 py-2 text-xs font-bold transition';
    });
}


/* =========================================================
   OVERVIEW PANELS
   ========================================================= */

function renderOverviewPanels() {
  const liquidContainer =
    document.getElementById(
      'overview-liquid-list'
    );

  const creditContainer =
    document.getElementById(
      'overview-credit-list'
    );

  if (
    !liquidContainer ||
    !creditContainer
  ) {
    return;
  }

  liquidContainer.innerHTML = '';
  creditContainer.innerHTML = '';

  let totalLiquid = 0;
  let totalDebt = 0;

  const liquidAccounts =
    appState.accounts.filter(
      (account) =>
        account.type === 'bank' ||
        account.type === 'wallet'
    );

  const creditAccounts =
    appState.accounts.filter(
      (account) =>
        account.type === 'credit' ||
        account.type === 'loan'
    );

  if (!liquidAccounts.length) {
    liquidContainer.innerHTML =
      '<p class="text-xs text-slate-400 py-2">No bank accounts registered.</p>';
  } else {
    liquidAccounts.forEach(
      (account) => {
        const balance =
          calculateAccountBalance(
            account.id
          );

        totalLiquid += balance;

        const item =
          document.createElement('div');

        item.className =
          'flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 hover:bg-slate-100/70 transition';

        item.innerHTML = `
          <div class="flex items-center gap-2.5">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-black text-xs">
              <i data-lucide="${
                account.type === 'wallet'
                  ? 'smartphone'
                  : 'building'
              }" class="h-4 w-4"></i>
            </div>

            <div>
              <h4 class="text-xs font-bold text-slate-900">
                ${escapeHTML(account.name)}
              </h4>

              <p class="text-[10px] text-slate-500 font-semibold">
                ${escapeHTML(
                  account.tag ||
                    'Savings'
                )}
                •••• ${
                  escapeHTML(
                    account.lastFour ||
                      '0000'
                  )
                }
              </p>
            </div>
          </div>

          <div class="text-right">
            <p class="text-xs font-black text-slate-900">
              ${formatPHP(balance)}
            </p>

            <span class="text-[9px] font-bold uppercase tracking-wider text-emerald-700">
              Remaining
            </span>
          </div>
        `;

        liquidContainer.appendChild(item);
      }
    );
  }

  if (!creditAccounts.length) {
    creditContainer.innerHTML =
      '<p class="text-xs text-slate-400 py-2">No credit cards or financing active.</p>';
  } else {
    creditAccounts.forEach(
      (account) => {
        const debt =
          calculateAccountBalance(
            account.id
          );

        const limit =
          safeNumber(
            account.creditLimit
          );

        const available =
          Math.max(
            0,
            limit - debt
          );

        totalDebt += debt;

        const item =
          document.createElement('div');

        item.className =
          'rounded-xl border border-amber-100 bg-amber-50/40 p-3 hover:bg-amber-50/70 transition';

        item.innerHTML = `
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2">
              <span class="flex h-2 w-2 rounded-full bg-rose-500"></span>

              <h4 class="text-xs font-bold text-slate-900">
                ${escapeHTML(account.name)}
              </h4>
            </div>

            <span class="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md">
              Due ${
                escapeHTML(
                  account.dueDay ||
                    '15th'
                )
              }
            </span>
          </div>

          <div class="flex items-baseline justify-between mt-1">
            <div>
              <p class="text-sm font-black text-rose-600">
                ${formatPHP(debt)}
              </p>

              <p class="text-[10px] font-semibold text-slate-500">
                Balance to pay this cycle
              </p>
            </div>

            <div class="text-right">
              <p class="text-xs font-bold text-slate-700">
                ${formatPHP(available)}
              </p>

              <p class="text-[10px] font-semibold text-slate-400">
                Available credit
              </p>
            </div>
          </div>
        `;

        creditContainer.appendChild(item);
      }
    );
  }

  const totalLiquidEl =
    document.getElementById(
      'overview-total-liquid'
    );

  const totalDebtEl =
    document.getElementById(
      'overview-total-debt'
    );

  if (totalLiquidEl) {
    totalLiquidEl.textContent =
      formatPHP(totalLiquid);
  }

  if (totalDebtEl) {
    totalDebtEl.textContent =
      formatPHP(totalDebt);
  }
}


/* =========================================================
   KPI RENDERING
   ========================================================= */

function renderKPIs(monthData) {
  const totalIncome =
    monthData.incomes.reduce(
      (total, item) =>
        total + safeNumber(item.amount),
      0
    );

  const totalExpenses =
    monthData.expenses.reduce(
      (total, item) =>
        total + safeNumber(item.amount),
      0
    );

  const totalPaidBills =
    monthData.bills
      .filter(
        (bill) =>
          bill.paid &&
          bill.direction !== 'credit'
      )
      .reduce(
        (total, bill) =>
          total + safeNumber(bill.amount),
        0
      );

  const totalBillsDue =
    monthData.bills.reduce(
      (total, bill) =>
        total + safeNumber(bill.amount),
      0
    );

  const netSurplus =
    totalIncome -
    totalExpenses -
    totalPaidBills;

  const incomeTotal =
    document.getElementById(
      'income-total'
    );

  const incomeSubtext =
    document.getElementById(
      'income-subtext'
    );

  const expenseTotal =
    document.getElementById(
      'expense-total'
    );

  const expenseSubtext =
    document.getElementById(
      'expense-subtext'
    );

  const billTotal =
    document.getElementById(
      'bill-total'
    );

  const billSubtext =
    document.getElementById(
      'bill-subtext'
    );

  const netTotal =
    document.getElementById(
      'net-total'
    );

  const netSubtext =
    document.getElementById(
      'net-subtext'
    );

  if (incomeTotal) {
    incomeTotal.textContent =
      formatPHP(totalIncome);
  }

  if (incomeSubtext) {
    incomeSubtext.textContent =
      `${monthData.incomes.length} verified income stream(s)`;
  }

  if (expenseTotal) {
    expenseTotal.textContent =
      formatPHP(totalExpenses);
  }

  if (expenseSubtext) {
    expenseSubtext.textContent =
      `${monthData.expenses.length} itemized transaction(s)`;
  }

  if (billTotal) {
    billTotal.textContent =
      formatPHP(totalBillsDue);
  }

  const unpaidCount =
    monthData.bills.filter(
      (bill) => !bill.paid
    ).length;

  if (billSubtext) {
    billSubtext.textContent =
      unpaidCount > 0
        ? `${unpaidCount} unpaid / pending balance`
        : 'All bills settled for this month!';
  }

  if (netTotal) {
    netTotal.textContent =
      formatPHP(netSurplus);
  }

  const margin =
    totalIncome > 0
      ? (
          (netSurplus / totalIncome) *
          100
        ).toFixed(1)
      : '0.0';

  if (netSubtext) {
    netSubtext.textContent =
      `${margin}% net cash margin`;
  }
}


/* =========================================================
   INCOME RENDERING
   ========================================================= */

function renderIncomes(monthData) {
  const list =
    document.getElementById(
      'income-list'
    );

  if (!list) {
    return;
  }

  list.innerHTML = '';

  if (!monthData.incomes.length) {
    list.innerHTML =
      '<p class="text-sm text-slate-400 font-medium py-3">No income streams credited this month.</p>';

    return;
  }

  monthData.incomes.forEach(
    (income) => {
      const account =
        appState.accounts.find(
          (item) =>
            item.id === income.accountId
        );

      const item =
        document.createElement('div');

      item.className =
        'flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 hover:bg-slate-50 transition';

      item.innerHTML = `
        <div>
          <h4 class="font-bold text-slate-900">
            ${escapeHTML(income.label)}
          </h4>

          <p class="text-xs font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
            <i data-lucide="arrow-down-left" class="h-3.5 w-3.5"></i>
            Credited to ${
              escapeHTML(
                account
                  ? account.name
                  : 'Unlinked Account'
              )
            }
          </p>
        </div>

        <div class="flex items-center gap-3">
          <span class="font-black text-emerald-600 text-base">
            ${formatPHP(income.amount)}
          </span>

          <button
            data-action="edit-income"
            class="text-slate-400 hover:text-slate-700 transition"
          >
            <i data-lucide="edit-3" class="h-4 w-4"></i>
          </button>

          <button
            data-action="delete-income"
            class="text-slate-400 hover:text-rose-600 transition"
          >
            <i data-lucide="trash-2" class="h-4 w-4"></i>
          </button>
        </div>
      `;

      const editButton =
        item.querySelector(
          '[data-action="edit-income"]'
        );

      const deleteButton =
        item.querySelector(
          '[data-action="delete-income"]'
        );

      if (editButton) {
        editButton.addEventListener(
          'click',
          async () => {
            const value =
              await showCenteredDialog({
                title:
                  'Edit Income Amount',
                badge:
                  'Income Stream',
                description:
                  `Update the received salary or deposit amount for "${income.label}":`,
                defaultValue:
                  income.amount
              });

            if (
              value !== null &&
              !isNaN(
                parseFloat(value)
              )
            ) {
              income.amount =
                parseFloat(value);

              saveState();
              renderApp();
            }
          }
        );
      }

      if (deleteButton) {
        deleteButton.addEventListener(
          'click',
          async () => {
            const confirmed =
              await showCenteredDialog({
                title:
                  'Delete Income Stream',
                badge:
                  'Delete Item',
                description:
                  `Are you sure you want to remove "${income.label}"?`,
                isConfirm: true
              });

            if (confirmed) {
              monthData.incomes =
                monthData.incomes.filter(
                  (item) =>
                    item.id !== income.id
                );

              saveState();
              renderApp();
            }
          }
        );
      }

      list.appendChild(item);
    }
  );
}


/* =========================================================
   BILL RENDERING
   ========================================================= */

function renderBills(monthData) {
  const list =
    document.getElementById(
      'bill-list'
    );

  if (!list) {
    return;
  }

  list.innerHTML = '';

  if (!monthData.bills.length) {
    list.innerHTML =
      '<p class="text-sm text-slate-400 font-medium py-3">No recurring dues or bills recorded.</p>';

    return;
  }

  monthData.bills.forEach(
    (bill) => {
      const account =
        appState.accounts.find(
          (item) =>
            item.id === bill.accountId
        );

      const isCreditCardPayment =
        bill.direction === 'credit' ||
        (
          account &&
          (
            account.type === 'credit' ||
            account.type === 'loan'
          )
        );

      const item =
        document.createElement('div');

      item.className =
        `flex items-center justify-between rounded-xl border p-3.5 transition ${
          bill.paid
            ? 'border-slate-200 bg-white opacity-85'
            : 'border-amber-200 bg-amber-50/50'
        }`;

      const arrearsBadge =
        bill.arrearsFrom
          ? `
            <span class="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800 border border-amber-300">
              <i data-lucide="alert-circle" class="h-3 w-3"></i>
              Past Due (${escapeHTML(
                bill.arrearsFrom
              )})
            </span>
          `
          : '';

      const typeBadge =
        isCreditCardPayment
          ? `
            <span class="rounded-md bg-blue-100 px-2 py-0.5 text-[9px] font-bold uppercase text-blue-700 border border-blue-200">
              Payment to Card
            </span>
          `
          : `
            <span class="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600">
              Debit Out
            </span>
          `;

      item.innerHTML = `
        <div class="flex items-center gap-3">

          <button
            data-action="toggle-bill"
            class="flex h-7 w-7 items-center justify-center rounded-lg border ${
              bill.paid
                ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                : 'border-slate-300 bg-white text-transparent hover:border-emerald-400'
            } transition"
          >
            <i data-lucide="check" class="h-4 w-4"></i>
          </button>

          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="font-bold text-slate-900 ${
                bill.paid
                  ? 'line-through text-slate-500'
                  : ''
              }">
                ${escapeHTML(bill.label)}
              </h4>

              ${typeBadge}
              ${arrearsBadge}
            </div>

            <p class="text-xs text-slate-500 mt-0.5">
              Due day ${escapeHTML(
                bill.due || 'End of Month'
              )}
              •
              ${
                isCreditCardPayment
                  ? 'Crediting'
                  : 'via'
              }

              <span class="font-bold text-slate-700">
                ${
                  escapeHTML(
                    account
                      ? account.name
                      : 'Default Card'
                  )
                }
              </span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3">

          <div class="text-right">
            <span class="block font-black text-slate-900 text-base ${
              bill.paid
                ? 'text-slate-500'
                : ''
            }">
              ${formatPHP(bill.amount)}
            </span>

            <span class="text-[10px] font-black uppercase tracking-widest ${
              bill.paid
                ? 'text-emerald-600'
                : 'text-amber-600'
            }">
              ${
                bill.paid
                  ? isCreditCardPayment
                    ? 'PAID & APPLIED'
                    : 'PAID & DEBITED'
                  : 'UNPAID'
              }
            </span>
          </div>

          <button
            data-action="edit-bill"
            class="text-slate-400 hover:text-slate-700 transition"
          >
            <i data-lucide="edit-3" class="h-4 w-4"></i>
          </button>

          <button
            data-action="delete-bill"
            class="text-slate-400 hover:text-rose-600 transition"
          >
            <i data-lucide="trash-2" class="h-4 w-4"></i>
          </button>

        </div>
      `;

      const toggleButton =
        item.querySelector(
          '[data-action="toggle-bill"]'
        );

      const editButton =
        item.querySelector(
          '[data-action="edit-bill"]'
        );

      const deleteButton =
        item.querySelector(
          '[data-action="delete-bill"]'
        );

      if (toggleButton) {
        toggleButton.addEventListener(
          'click',
          () => {
            bill.paid =
              !bill.paid;

            saveState();
            renderApp();
          }
        );
      }

      if (editButton) {
        editButton.addEventListener(
          'click',
          async () => {
            const value =
              await showCenteredDialog({
                title:
                  'Edit Bill Amount',
                badge:
                  'Recurring Bill',
                description:
                  `Update the amount due for "${bill.label}":`,
                defaultValue:
                  bill.amount
              });

            if (
              value !== null &&
              !isNaN(
                parseFloat(value)
              )
            ) {
              bill.amount =
                parseFloat(value);

              saveState();
              renderApp();
            }
          }
        );
      }

      if (deleteButton) {
        deleteButton.addEventListener(
          'click',
          async () => {
            const confirmed =
              await showCenteredDialog({
                title:
                  'Delete Bill',
                badge:
                  'Delete Item',
                description:
                  `Delete "${bill.label}"? If paid, amounts will automatically adjust.`,
                isConfirm: true
              });

            if (confirmed) {
              monthData.bills =
                monthData.bills.filter(
                  (item) =>
                    item.id !== bill.id
                );

              saveState();
              renderApp();
            }
          }
        );
      }

      list.appendChild(item);
    }
  );
}


/* =========================================================
   EXPENSE RENDERING
   ========================================================= */

function renderExpenses(monthData) {
  const tbody =
    document.getElementById(
      'expense-table-body'
    );

  const empty =
    document.getElementById(
      'expense-empty'
    );

  if (!tbody) {
    return;
  }

  tbody.innerHTML = '';

  if (!monthData.expenses.length) {
    if (empty) {
      empty.classList.remove(
        'hidden'
      );
    }

    return;
  }

  if (empty) {
    empty.classList.add(
      'hidden'
    );
  }

  monthData.expenses.forEach(
    (expense) => {
      const account =
        appState.accounts.find(
          (item) =>
            item.id ===
            expense.accountId
        );

      const row =
        document.createElement('tr');

      row.className =
        'hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0';

      row.innerHTML = `
        <td class="px-4 py-3 font-semibold text-slate-800 text-xs">
          <span class="inline-block rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
            ${escapeHTML(
              expense.category ||
                'Others'
            )}
          </span>
        </td>

        <td class="px-4 py-3 font-bold text-slate-900 text-sm">
          ${escapeHTML(
            expense.label
          )}
        </td>

        <td class="px-4 py-3 text-xs font-semibold text-slate-600">
          <span class="flex items-center gap-1.5">
            <i data-lucide="credit-card" class="h-3.5 w-3.5 text-slate-400"></i>
            ${
              escapeHTML(
                account
                  ? account.name
                  : 'Direct Cash'
              )
            }
          </span>
        </td>

        <td class="px-4 py-3 font-black text-right text-slate-900 text-sm">
          ${formatPHP(
            expense.amount
          )}
        </td>

        <td class="px-4 py-3 text-center">
          <div class="flex items-center justify-center gap-2">

            <button
              data-action="edit-expense"
              class="text-slate-400 hover:text-slate-700 transition"
            >
              <i data-lucide="edit-3" class="h-4 w-4"></i>
            </button>

            <button
              data-action="delete-expense"
              class="text-slate-400 hover:text-rose-600 transition"
            >
              <i data-lucide="trash-2" class="h-4 w-4"></i>
            </button>

          </div>
        </td>
      `;

      const editButton =
        row.querySelector(
          '[data-action="edit-expense"]'
        );

      const deleteButton =
        row.querySelector(
          '[data-action="delete-expense"]'
        );

      if (editButton) {
        editButton.addEventListener(
          'click',
          async () => {
            const value =
              await showCenteredDialog({
                title:
                  'Edit Expense Amount',
                badge:
                  'Itemized Expense',
                description:
                  `Update the expense amount for "${expense.label}":`,
                defaultValue:
                  expense.amount
              });

            if (
              value !== null &&
              !isNaN(
                parseFloat(value)
              )
            ) {
              expense.amount =
                parseFloat(value);

              saveState();
              renderApp();
            }
          }
        );
      }

      if (deleteButton) {
        deleteButton.addEventListener(
          'click',
          async () => {
            const confirmed =
              await showCenteredDialog({
                title:
                  'Delete Expense',
                badge:
                  'Delete Item',
                description:
                  `Remove expense "${expense.label}"?`,
                isConfirm: true
              });

            if (confirmed) {
              monthData.expenses =
                monthData.expenses.filter(
                  (item) =>
                    item.id !==
                    expense.id
                );

              saveState();
              renderApp();
            }
          }
        );
      }

      tbody.appendChild(row);
    }
  );
}


/* =========================================================
   SAVINGS
   ========================================================= */

function renderSavings(monthData) {
  const panel =
    document.getElementById(
      'savings-panel'
    );

  if (!panel) {
    return;
  }

  panel.innerHTML = '';

  if (!monthData.savings.length) {
    panel.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-200 p-8 text-center">
        <p class="text-sm font-semibold text-slate-400">
          No savings targets allocated for this month.
        </p>
      </div>
    `;

    return;
  }

  monthData.savings.forEach(
    (saving) => {
      const account =
        appState.accounts.find(
          (item) =>
            item.id ===
            saving.accountId
        );

      const amount =
        safeNumber(saving.amount);

      const goal =
        safeNumber(saving.goal) ||
        1;

      const progress =
        Math.min(
          100,
          Math.round(
            (amount / goal) * 100
          )
        );

      const card =
        document.createElement('div');

      card.className =
        'rounded-xl border border-slate-100 bg-slate-50/70 p-4';

      card.innerHTML = `
        <div class="flex items-center justify-between mb-2">

          <div>
            <h4 class="font-bold text-slate-900">
              ${escapeHTML(
                saving.label
              )}
            </h4>

            <p class="text-xs text-slate-500">
              Fund:
              ${
                escapeHTML(
                  account
                    ? account.name
                    : 'Liquid Vault'
                )
              }
            </p>
          </div>

          <div class="text-right">
            <span class="font-black text-indigo-600 text-sm">
              ${formatPHP(amount)}
            </span>

            <span class="text-xs text-slate-400">
              /
              ${formatPHP(goal)}
            </span>
          </div>

        </div>

        <div class="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            class="h-full bg-indigo-600 transition-all duration-300"
            style="width:${progress}%"
          ></div>
        </div>

        <div class="mt-2 flex items-center justify-between text-xs text-slate-500 font-bold">

          <span>
            ${progress}% reached
          </span>

          <button
            data-action="delete-savings"
            class="text-slate-400 hover:text-rose-600"
          >
            <i data-lucide="trash-2" class="h-3.5 w-3.5"></i>
          </button>

        </div>
      `;

      const deleteButton =
        card.querySelector(
          '[data-action="delete-savings"]'
        );

      if (deleteButton) {
        deleteButton.addEventListener(
          'click',
          async () => {
            const confirmed =
              await showCenteredDialog({
                title:
                  'Delete Savings Goal',
                badge:
                  'Delete Item',
                description:
                  `Delete savings goal for "${saving.label}"?`,
                isConfirm: true
              });

            if (confirmed) {
              monthData.savings =
                monthData.savings.filter(
                  (item) =>
                    item.id !==
                    saving.id
                );

              saveState();
              renderApp();
            }
          }
        );
      }

      panel.appendChild(card);
    }
  );
}


/* =========================================================
   ACCOUNTS
   ========================================================= */

function renderAccounts() {
  const grid =
    document.getElementById(
      'account-grid'
    );

  const empty =
    document.getElementById(
      'account-empty'
    );

  if (!grid) {
    return;
  }

  grid.innerHTML = '';

  if (!appState.accounts.length) {
    if (empty) {
      empty.classList.remove(
        'hidden'
      );
    }

    return;
  }

  if (empty) {
    empty.classList.add(
      'hidden'
    );
  }

  let totalLiquid = 0;
  let totalDebtUsed = 0;
  let totalAvailableCredit = 0;

  appState.accounts.forEach(
    (account) => {
      const isCredit =
        account.type === 'credit' ||
        account.type === 'loan';

      const dynamicBalance =
        calculateAccountBalance(
          account.id
        );

      const cardColor =
        account.color ||
        getAutoBrandColor(
          account.name,
          account.type
        );

      const card =
        document.createElement('div');

      card.className =
        'flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm hover:shadow-md transition';

      if (isCredit) {
        const limit =
          safeNumber(
            account.creditLimit
          );

        const used =
          dynamicBalance;

        const available =
          Math.max(
            0,
            limit - used
          );

        const utilization =
          limit > 0
            ? Math.min(
                100,
                Math.round(
                  (used / limit) *
                    100
                )
              )
            : 0;

        totalDebtUsed += used;
        totalAvailableCredit +=
          available;

        card.innerHTML = `
          <div>

            <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br ${cardColor} p-5 text-white shadow-lg min-h-[170px] flex flex-col justify-between">

              <div class="flex items-center justify-between">

                <span class="text-[11px] font-extrabold uppercase tracking-widest opacity-80 flex items-center gap-1.5">
                  <i data-lucide="credit-card" class="h-3.5 w-3.5"></i>
                  ${escapeHTML(
                    account.type.toUpperCase()
                  )}
                </span>

                <span class="rounded-full bg-amber-400/25 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200 border border-amber-300/40">
                  Due ${
                    escapeHTML(
                      account.dueDay ||
                        '15th'
                    )
                  }
                </span>

              </div>

              <div class="my-2">

                <h4 class="text-xl font-black tracking-tight text-white leading-tight break-words">
                  ${escapeHTML(
                    account.name
                  )}
                </h4>

                <p class="text-xs font-semibold text-slate-200 opacity-80">
                  ${escapeHTML(
                    account.tag ||
                      'Revolving Line'
                  )}
                </p>

              </div>

              <div>

                <div class="flex justify-between text-[11px] font-bold opacity-85 mb-1">
                  <span>
                    Used:
                    ${formatPHP(used)}
                  </span>

                  <span>
                    Limit:
                    ${formatPHP(limit)}
                  </span>
                </div>

                <div class="w-full h-1.5 rounded-full bg-white/20 overflow-hidden">

                  <div
                    class="h-full bg-amber-400 rounded-full"
                    style="width:${utilization}%"
                  ></div>

                </div>

              </div>

              <div class="flex items-center justify-between pt-2 border-t border-white/15 text-xs font-semibold opacity-85">

                <span>
                  •••• ${
                    escapeHTML(
                      account.lastFour ||
                        '0000'
                    )
                  }
                </span>

                <span>
                  ${utilization}%
                  Utilized
                </span>

              </div>

            </div>

            <div class="mt-4 px-1">

              <div class="flex items-baseline justify-between">

                <div>

                  <p class="text-2xl font-black text-rose-600 tracking-tight">
                    ${formatPHP(used)}
                  </p>

                  <p class="text-xs font-semibold text-slate-500 mt-0.5">
                    Outstanding Balance to Pay
                  </p>

                </div>

                <div class="flex items-center gap-1.5">

                  <button
                    data-action="edit-full-account"
                    title="Edit Card Details"
                    class="p-2 rounded-xl text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition border border-slate-200/60"
                  >
                    <i data-lucide="sliders-horizontal" class="h-4 w-4"></i>
                  </button>

                  <button
                    data-action="delete-account"
                    title="Delete Card"
                    class="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition border border-slate-200/60"
                  >
                    <i data-lucide="trash-2" class="h-4 w-4"></i>
                  </button>

                </div>

              </div>

              <div class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600 flex items-center justify-between">

                <span>
                  Available:
                  <strong class="text-emerald-600">
                    ${formatPHP(
                      available
                    )}
                  </strong>
                </span>

                <span class="text-[10px] text-amber-700 font-bold uppercase tracking-wider">
                  Due ${
                    escapeHTML(
                      account.dueDay ||
                        '15th'
                    )
                  }
                </span>

              </div>

            </div>

          </div>
        `;
      } else {
        totalLiquid +=
          dynamicBalance;

        card.innerHTML = `
          <div>

            <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br ${cardColor} p-5 text-white shadow-lg min-h-[170px] flex flex-col justify-between">

              <div class="flex items-center justify-between">

                <span class="text-[11px] font-extrabold uppercase tracking-widest opacity-80">
                  ${escapeHTML(
                    (
                      account.type ||
                      'account'
                    ).toUpperCase()
                  )}
                </span>

                <span class="rounded-full bg-white/20 backdrop-blur-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white border border-white/25">
                  ${escapeHTML(
                    account.tag ||
                      'Active'
                  )}
                </span>

              </div>

              <div class="my-3">

                <h4 class="text-xl font-black tracking-tight text-white leading-tight break-words">
                  ${escapeHTML(
                    account.name
                  )}
                </h4>

              </div>

              <div class="flex items-center justify-between pt-2 border-t border-white/15 text-xs font-semibold opacity-85">

                <span>
                  •••• ${
                    escapeHTML(
                      account.lastFour ||
                        '0000'
                    )
                  }
                </span>

                <i data-lucide="shield-check" class="h-4 w-4"></i>

              </div>

            </div>

            <div class="mt-4 px-1">

              <div class="flex items-baseline justify-between">

                <div>

                  <p class="text-2xl font-black text-slate-900 tracking-tight">
                    ${formatPHP(
                      dynamicBalance
                    )}
                  </p>

                  <p class="text-xs font-semibold text-slate-500 mt-0.5">
                    Liquid balance (Calculated)
                  </p>

                </div>

                <div class="flex items-center gap-1.5">

                  <button
                    data-action="edit-full-account"
                    title="Edit Account Details"
                    class="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition border border-slate-200/60"
                  >
                    <i data-lucide="sliders-horizontal" class="h-4 w-4"></i>
                  </button>

                  <button
                    data-action="adjust-baseline"
                    title="Adjust Baseline Amount"
                    class="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition border border-slate-200/60"
                  >
                    <i data-lucide="edit-3" class="h-4 w-4"></i>
                  </button>

                  <button
                    data-action="delete-account"
                    title="Delete account"
                    class="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition border border-slate-200/60"
                  >
                    <i data-lucide="trash-2" class="h-4 w-4"></i>
                  </button>

                </div>

              </div>

              <div class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500 flex items-center justify-between">

                <span>
                  Starting baseline:
                  <strong class="text-slate-700">
                    ${formatPHP(
                      account.baselineBalance
                    )}
                  </strong>
                </span>

                <span class="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                  Live Synced
                </span>

              </div>

            </div>

          </div>
        `;
      }

      const editButton =
        card.querySelector(
          '[data-action="edit-full-account"]'
        );

      const adjustButton =
        card.querySelector(
          '[data-action="adjust-baseline"]'
        );

      const deleteButton =
        card.querySelector(
          '[data-action="delete-account"]'
        );

      if (editButton) {
        editButton.addEventListener(
          'click',
          () =>
            openAccountModal(
              account.id
            )
        );
      }

      if (adjustButton) {
        adjustButton.addEventListener(
          'click',
          async () => {
            const value =
              await showCenteredDialog({
                title:
                  'Adjust Baseline Balance',
                badge:
                  account.name,
                description:
                  `Set manual baseline adjustment for "${account.name}":`,
                defaultValue:
                  account.baselineBalance
              });

            if (
              value !== null &&
              !isNaN(
                parseFloat(value)
              )
            ) {
              account.baselineBalance =
                parseFloat(value);

              saveState();
              renderApp();
            }
          }
        );
      }

      if (deleteButton) {
        deleteButton.addEventListener(
          'click',
          async () => {
            const confirmed =
              await showCenteredDialog({
                title:
                  'Delete Account / Card',
                badge:
                  'Delete Item',
                description:
                  `Remove "${account.name}" from your portfolio? Linked transaction history will remain safe.`,
                isConfirm: true
              });

            if (confirmed) {
              appState.accounts =
                appState.accounts.filter(
                  (item) =>
                    item.id !==
                    account.id
                );

              saveState();
              renderApp();
            }
          }
        );
      }

      grid.appendChild(card);
    }
  );

  const cashTotal =
    document.getElementById(
      'cash-total'
    );

  const debtTotal =
    document.getElementById(
      'debt-total'
    );

  const availableTotal =
    document.getElementById(
      'available-total'
    );

  const walletTotal =
    document.getElementById(
      'wallet-total'
    );

  if (cashTotal) {
    cashTotal.textContent =
      formatPHP(totalLiquid);
  }

  if (debtTotal) {
    debtTotal.textContent =
      formatPHP(totalDebtUsed);
  }

  if (availableTotal) {
    availableTotal.textContent =
      formatPHP(
        totalAvailableCredit
      );
  }

  if (walletTotal) {
    walletTotal.textContent =
      formatPHP(
        totalLiquid -
          totalDebtUsed
      );
  }
}


/* =========================================================
   MONTHLY CHART
   ========================================================= */

function renderMonthlyChart(monthData) {
  const canvas =
    document.getElementById(
      'monthlyChart'
    );

  if (!canvas) {
    return;
  }

  if (
    typeof window.Chart !==
    'function'
  ) {
    console.warn(
      'Chart.js is not loaded. Monthly chart skipped.'
    );
    return;
  }

  const ctx =
    canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  const totalIncome =
    monthData.incomes.reduce(
      (total, item) =>
        total + safeNumber(item.amount),
      0
    );

  const totalExpenses =
    monthData.expenses.reduce(
      (total, item) =>
        total + safeNumber(item.amount),
      0
    );

  const totalBills =
    monthData.bills
      .filter(
        (bill) =>
          bill.paid &&
          bill.direction !== 'credit'
      )
      .reduce(
        (total, bill) =>
          total + safeNumber(bill.amount),
        0
      );

  if (monthlyChartInstance) {
    try {
      monthlyChartInstance.destroy();
    } catch (error) {
      console.warn(
        'Unable to destroy monthly chart:',
        error
      );
    }

    monthlyChartInstance = null;
  }

  monthlyChartInstance =
    new window.Chart(ctx, {
      type: 'doughnut',

      data: {
        labels: [
          'Income Surplus',
          'Itemized Expenses',
          'Paid Bills'
        ],

        datasets: [
          {
            data: [
              Math.max(
                0,
                totalIncome -
                  totalExpenses -
                  totalBills
              ),
              totalExpenses,
              totalBills
            ],

            backgroundColor: [
              '#059669',
              '#e11d48',
              '#d97706'
            ],

            borderWidth: 2,
            borderColor: '#ffffff'
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            position: 'bottom',

            labels: {
              boxWidth: 12,

              font: {
                family: 'Inter',
                weight: 'bold'
              }
            }
          }
        },

        cutout: '72%'
      }
    });
}


/* =========================================================
   ANNUAL LEDGER
   ========================================================= */

function renderAnnualLedger() {
  const tbody =
    document.getElementById(
      'annual-table-body'
    );

  if (!tbody) {
    return;
  }

  tbody.innerHTML = '';

  let annualIncome = 0;
  let annualOutgoings = 0;

  const chartMonths = [];
  const chartIncome = [];
  const chartOutgoings = [];

  MONTH_NAMES.forEach(
    (monthName, index) => {
      const key =
        `${appState.selectedYear}-${index}`;

      const monthData =
        appState.months[key] ||
        createEmptyMonthData();

      const income =
        monthData.incomes.reduce(
          (total, item) =>
            total +
            safeNumber(item.amount),
          0
        );

      const expenses =
        monthData.expenses.reduce(
          (total, item) =>
            total +
            safeNumber(item.amount),
          0
        );

      const bills =
        monthData.bills
          .filter(
            (bill) =>
              bill.paid &&
              bill.direction !==
                'credit'
          )
          .reduce(
            (total, bill) =>
              total +
              safeNumber(
                bill.amount
              ),
            0
          );

      const net =
        income -
        expenses -
        bills;

      annualIncome += income;

      annualOutgoings +=
        expenses + bills;

      chartMonths.push(
        monthName.substring(0, 3)
      );

      chartIncome.push(
        income
      );

      chartOutgoings.push(
        expenses + bills
      );

      const row =
        document.createElement('tr');

      row.className =
        'hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0';

      row.innerHTML = `
        <td class="px-4 py-3 font-bold text-slate-800 text-xs">
          ${escapeHTML(
            monthName
          )}
        </td>

        <td class="px-4 py-3 font-bold text-right text-emerald-600 text-xs">
          ${formatPHP(
            income
          )}
        </td>

        <td class="px-4 py-3 font-bold text-right text-rose-600 text-xs">
          ${formatPHP(
            expenses
          )}
        </td>

        <td class="px-4 py-3 font-bold text-right text-amber-600 text-xs">
          ${formatPHP(
            bills
          )}
        </td>

        <td class="px-4 py-3 font-black text-right text-xs ${
          net >= 0
            ? 'text-indigo-600'
            : 'text-rose-600'
        }">
          ${formatPHP(
            net
          )}
        </td>
      `;

      tbody.appendChild(row);
    }
  );

  const annualIncomeEl =
    document.getElementById(
      'annual-income'
    );

  const annualOutgoingsEl =
    document.getElementById(
      'annual-outgoings'
    );

  const annualNetEl =
    document.getElementById(
      'annual-net'
    );

  if (annualIncomeEl) {
    annualIncomeEl.textContent =
      formatPHP(
        annualIncome
      );
  }

  if (annualOutgoingsEl) {
    annualOutgoingsEl.textContent =
      formatPHP(
        annualOutgoings
      );
  }

  if (annualNetEl) {
    annualNetEl.textContent =
      formatPHP(
        annualIncome -
          annualOutgoings
      );
  }

  const canvas =
    document.getElementById(
      'annualChart'
    );

  if (
    !canvas ||
    typeof window.Chart !==
      'function'
  ) {
    return;
  }

  const ctx =
    canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  if (annualChartInstance) {
    try {
      annualChartInstance.destroy();
    } catch (error) {
      console.warn(
        'Unable to destroy annual chart:',
        error
      );
    }

    annualChartInstance = null;
  }

  annualChartInstance =
    new window.Chart(ctx, {
      type: 'bar',

      data: {
        labels: chartMonths,

        datasets: [
          {
            label: 'Income',
            data: chartIncome,
            backgroundColor:
              '#10b981',
            borderRadius: 6
          },

          {
            label: 'Outgoings',
            data:
              chartOutgoings,
            backgroundColor:
              '#f43f5e',
            borderRadius: 6
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            position: 'bottom',

            labels: {
              boxWidth: 12,

              font: {
                family: 'Inter',
                weight: 'bold'
              }
            }
          }
        }
      }
    });
}


/* =========================================================
   AUTH UI
   ========================================================= */

function showAuthAlert(
  message,
  type = 'error'
) {
  const alertEl =
    document.getElementById(
      'auth-alert'
    );

  if (!alertEl) {
    return;
  }

  alertEl.textContent =
    message;

  alertEl.className =
    `mb-4 rounded-xl p-3 text-xs font-bold ${
      type === 'error'
        ? 'bg-rose-50 text-rose-700 border border-rose-200'
        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    }`;

  alertEl.classList.remove(
    'hidden'
  );
}

function clearAuthAlert() {
  const alertEl =
    document.getElementById(
      'auth-alert'
    );

  if (!alertEl) {
    return;
  }

  alertEl.classList.add(
    'hidden'
  );

  alertEl.textContent = '';
}


/* =========================================================
   AUTH VIEWS
   ========================================================= */

function setupAuthViews() {
  if (authViewsInitialized) {
    return;
  }

  const authGate =
    document.getElementById(
      'auth-gate'
    );

  const signinForm =
    document.getElementById(
      'signin-form'
    );

  const signupForm =
    document.getElementById(
      'signup-form'
    );

  const forgotForm =
    document.getElementById(
      'forgot-form'
    );

  const authTitle =
    document.getElementById(
      'auth-title'
    );

  if (
    !authGate ||
    !signinForm ||
    !signupForm ||
    !forgotForm
  ) {
    console.warn(
      'Authentication elements are missing.'
    );
    return;
  }


  /* -------------------------------------------------------
     SIGN UP VIEW
     ------------------------------------------------------- */

  const goSignupBtn =
    document.getElementById(
      'go-signup-btn'
    );

  if (goSignupBtn) {
    goSignupBtn.addEventListener(
      'click',
      () => {
        clearAuthAlert();

        if (
          usersDb.length >=
          MAX_PROFILES
        ) {
          showAuthAlert(
            `Profile limit reached (${MAX_PROFILES} maximum users allowed).`
          );

          return;
        }

        signinForm.classList.add(
          'hidden'
        );

        forgotForm.classList.add(
          'hidden'
        );

        signupForm.classList.remove(
          'hidden'
        );

        if (authTitle) {
          authTitle.textContent =
            'Create Profile';
        }
      }
    );
  }


  /* -------------------------------------------------------
     BACK TO SIGN IN
     ------------------------------------------------------- */

  const backToSigninBtn =
    document.getElementById(
      'back-to-signin-btn'
    );

  if (backToSigninBtn) {
    backToSigninBtn.addEventListener(
      'click',
      () => {
        clearAuthAlert();

        signupForm.classList.add(
          'hidden'
        );

        forgotForm.classList.add(
          'hidden'
        );

        signinForm.classList.remove(
          'hidden'
        );

        if (authTitle) {
          authTitle.textContent =
            'Sign In to Disciplined';
        }
      }
    );
  }


  /* -------------------------------------------------------
     FORGOT PASSWORD VIEW
     ------------------------------------------------------- */

  const goForgotBtn =
    document.getElementById(
      'go-forgot-btn'
    );

  if (goForgotBtn) {
    goForgotBtn.addEventListener(
      'click',
      () => {
        clearAuthAlert();

        signinForm.classList.add(
          'hidden'
        );

        signupForm.classList.add(
          'hidden'
        );

        forgotForm.classList.remove(
          'hidden'
        );

        if (authTitle) {
          authTitle.textContent =
            'Reset Password';
        }
      }
    );
  }


  /* -------------------------------------------------------
     CANCEL FORGOT
     ------------------------------------------------------- */

  const cancelForgotBtn =
    document.getElementById(
      'cancel-forgot-btn'
    );

  if (cancelForgotBtn) {
    cancelForgotBtn.addEventListener(
      'click',
      () => {
        clearAuthAlert();

        forgotForm.classList.add(
          'hidden'
        );

        signinForm.classList.remove(
          'hidden'
        );

        if (authTitle) {
          authTitle.textContent =
            'Sign In to Disciplined';
        }
      }
    );
  }


  /* -------------------------------------------------------
     SIGN IN
     ------------------------------------------------------- */

  signinForm.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();

      clearAuthAlert();

      const identifier =
        document
          .getElementById(
            'signin-identifier'
          )
          ?.value.trim() || '';

      const password =
        document
          .getElementById(
            'signin-password'
          )?.value || '';

      if (!identifier || !password) {
        showAuthAlert(
          'Please enter your username/email and password.'
        );

        return;
      }


      /*
       * SUPABASE AUTH
       */

      if (
        supabaseClient &&
        supabaseClient.auth
      ) {
        try {
          let email =
            identifier;

          /*
           * If user entered username,
           * find the corresponding local
           * email address.
           */

          if (
            !identifier.includes('@')
          ) {
            const localUser =
              usersDb.find(
                (user) =>
                  String(
                    user.username || ''
                  ).toLowerCase() ===
                  identifier.toLowerCase()
              );

            if (localUser?.email) {
              email =
                localUser.email;
            }
          }

          const {
            data,
            error
          } =
            await supabaseClient.auth.signInWithPassword(
              {
                email,
                password
              }
            );

          if (
            !error &&
            data?.user
          ) {
            const supabaseUser =
              data.user;

            const localUser =
              usersDb.find(
                (user) =>
                  user.email?.toLowerCase() ===
                  supabaseUser.email?.toLowerCase()
              );

            const user = {
              id:
                supabaseUser.id,

              email:
                supabaseUser.email ||
                email,

              name:
                supabaseUser
                  .user_metadata
                  ?.full_name ||
                localUser?.name ||
                (
                  supabaseUser.email ||
                  email
                ).split('@')[0],

              username:
                localUser?.username ||
                (
                  supabaseUser.email ||
                  email
                ).split('@')[0]
            };

            /*
             * Keep a local profile mapping
             * so the UI can restore correctly.
             */

            upsertLocalUser(user);

            loginUser(user);

            return;
          }

          /*
           * If Supabase says the credentials are
           * invalid, only fall back to local mode
           * when a matching local account exists.
           */

        } catch (error) {
          console.warn(
            'Supabase sign-in failed:',
            error
          );
        }
      }


      /* ---------------------------------------------------
         LOCAL FALLBACK
         --------------------------------------------------- */

      const localUser =
        usersDb.find(
          (user) =>
            (
              user.username
                ?.toLowerCase() ===
              identifier.toLowerCase()
            ) ||
            (
              user.email
                ?.toLowerCase() ===
              identifier.toLowerCase()
            )
        );

      if (
        !localUser ||
        localUser.password !==
          password
      ) {
        showAuthAlert(
          'Invalid username/email or password.'
        );

        return;
      }

      loginUser(localUser);
    }
  );


  /* -------------------------------------------------------
     SIGN UP
     ------------------------------------------------------- */

  signupForm.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();

      clearAuthAlert();

      if (
        usersDb.length >=
        MAX_PROFILES
      ) {
        showAuthAlert(
          `Cannot create profile. Maximum ${MAX_PROFILES} user accounts reached.`
        );

        return;
      }

      const name =
        document
          .getElementById(
            'signup-name'
          )
          ?.value.trim() || '';

      const username =
        document
          .getElementById(
            'signup-username'
          )
          ?.value.trim()
          .toLowerCase() || '';

      const email =
        document
          .getElementById(
            'signup-email'
          )
          ?.value.trim()
          .toLowerCase() || '';

      const password =
        document.getElementById(
          'signup-password'
        )?.value || '';

      if (
        !name ||
        !username ||
        !email ||
        !password
      ) {
        showAuthAlert(
          'Please complete all required fields.'
        );

        return;
      }

      if (
        password.length < 6
      ) {
        showAuthAlert(
          'Password must contain at least 6 characters.'
        );

        return;
      }

      if (
        usersDb.some(
          (user) =>
            user.username
              ?.toLowerCase() ===
            username
        )
      ) {
        showAuthAlert(
          'Username already taken.'
        );

        return;
      }

      if (
        usersDb.some(
          (user) =>
            user.email
              ?.toLowerCase() ===
            email
        )
      ) {
        showAuthAlert(
          'Email already registered.'
        );

        return;
      }


      /* ---------------------------------------------------
         SUPABASE SIGNUP
         --------------------------------------------------- */

      if (
        supabaseClient &&
        supabaseClient.auth
      ) {
        try {
          const {
            data,
            error
          } =
            await supabaseClient.auth.signUp(
              {
                email,
                password,

                options: {
                  data: {
                    full_name:
                      name,
                    username
                  }
                }
              }
            );

          if (error) {
            console.error(
              'Supabase signup error:',
              error
            );

            /*
             * Do not silently create a local account
             * when Supabase is being used.
             */

            showAuthAlert(
              error.message ||
                'Unable to create your Supabase account.'
            );

            return;
          }

          if (data?.user) {
            const user = {
              id:
                data.user.id,

              name,

              username,

              email
            };

            upsertLocalUser(
              user
            );

            /*
             * Supabase may require email confirmation.
             */

            if (
              !data.session
            ) {
              showAuthAlert(
                'Account created. Please check your email to confirm your account before signing in.',
                'success'
              );

              return;
            }

            loginUser(user);

            return;
          }
        } catch (error) {
          console.error(
            'Supabase signup exception:',
            error
          );

          showAuthAlert(
            'Unable to connect to the authentication server.'
          );

          return;
        }
      }


      /* ---------------------------------------------------
         LOCAL-ONLY SIGNUP
         --------------------------------------------------- */

      const newUser = {
        id:
          generateId('usr'),

        name,

        username,

        email,

        password
      };

      usersDb.push(
        newUser
      );

      saveUsersDatabase();

      localStorage.setItem(
        getUserStorageKey(
          newUser.id
        ),
        JSON.stringify(
          DEFAULT_STATE_TEMPLATE
        )
      );

      loginUser(
        newUser
      );
    }
  );


  /* -------------------------------------------------------
     PASSWORD RESET
     ------------------------------------------------------- */

  forgotForm.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();

      clearAuthAlert();

      const identifier =
        document
          .getElementById(
            'forgot-identifier'
          )
          ?.value.trim()
          .toLowerCase() || '';

      const newPassword =
        document
          .getElementById(
            'forgot-new-password'
          )?.value || '';

      if (
        !identifier ||
        !newPassword
      ) {
        showAuthAlert(
          'Please provide the required information.'
        );

        return;
      }

      if (
        newPassword.length < 6
      ) {
        showAuthAlert(
          'New password must contain at least 6 characters.'
        );

        return;
      }


      /*
       * If Supabase is active, send a proper
       * password reset email.
       */

      if (
        supabaseClient &&
        supabaseClient.auth &&
        identifier.includes('@')
      ) {
        try {
          const {
            error
          } =
            await supabaseClient.auth.resetPasswordForEmail(
              identifier,
              {
                redirectTo:
                  window.location.origin +
                  window.location.pathname
              }
            );

          if (error) {
            showAuthAlert(
              error.message ||
                'Unable to send password reset email.'
            );

            return;
          }

          showAuthAlert(
            'Password reset instructions have been sent to your email.',
            'success'
          );

          return;
        } catch (error) {
          console.error(
            'Password reset error:',
            error
          );

          showAuthAlert(
            'Unable to process the password reset request.'
          );

          return;
        }
      }


      /*
       * LOCAL-ONLY RESET
       */

      const user =
        usersDb.find(
          (item) =>
            item.username
              ?.toLowerCase() ===
              identifier ||
            item.email
              ?.toLowerCase() ===
              identifier
        );

      if (!user) {
        showAuthAlert(
          'No registered profile matches that username or email.'
        );

        return;
      }

      user.password =
        newPassword;

      saveUsersDatabase();

      showAuthAlert(
        'Password reset successful! You can now sign in with your new password.',
        'success'
      );

      setTimeout(
        () => {
          forgotForm.classList.add(
            'hidden'
          );

          signinForm.classList.remove(
            'hidden'
          );

          if (authTitle) {
            authTitle.textContent =
              'Sign In to Disciplined';
          }

          clearAuthAlert();
        },
        1500
      );
    }
  );


  /* -------------------------------------------------------
     SIGN OUT
     ------------------------------------------------------- */

  const signoutButton =
    document.getElementById(
      'signout-btn'
    );

  if (signoutButton) {
    signoutButton.addEventListener(
      'click',
      async () => {
        try {
          if (
            supabaseClient &&
            supabaseClient.auth
          ) {
            await supabaseClient.auth.signOut();
          }
        } catch (error) {
          console.warn(
            'Supabase signout error:',
            error
          );
        }

        localStorage.removeItem(
          CURRENT_USER_KEY
        );

        currentUserId = null;
        appState = null;

        destroyCharts();

        authGate.classList.remove(
          'hidden'
        );

        signinForm.classList.remove(
          'hidden'
        );

        signupForm.classList.add(
          'hidden'
        );

        forgotForm.classList.add(
          'hidden'
        );

        if (authTitle) {
          authTitle.textContent =
            'Sign In to Disciplined';
        }

        clearAuthAlert();
      }
    );
  }

  authViewsInitialized = true;
}


/* =========================================================
   LOCAL USER MAPPING
   ========================================================= */

function upsertLocalUser(user) {
  if (!user || !user.id) {
    return;
  }

  const existingIndex =
    usersDb.findIndex(
      (item) =>
        item.id === user.id ||
        (
          item.email &&
          user.email &&
          item.email.toLowerCase() ===
            user.email.toLowerCase()
        )
    );

  const existing =
    existingIndex >= 0
      ? usersDb[existingIndex]
      : null;

  const mergedUser = {
    ...(existing || {}),
    ...user
  };

  if (existingIndex >= 0) {
    usersDb[
      existingIndex
    ] = mergedUser;
  } else {
    /*
     * Do not store a Supabase user's
     * password locally.
     */

    delete mergedUser.password;

    usersDb.push(
      mergedUser
    );
  }

  saveUsersDatabase();

  /*
   * Ensure their application state exists.
   */

  const stateKey =
    getUserStorageKey(
      mergedUser.id
    );

  if (
    !localStorage.getItem(
      stateKey
    )
  ) {
    localStorage.setItem(
      stateKey,
      JSON.stringify(
        DEFAULT_STATE_TEMPLATE
      )
    );
  }
}


/* =========================================================
   LOGIN
   ========================================================= */

function loginUser(user) {
  if (!user || !user.id) {
    return;
  }

  currentUserId =
    user.id;

  localStorage.setItem(
    CURRENT_USER_KEY,
    currentUserId
  );

  appState =
    loadUserState(
      currentUserId
    );

  const authGate =
    document.getElementById(
      'auth-gate'
    );

  if (authGate) {
    authGate.classList.add(
      'hidden'
    );
  }

  updateNavUserProfile(
    user
  );

  setupHeaderSelectors();

  renderApp();
}


/* =========================================================
   USER PROFILE DISPLAY
   ========================================================= */

function updateNavUserProfile(
  user
) {
  if (!user) {
    return;
  }

  const nameEl =
    document.getElementById(
      'active-user-name'
    );

  const avatarEl =
    document.getElementById(
      'active-avatar'
    );

  const displayName =
    user.name ||
    user.email ||
    user.username ||
    'User';

  if (nameEl) {
    nameEl.textContent =
      displayName;
  }

  if (avatarEl) {
    const initials =
      displayName
        .split(/\s+/)
        .filter(Boolean)
        .map(
          (part) =>
            part.charAt(0)
        )
        .join('')
        .substring(0, 2)
        .toUpperCase();

    avatarEl.textContent =
      initials || 'U';
  }
}


/* =========================================================
   AUTH SESSION CHECK
   ========================================================= */

async function checkAuthSession() {
  const authGate =
    document.getElementById(
      'auth-gate'
    );

  /*
   * First priority:
   * Supabase session.
   */

  if (
    supabaseClient &&
    supabaseClient.auth
  ) {
    try {
      const {
        data,
        error
      } =
        await supabaseClient.auth.getSession();

      if (
        !error &&
        data?.session?.user
      ) {
        const supabaseUser =
          data.session.user;

        const existingLocalUser =
          usersDb.find(
            (user) =>
              user.email?.toLowerCase() ===
              supabaseUser.email?.toLowerCase()
          );

        const user = {
          id:
            supabaseUser.id,

          email:
            supabaseUser.email ||
            '',

          name:
            supabaseUser
              .user_metadata
              ?.full_name ||
            existingLocalUser?.name ||
            (
              supabaseUser.email ||
              'User'
            ).split('@')[0],

          username:
            existingLocalUser?.username ||
            supabaseUser
              .user_metadata
              ?.username ||
            (
              supabaseUser.email ||
              'user'
            ).split('@')[0]
        };

        upsertLocalUser(
          user
        );

        loginUser(user);

        return;
      }
    } catch (error) {
      console.warn(
        'Unable to restore Supabase session:',
        error
      );
    }
  }


  /*
   * Second priority:
   * local session.
   */

  if (currentUserId) {
    const localUser =
      usersDb.find(
        (user) =>
          user.id ===
          currentUserId
      );

    if (localUser) {
      loginUser(
        localUser
      );

      return;
    }

    /*
     * Stale local session.
     */

    localStorage.removeItem(
      CURRENT_USER_KEY
    );

    currentUserId = null;
  }


  /*
   * No active session.
   */

  if (authGate) {
    authGate.classList.remove(
      'hidden'
    );
  }
}


/* =========================================================
   CHART CLEANUP
   ========================================================= */

function destroyCharts() {
  if (monthlyChartInstance) {
    try {
      monthlyChartInstance.destroy();
    } catch (error) {
      console.warn(
        'Monthly chart cleanup failed:',
        error
      );
    }

    monthlyChartInstance = null;
  }

  if (annualChartInstance) {
    try {
      annualChartInstance.destroy();
    } catch (error) {
      console.warn(
        'Annual chart cleanup failed:',
        error
      );
    }

    annualChartInstance = null;
  }
}


/* =========================================================
   SUPABASE AUTH STATE LISTENER
   ========================================================= */

if (
  supabaseClient &&
  supabaseClient.auth
) {
  supabaseClient.auth.onAuthStateChange(
    (event, session) => {
      /*
       * Do not immediately call getSession()
       * inside this callback because Supabase can
       * fire auth events during initialization.
       */

      setTimeout(
        async () => {
          if (
            session?.user
          ) {
            const supabaseUser =
              session.user;

            const localUser =
              usersDb.find(
                (user) =>
                  user.email?.toLowerCase() ===
                  supabaseUser.email?.toLowerCase()
              );

            const user = {
              id:
                supabaseUser.id,

              email:
                supabaseUser.email ||
                '',

              name:
                supabaseUser
                  .user_metadata
                  ?.full_name ||
                localUser?.name ||
                (
                  supabaseUser.email ||
                  'User'
                ).split('@')[0],

              username:
                localUser?.username ||
                supabaseUser
                  .user_metadata
                  ?.username ||
                (
                  supabaseUser.email ||
                  'user'
                ).split('@')[0]
            };

            upsertLocalUser(
              user
            );

            loginUser(user);
          } else if (
            event === 'SIGNED_OUT'
          ) {
            currentUserId =
              null;

            appState =
              null;

            localStorage.removeItem(
              CURRENT_USER_KEY
            );

            destroyCharts();

            const authGate =
              document.getElementById(
                'auth-gate'
              );

            if (authGate) {
              authGate.classList.remove(
                'hidden'
              );
            }
          }
        },
        0
      );
    }
  );
}


/* =========================================================
   PWA SERVICE WORKER
   ========================================================= */

function setupServiceWorker() {
  if (
    !('serviceWorker' in
      navigator)
  ) {
    return;
  }

  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then(
          (registration) => {
            console.log(
              'Disciplined Service Worker registered successfully.',
              registration.scope
            );
          }
        )
        .catch(
          (error) => {
            console.warn(
              'Service Worker registration failed:',
              error
            );
          }
        );
    },
    { once: true }
  );
}

setupServiceWorker();


/* =========================================================
   PWA INSTALL PROMPT
   ========================================================= */

let deferredPrompt = null;

window.addEventListener(
  'beforeinstallprompt',
  (event) => {
    event.preventDefault();

    deferredPrompt =
      event;

    const installButton =
      document.getElementById(
        'pwa-install-btn'
      );

    if (installButton) {
      installButton.classList.remove(
        'hidden'
      );
    }
  }
);

function setupInstallButton() {
  if (installButtonInitialized) {
    return;
  }

  const installButton =
    document.getElementById(
      'pwa-install-btn'
    );

  if (!installButton) {
    return;
  }

  installButton.addEventListener(
    'click',
    async (event) => {
      event.preventDefault();

      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();

          const choice =
            await deferredPrompt.userChoice;

          if (
            choice?.outcome ===
            'accepted'
          ) {
            installButton.classList.add(
              'hidden'
            );
          }
        } catch (error) {
          console.warn(
            'PWA installation prompt failed:',
            error
          );
        }

        deferredPrompt =
          null;

        return;
      }

      const isIOS =
        /iPad|iPhone|iPod/.test(
          navigator.userAgent
        ) &&
        !window.MSStream;

      if (isIOS) {
        alert(
          "To install on iOS:\n\n1. Tap the Share icon.\n2. Scroll down.\n3. Tap 'Add to Home Screen'."
        );
      } else {
        alert(
          "To install on this device:\n\n1. Open the browser menu (⋮).\n2. Select 'Install Disciplined' or 'Add to Home Screen'."
        );
      }
    }
  );

  installButtonInitialized =
    true;
}

window.addEventListener(
  'appinstalled',
  () => {
    const installButton =
      document.getElementById(
        'pwa-install-btn'
      );

    if (installButton) {
      installButton.classList.add(
        'hidden'
      );
    }

    deferredPrompt =
      null;
  }
);
