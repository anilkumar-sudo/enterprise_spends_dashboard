const DEFAULT_ACCESS = [
  { email: 'anil.kumar@curefit.com', role: 'admin' },
  { email: 'nikhil.zutshi@curefit.com', role: 'admin' }
];
const ALLOWED_DOMAIN = 'curefit.com';
const ADMIN_TABS = ['overview', 'forecast', 'cat-media', 'cat-services', 'cat-brand', 'cat-engagement', 'cat-events', 'spends', 'payments', 'vendors', 'budget', 'access'];
const EDITOR_TABS = ADMIN_TABS.filter((tab) => tab !== 'access');
const VIEWER_TABS = ['overview', 'cat-media', 'cat-services', 'cat-brand', 'cat-engagement', 'cat-events'];
const SESSION_TTL = 60 * 60 * 24 * 7;

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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getRedirectUri(request, env) {
  return env.GOOGLE_OAUTH_REDIRECT_URI || `${new URL(request.url).origin}/auth/callback`;
}

function getSessionStore(env) {
  return env.ACCESS_STORE && typeof env.ACCESS_STORE.get === 'function' ? env.ACCESS_STORE : null;
}

async function getAccessList(env) {
  const store = getSessionStore(env);
  if (!store) return structuredClone(DEFAULT_ACCESS);
  const raw = await store.get('b2b:access:users');
  if (!raw) {
    await store.put('b2b:access:users', JSON.stringify(DEFAULT_ACCESS));
    return structuredClone(DEFAULT_ACCESS);
  }
  try {
    const users = JSON.parse(raw);
    return Array.isArray(users) ? users : structuredClone(DEFAULT_ACCESS);
  } catch {
    return structuredClone(DEFAULT_ACCESS);
  }
}

async function saveAccessList(env, users) {
  const store = getSessionStore(env);
  if (store) await store.put('b2b:access:users', JSON.stringify(users));
}

async function getSessionEmail(request, env) {
  const trustedHeaderEmail = normalizeEmail(
    request.headers.get('cf-access-authenticated-user-email') ||
    request.headers.get('x-authenticated-user-email') || ''
  );
  if (trustedHeaderEmail) return trustedHeaderEmail;
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)b2b_session=([^;]+)/);
  if (!match) return '';
  const store = getSessionStore(env);
  if (!store) return '';
  const session = await store.get(`b2b:session:${decodeURIComponent(match[1])}`, 'json');
  return normalizeEmail(session?.email);
}

async function getAuth(email, env) {
  const normalized = normalizeEmail(email);
  const domain = normalized.includes('@') ? normalized.split('@').pop() : '';
  const users = await getAccessList(env);
  const record = users.find((user) => normalizeEmail(user.email) === normalized);
  const canView = Boolean(normalized) && domain === ALLOWED_DOMAIN && Boolean(record);
  const role = canView ? record.role : '';
  const isAdmin = role === 'admin';
  const canEdit = canView && (role === 'editor' || isAdmin);
  return {
    email: normalized,
    domain,
    role: canView ? role : 'restricted',
    canView,
    canEdit,
    isAdmin,
    visibleTabs: isAdmin ? ADMIN_TABS : canEdit ? EDITOR_TABS : canView ? VIEWER_TABS : []
  };
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'no-store' } });
}

function loginUrl(request) {
  return `/auth/login?returnTo=${encodeURIComponent(new URL(request.url).pathname)}`;
}

async function handleAuth(request, env, url) {
  if (url.pathname === '/auth/login') {
    if (!env.GOOGLE_OAUTH_CLIENT_ID) return html('<h1>Google login is not configured</h1><p>Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Worker secrets.</p>', 503);
    const state = crypto.randomUUID();
    const store = getSessionStore(env);
    if (store) await store.put(`b2b:oauth:${state}`, JSON.stringify({ returnTo: url.searchParams.get('returnTo') || '/' }), { expirationTtl: 600 });
    const params = new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: getRedirectUri(request, env),
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state
    });
    return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  if (url.pathname === '/auth/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state || !env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) return html('<h1>Invalid Google login response</h1>', 400);
    const store = getSessionStore(env);
    const oauthState = store ? await store.get(`b2b:oauth:${state}`, 'json') : null;
    if (store) await store.delete(`b2b:oauth:${state}`);
    if (store && !oauthState) return html('<h1>Login expired</h1><p>Please try again.</p>', 400);
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, redirect_uri: getRedirectUri(request, env), grant_type: 'authorization_code' })
    });
    if (!tokenResponse.ok) return html('<h1>Google login failed</h1>', 502);
    const tokens = await tokenResponse.json();
    const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!userResponse.ok) return html('<h1>Could not verify Google account</h1>', 502);
    const user = await userResponse.json();
    const email = normalizeEmail(user.email);
    if (user.email_verified !== true || !email.endsWith(`@${ALLOWED_DOMAIN}`)) return html('<h1>Access denied</h1><p>Only verified @curefit.com accounts can use this dashboard.</p>', 403);
    const auth = await getAuth(email, env);
    if (!auth.canView) return html('<h1>Access pending</h1><p>Your @curefit.com account is not on the dashboard access list. Contact an administrator.</p>', 403);
    if (!store) return html('<h1>Session storage is not configured</h1>', 503);
    const sessionId = crypto.randomUUID();
    await store.put(`b2b:session:${sessionId}`, JSON.stringify({ email }), { expirationTtl: SESSION_TTL });
    const headers = new Headers({ location: oauthState?.returnTo || '/', 'cache-control': 'no-store' });
    headers.append('set-cookie', `b2b_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`);
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === '/auth/logout') {
    const cookie = request.headers.get('cookie') || '';
    const match = cookie.match(/(?:^|;\s*)b2b_session=([^;]+)/);
    const store = getSessionStore(env);
    if (store && match) await store.delete(`b2b:session:${decodeURIComponent(match[1])}`);
    return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': 'b2b_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' } });
  }
  return null;
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
  const email = await getSessionEmail(request, env);
  const auth = await getAuth(email, env);
  if (!auth.canView) {
    return json({ ok: false, error: email ? 'You do not have access to this dashboard.' : 'Authentication required.', auth, loginUrl: loginUrl(request) }, email ? 403 : 401);
  }

  if (new URL(request.url).pathname === '/api/access') {
    if (!auth.isAdmin) return json({ ok: false, error: 'Administrator access required.', auth }, 403);
    if (request.method === 'GET') return json({ ok: true, access: await getAccessList(env), auth });
    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    const payload = await request.json();
    const action = payload.action || '';
    const users = await getAccessList(env);
    const emailToChange = normalizeEmail(payload.email);
    if (!emailToChange.endsWith(`@${ALLOWED_DOMAIN}`)) return json({ ok: false, error: 'Only @curefit.com accounts can be added.' }, 400);
    if (!['admin', 'editor', 'viewer'].includes(payload.role)) return json({ ok: false, error: 'Role must be admin, editor, or viewer.' }, 400);
    if (action === 'upsertAccess') {
      const existing = users.find((user) => normalizeEmail(user.email) === emailToChange);
      if (existing) existing.role = payload.role;
      else users.push({ email: emailToChange, role: payload.role });
    } else if (action === 'removeAccess') {
      if (emailToChange === auth.email) return json({ ok: false, error: 'You cannot remove your own access.' }, 400);
      const remainingAdmins = users.filter((user) => user.role === 'admin' && normalizeEmail(user.email) !== emailToChange);
      if (!remainingAdmins.length) return json({ ok: false, error: 'At least one administrator must remain.' }, 400);
      const next = users.filter((user) => normalizeEmail(user.email) !== emailToChange);
      users.splice(0, users.length, ...next);
    } else {
      return json({ ok: false, error: 'Unsupported access action.' }, 400);
    }
    await saveAccessList(env, users);
    return json({ ok: true, access: users, auth });
  }
  let state;
  try {
    state = await loadState(env);
  } catch (error) {
    return json({ ok: false, error: error.message || 'Live Google Sheet read failed', auth }, 502);
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
    const authResponse = await handleAuth(request, env, url);
    if (authResponse) return authResponse;
    if (url.pathname === '/api/access') return handleApi(request, env);
    if (url.pathname === '/api' || url.pathname === '/api/') {
      return handleApi(request, env);
    }
    const email = await getSessionEmail(request, env);
    const auth = await getAuth(email, env);
    if (!auth.canView) return html(INDEX_HTML.replace('</body>', `<script>window.__AUTH_REQUIRED__=true;</script></body>`));
    return html(INDEX_HTML);
  }
};
