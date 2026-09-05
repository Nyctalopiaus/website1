// Scenario persistence, sharing, and comparison helpers for the Scenarios modal.
// Kept separate from app.js so the DOM-wiring code doesn't have to interleave with
// localStorage/URL-encoding concerns.

const STORAGE_KEY = 'retirementForecasterScenarios';

// Every form field that makes up a "scenario" — deliberately excludes
// toggle-purchasing-power, since that's a display preference, not a plan input.
export const SCENARIO_FIELDS = [
  { id: 'current-age', type: 'number' },
  { id: 'retirement-age', type: 'number' },
  { id: 'life-expectancy', type: 'number' },
  { id: 'pretax-balance', type: 'number' },
  { id: 'pretax-monthly', type: 'number' },
  { id: 'employer-match-rate', type: 'number' },
  { id: 'roth-balance', type: 'number' },
  { id: 'roth-monthly', type: 'number' },
  { id: 'taxable-balance', type: 'number' },
  { id: 'taxable-monthly', type: 'number' },
  { id: 'taxable-unrealized-gains', type: 'number' },
  { id: 'taxable-hysa-balance', type: 'number' },
  { id: 'taxable-hysa-monthly', type: 'number' },
  { id: 'taxable-hysa-compound', type: 'checkbox' },
  { id: 'taxable-hysa-rate', type: 'number' },
  { id: 'retirement-income', type: 'number' },
  { id: 'social-security', type: 'number' },
  { id: 'ss-claim-age', type: 'number' },
  { id: 'pre-return', type: 'number' },
  { id: 'post-return', type: 'number' },
  { id: 'inflation-rate', type: 'number' },
  { id: 'tax-rate', type: 'number' },
  { id: 'capital-gains-rate', type: 'number' },
  { id: 'early-withdrawal-penalty', type: 'number' }
];

export function readScenarioFromForm() {
  const data = {};
  SCENARIO_FIELDS.forEach(({ id, type }) => {
    const el = document.getElementById(id);
    if (!el) return;
    data[id] = type === 'checkbox' ? el.checked : el.value;
  });
  return data;
}

// Writes a scenario's values back into the form and fires a single 'input' event
// (on the last field) so app.js's listeners recompute once, not once per field.
export function writeScenarioToForm(data) {
  SCENARIO_FIELDS.forEach(({ id, type }) => {
    if (!(id in data)) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (type === 'checkbox') el.checked = !!data[id];
    else el.value = data[id];
  });
  const lastField = SCENARIO_FIELDS[SCENARIO_FIELDS.length - 1];
  const lastEl = document.getElementById(lastField.id);
  if (lastEl) lastEl.dispatchEvent(new Event('input', { bubbles: true }));
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // localStorage unavailable (private browsing, quota, disabled) — degrade to "no saves".
    return [];
  }
}

function writeStore(scenarios) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
    return true;
  } catch (e) {
    return false;
  }
}

export function listSavedScenarios() {
  return readStore();
}

export function saveScenario(name, data) {
  const scenarios = readStore();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: (name || 'Untitled scenario').slice(0, 60),
    data,
    savedAt: new Date().toISOString()
  };
  scenarios.push(entry);
  return writeStore(scenarios) ? entry : null;
}

export function deleteScenario(id) {
  const scenarios = readStore().filter(s => s.id !== id);
  return writeStore(scenarios);
}

// Shareable link: the scenario is packed into the URL hash as base64-encoded JSON,
// so loading the link alone reproduces the plan with no server and no storage.
export function encodeScenarioToHash(data) {
  const json = JSON.stringify(data);
  return 's=' + btoa(encodeURIComponent(json));
}

export function decodeScenarioFromHash(hash) {
  const match = /(?:^|[#&])s=([^&]+)/.exec(hash || '');
  if (!match) return null;
  try {
    const json = decodeURIComponent(atob(match[1]));
    const parsed = JSON.parse(json);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch (e) {
    return null;
  }
}

// Builds a CSV string from the same accumulation + burn-phase rows the ledger
// table renders (ledger.js's renderLedger merges them the same way).
export function buildLedgerCsv(accum, burn, retirementAge) {
  const header = ['Age', 'Year', 'Traditional', 'Roth', 'Taxable', 'Total Balance', 'Withdrawal', 'Is Retirement Year'];
  const rows = [...accum.slice(0, -1), ...burn].map(row => [
    row.age,
    row.year,
    Math.round(row.pretax),
    Math.round(row.roth),
    Math.round(row.taxable),
    Math.round(row.total),
    Math.round(row.withdrawal || 0),
    row.age === retirementAge ? 'Y' : ''
  ]);
  return [header, ...rows].map(r => r.join(',')).join('\n');
}
