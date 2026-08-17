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
  const state = await loadState(env);

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
