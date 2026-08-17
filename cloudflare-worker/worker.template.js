const EDITOR_EMAILS = [
  'nikhil.zutshi@curefit.com',
  'divya.agarwal@curefit.com',
  'alvina.davidson@curefit.com',
  'arjit.shukla@curefit.com',
  'anil.kumar@curefit.com'
];
const VIEWER_DOMAINS = ['curefit.com', 'cultfit.in'];
const EDITOR_TABS = ['overview', 'forecast', 'cat-media', 'cat-services', 'cat-brand', 'cat-engagement', 'cat-events', 'spends', 'payments', 'vendors', 'budget'];
const VIEWER_TABS = ['overview', 'cat-media', 'cat-services', 'cat-brand', 'cat-engagement', 'cat-events'];

const INITIAL_STATE = __INITIAL_STATE__;
const INDEX_HTML = __INDEX_HTML__;
let memoryState = structuredClone(INITIAL_STATE);

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function parseNumber(value) {
  const number = Number(String(value ?? '').replaceAll(',', '').replace(/[₹$€£]/g, '').trim());
  return Number.isFinite(number) ? number : 0;
}

function normalizeHeader(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function headerIndex(headers, ...names) {
  const wanted = names.map(normalizeHeader);
  return headers.findIndex((header) => wanted.includes(normalizeHeader(header)));
}

function cell(row, index) {
  return index >= 0 ? row[index] ?? '' : '';
}

function parseSheetDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 10);
}

async function getGoogleAccessToken(env) {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replaceAll('\\n', '\n');
  if (!email || !privateKey) throw new Error('Google Sheets service-account secrets are not configured');

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64UrlDecode(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claim}`)
  );
  const assertion = `${header}.${claim}.${base64UrlEncode(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(assertion)}`
  });
  if (!response.ok) throw new Error(`Google OAuth token request failed (${response.status})`);
  const payload = await response.json();
  return payload.access_token;
}

function rowsAfterHeader(values, headerNames) {
  const headerRowIndex = values.findIndex((row) => row.some((value) => headerNames.includes(normalizeHeader(value))));
  if (headerRowIndex < 0) throw new Error(`Google Sheet header not found: ${headerNames.join(', ')}`);
  return { headers: values[headerRowIndex], rows: values.slice(headerRowIndex + 1) };
}

function buildLiveState(ranges, env) {
  const detail = rowsAfterHeader(ranges.detail, ['year']);
  const payments = rowsAfterHeader(ranges.payments, ['transactionid']);
  const vendors = rowsAfterHeader(ranges.vendors, ['vendoragency']);
  const budget = rowsAfterHeader(ranges.budget, ['category']);

  const detailIndexes = {
    id: headerIndex(detail.headers, 'id'), year: headerIndex(detail.headers, 'year'), month: headerIndex(detail.headers, 'month'),
    quarter: headerIndex(detail.headers, 'quarter'), date: headerIndex(detail.headers, 'date'), category: headerIndex(detail.headers, 'category'),
    channel: headerIndex(detail.headers, 'channel'), vendor: headerIndex(detail.headers, 'vendoragency'), desc: headerIndex(detail.headers, 'description'),
    type: headerIndex(detail.headers, 'type'), amort: headerIndex(detail.headers, 'amortization'), amount: headerIndex(detail.headers, 'amountwithoutgst'), notes: headerIndex(detail.headers, 'notes')
  };
  const paymentIndexes = {
    id: headerIndex(payments.headers, 'transactionid'), date: headerIndex(payments.headers, 'date'), category: headerIndex(payments.headers, 'category'),
    vendor: headerIndex(payments.headers, 'vendoragency'), desc: headerIndex(payments.headers, 'description'), amount: headerIndex(payments.headers, 'amount'),
    poNumber: headerIndex(payments.headers, 'ponumber'), piNumber: headerIndex(payments.headers, 'pinumber'), invoiceNumber: headerIndex(payments.headers, 'invoicenumber'),
    accountingDate: headerIndex(payments.headers, 'accountingdate'), paymentDueDate: headerIndex(payments.headers, 'paymentduedate'), paymentDate: headerIndex(payments.headers, 'paymentdate'),
    paymentStatus: headerIndex(payments.headers, 'paymentstatus'), paymentMethod: headerIndex(payments.headers, 'paymentmethod'), paymentNotes: headerIndex(payments.headers, 'notes')
  };
  const paymentById = new Map();
  for (const row of payments.rows) {
    const id = String(cell(row, paymentIndexes.id)).trim();
    if (id) paymentById.set(id, row);
  }

  const expenses = detail.rows.filter((row) => cell(row, detailIndexes.id)).map((row) => {
    const id = String(cell(row, detailIndexes.id)).trim();
    const payment = paymentById.get(id);
    return {
      id, year: cell(row, detailIndexes.year), month: cell(row, detailIndexes.month), quarter: cell(row, detailIndexes.quarter),
      date: parseSheetDate(cell(row, detailIndexes.date)), category: cell(row, detailIndexes.category), channel: cell(row, detailIndexes.channel),
      vendor: cell(row, detailIndexes.vendor), desc: cell(row, detailIndexes.desc), type: cell(row, detailIndexes.type), amort: cell(row, detailIndexes.amort),
      amount: parseNumber(cell(row, detailIndexes.amount)), notes: cell(row, detailIndexes.notes),
      paymentStatus: payment ? cell(payment, paymentIndexes.paymentStatus) : '', paymentMethod: payment ? cell(payment, paymentIndexes.paymentMethod) : '',
      poNumber: payment ? cell(payment, paymentIndexes.poNumber) : '', piNumber: payment ? cell(payment, paymentIndexes.piNumber) : '',
      invoiceNumber: payment ? cell(payment, paymentIndexes.invoiceNumber) : '', invoiceDate: '',
      accountingDate: payment ? parseSheetDate(cell(payment, paymentIndexes.accountingDate)) : '',
      paymentDueDate: payment ? parseSheetDate(cell(payment, paymentIndexes.paymentDueDate)) : '',
      paymentDate: payment ? parseSheetDate(cell(payment, paymentIndexes.paymentDate)) : '',
      paymentNotes: payment ? cell(payment, paymentIndexes.paymentNotes) : '', sourceSheetRow: detail.rows.indexOf(row) + 1
    };
  });

  const vendorIndexes = {
    name: headerIndex(vendors.headers, 'vendoragency'), category: headerIndex(vendors.headers, 'category'), status: headerIndex(vendors.headers, 'status'),
    type: headerIndex(vendors.headers, 'categorytype'), priority: headerIndex(vendors.headers, 'priority'), contact: headerIndex(vendors.headers, 'contact'), notes: headerIndex(vendors.headers, 'notes')
  };
  const vendorRows = vendors.rows.filter((row) => cell(row, vendorIndexes.name)).map((row) => ({
    name: cell(row, vendorIndexes.name), category: cell(row, vendorIndexes.category), status: cell(row, vendorIndexes.status),
    type: cell(row, vendorIndexes.type), priority: cell(row, vendorIndexes.priority), contact: cell(row, vendorIndexes.contact), notes: cell(row, vendorIndexes.notes)
  }));

  const budgets = {};
  const budgetCategoryIndex = headerIndex(budget.headers, 'category');
  const budgetAmountIndex = headerIndex(budget.headers, 'basebudget');
  for (const row of budget.rows) {
    const category = cell(row, budgetCategoryIndex).trim();
    if (category && category !== 'CATEGORY BUDGETS') budgets[category] = parseNumber(cell(row, budgetAmountIndex));
  }

  return {
    expenses, payments: [], vendors: vendorRows, budgets, reallocations: [],
    sourceDataVersion: `live-google-sheet-${Date.now()}`,
    source: { spreadsheetId: env.GOOGLE_SHEET_ID, title: 'Marketing Spend Dashboard: cult Enterprise | FY26-27', mode: 'live-google-sheet' },
    activityLog: [{ type: 'System', title: 'Google Sheet data loaded live', detail: `${expenses.length} spend records loaded from Google Sheets.`, timestamp: new Date().toISOString() }],
    nextId: expenses.length
  };
}

async function loadLiveState(env) {
  if (env.GOOGLE_LIVE_SYNC !== 'true' || !env.GOOGLE_SHEET_ID || !env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) return null;
  const token = await getGoogleAccessToken(env);
  const ranges = [env.GOOGLE_SHEET_SPEND_TAB, env.GOOGLE_SHEET_PAYMENTS_TAB, env.GOOGLE_SHEET_VENDORS_TAB, env.GOOGLE_SHEET_BUDGET_TAB]
    .map((name) => `ranges=${encodeURIComponent(`${name}!A1:Z2000`)}`).join('&');
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID)}/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Google Sheets read failed (${response.status})`);
  const payload = await response.json();
  const [detail, payments, vendors, budget] = payload.valueRanges || [];
  return buildLiveState({ detail: detail?.values || [], payments: payments?.values || [], vendors: vendors?.values || [], budget: budget?.values || [] }, env);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function getUserEmail(request) {
  return (
    request.headers.get('cf-access-authenticated-user-email') ||
    request.headers.get('x-authenticated-user-email') ||
    ''
  ).trim().toLowerCase();
}

function getAuth(email) {
  const domain = email.includes('@') ? email.split('@').pop() : '';
  const canView = Boolean(email) && VIEWER_DOMAINS.includes(domain);
  const canEdit = canView && EDITOR_EMAILS.includes(email);
  return {
    email,
    domain,
    canView,
    role: canEdit ? 'editor' : 'viewer',
    canEdit,
    visibleTabs: canEdit ? EDITOR_TABS : VIEWER_TABS
  };
}

async function loadState(env) {
  const liveState = await loadLiveState(env);
  if (liveState) return liveState;
  if (!env.APP_STATE || typeof env.APP_STATE.get !== 'function') {
    return structuredClone(memoryState);
  }

  const raw = await env.APP_STATE.get('dashboard_state');
  if (!raw) {
    await env.APP_STATE.put('dashboard_state', JSON.stringify(INITIAL_STATE));
    return structuredClone(INITIAL_STATE);
  }
  try {
    const storedState = JSON.parse(raw);
    if (storedState.sourceDataVersion !== INITIAL_STATE.sourceDataVersion) {
      await env.APP_STATE.put('dashboard_state', JSON.stringify(INITIAL_STATE));
      return structuredClone(INITIAL_STATE);
    }
    return storedState;
  } catch (error) {
    await env.APP_STATE.put('dashboard_state', JSON.stringify(INITIAL_STATE));
    return structuredClone(INITIAL_STATE);
  }
}

async function saveState(env, state) {
  if (!env.APP_STATE || typeof env.APP_STATE.put !== 'function') {
    memoryState = structuredClone(state);
    return;
  }

  await env.APP_STATE.put('dashboard_state', JSON.stringify(state));
}

function ensureEditor(auth) {
  if (!auth.canEdit) {
    throw new Error('You do not have edit access. Please contact your admin.');
  }
}

function findExpenseIndex(state, id) {
  return state.expenses.findIndex((item) => String(item.id) === String(id));
}

function findVendorIndex(state, name) {
  return state.vendors.findIndex((item) => String(item.name).toLowerCase() === String(name).toLowerCase());
}

function findReallocationIndex(state, id) {
  return state.reallocations.findIndex((item) => String(item.id) === String(id));
}

function getDashboardData(state) {
  return {
    spends: state.expenses,
    vendors: state.vendors,
    budgets: Object.entries(state.budgets).map(([category, baseBudget]) => ({ category, baseBudget })),
    reallocations: state.reallocations,
    sourceDataVersion: state.sourceDataVersion,
    config: []
  };
}

async function handleApi(request, env) {
  const email = getUserEmail(request);
  const auth = getAuth(email);
  let state;
  try {
    state = await loadState(env);
  } catch (error) {
    return json({ ok: false, error: error.message || 'Live Google Sheet read failed', auth }, 502);
  }

  if (!auth.canView) {
    return json({
      ok: false,
      error: 'You do not have access to this dashboard.',
      auth
    }, 403);
  }

  if (request.method === 'GET') {
    return json({
      ok: true,
      data: getDashboardData(state),
      auth,
      timestamp: new Date().toISOString()
    });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  if (env.GOOGLE_LIVE_SYNC === 'true') {
    return json({ ok: false, error: 'This dashboard is read-only from the live Google Sheet. Edit the source Sheet and refresh.', auth }, 409);
  }

  try {
    ensureEditor(auth);
    const payload = await request.json();
    const action = payload.action || '';

    if (action === 'addExpense') {
      state.expenses.push(payload.record || {});
    } else if (action === 'updateExpense') {
      const idx = findExpenseIndex(state, payload.id);
      if (idx === -1) throw new Error('Expense not found');
      state.expenses[idx] = { ...state.expenses[idx], ...(payload.record || {}) };
    } else if (action === 'deleteExpense') {
      state.expenses = state.expenses.filter((item) => String(item.id) !== String(payload.id));
    } else if (action === 'updatePaymentField') {
      const idx = findExpenseIndex(state, payload.id);
      if (idx === -1) throw new Error('Expense not found');
      state.expenses[idx][payload.field] = payload.value;
    } else if (action === 'addVendor') {
      state.vendors.push(payload.record || {});
    } else if (action === 'updateVendor') {
      const idx = findVendorIndex(state, payload.name);
      if (idx === -1) throw new Error('Vendor not found');
      state.vendors[idx] = { ...state.vendors[idx], ...(payload.record || {}) };
    } else if (action === 'deleteVendor') {
      state.vendors = state.vendors.filter((item) => String(item.name).toLowerCase() !== String(payload.name).toLowerCase());
    } else if (action === 'updateBudget') {
      state.budgets[payload.category] = Number(payload.baseBudget) || 0;
    } else if (action === 'addReallocation') {
      state.reallocations.push(payload.record || {});
    } else if (action === 'deleteReallocation') {
      state.reallocations = state.reallocations.filter((item) => String(item.id) !== String(payload.id));
    } else {
      throw new Error(`Unsupported action: ${action}`);
    }

    await saveState(env, state);
    return json({
      ok: true,
      data: getDashboardData(state),
      auth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return json({
      ok: false,
      error: error.message || 'Unknown error',
      auth
    }, error.message && error.message.includes('edit access') ? 403 : 400);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname === '/api/') {
      return handleApi(request, env);
    }
    return html(INDEX_HTML);
  }
};
