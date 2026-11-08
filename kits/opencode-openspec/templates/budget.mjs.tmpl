// Trusted, read-only OpenRouter key-budget gate. A repair is permitted only
// with an explicitly selected envelope backed by a provider-side key limit.
// No management API, key creation, credential output or paid request here.

export class BudgetRefusal extends Error {
  constructor(code) {
    super(`ASF-BUDGET-${code}`);
    this.name = 'BudgetRefusal';
    this.code = code;
  }
}
const deny = code => { throw new BudgetRefusal(code); };

export function budgetPolicy(repairCalls, amount) {
  if (!['0', '1'].includes(String(repairCalls))) deny('ATTEMPTS');
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(String(amount))) deny('AMOUNT');
  const maxUsd = Number(amount);
  if (!Number.isFinite(maxUsd) || maxUsd > 100 ||
      (String(repairCalls) === '1' && maxUsd <= 0) ||
      (String(repairCalls) === '0' && maxUsd !== 0)) deny('AMOUNT');
  return Object.freeze({ repairCalls: Number(repairCalls), maxUsd });
}

// The supplied key must have a NON-RESETTING provider-enforced cap. A
// resettable daily/monthly limit may roll over mid-workflow, so it cannot
// prove a bound for autonomous extra calls. A dedicated key is recommended.
export function checkKeyBudget(policy, data) {
  if (!policy || policy.maxUsd === 0) return { bounded: false };
  if (!data || typeof data !== 'object' || Array.isArray(data)) deny('OBSERVATION');
  const { limit, limit_remaining: remaining, limit_reset: reset,
    is_management_key: management, include_byok_in_limit: byok } = data;
  if (!Number.isFinite(limit) || !Number.isFinite(remaining) ||
      limit <= 0 || remaining <= 0 || remaining > limit ||
      reset !== null || management !== false || byok !== false ||
      Math.ceil(remaining * 100) > Math.round(policy.maxUsd * 100)) {
    deny('KEY-LIMIT');
  }
  return Object.freeze({ bounded: true, availableCents: Math.floor(remaining * 100) });
}

export async function verifyBudget(env, request = fetch) {
  const policy = budgetPolicy(env.REPAIR_CALLS, env.BUDGET_USD);
  if (policy.repairCalls === 1 && !['auto', 'plan'].includes(env.PHASE)) deny('PHASE');
  if (policy.maxUsd === 0) return { bounded: false, repairCalls: 0 };
  const key = env.OPENROUTER_API_KEY;
  if (typeof key !== 'string' || !key) deny('KEY-ABSENT');
  let response;
  try {
    response = await request('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    deny('UNAVAILABLE');
  }
  if (!response?.ok) deny('UNAVAILABLE');
  let result;
  try { result = await response.json(); } catch { deny('OBSERVATION'); }
  const check = checkKeyBudget(policy, result?.data);
  return { ...check, repairCalls: policy.repairCalls };
}

if (process.argv[1]?.endsWith('/budget.mjs')) {
  verifyBudget(process.env).then(result => {
    console.log(result.bounded ?
      'Provider-side non-resetting key budget verified for this dispatch' :
      'No autonomous paid repair authorized');
  }).catch(error => {
    const code = error instanceof BudgetRefusal ? error.code : 'UNAVAILABLE';
    console.error(`::error title=ASF-BUDGET-${code}::Paid repair blocked. Check the explicit budget and a capped non-resetting OpenRouter key; no additional model call is authorized.`);
    process.exitCode = 1;
  });
}
