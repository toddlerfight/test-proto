/* Shared state for the prototype.
 *
 * sessionStorage, not localStorage — deliberate. Each Askable participant gets a
 * clean slate when they open the tab and it evaporates when they close it. No
 * ghosts of the last participant haunting the next one's session. Nothing leaves
 * the browser. There is no backend. There is nothing to breach.
 */

const Store = {

  /* Each flow gets its own drawer in sessionStorage. Set this at the top of a
     page's inline script before touching anything else, or the calculator and
     the sign-up will happily trample each other. */
  ns: 'proto.signup',

  read() {
    try {
      return JSON.parse(sessionStorage.getItem(Store.ns)) || {};
    } catch {
      // Private mode, wiped storage, whatever. Don't die, just start over.
      return {};
    }
  },

  write(patch) {
    const next = { ...Store.read(), ...patch };
    try {
      sessionStorage.setItem(Store.ns, JSON.stringify(next));
    } catch {
      /* storage disabled — flow still works forward, just won't survive a refresh */
    }
    return next;
  },

  clear() {
    try { sessionStorage.removeItem(Store.ns); } catch {}
  },

  /* Bin specific keys. Needed when someone reverses out of step 1 and flips
     account type — otherwise a ghost ABN from the business branch turns up in
     the review of a personal account. */
  drop(keys) {
    const next = Store.read();
    keys.forEach((k) => delete next[k]);
    try { sessionStorage.setItem(Store.ns, JSON.stringify(next)); } catch {}
    return next;
  },

  /* Bounce anyone who deep-links past a step they haven't filled in.
     Nothing tanks an unmoderated session faster than a blank step 2. */
  requires(...keys) {
    const d = Store.read();
    const missing = keys.some((k) => !d[k]);
    if (missing) location.replace('index.html');
    return d;
  }
};

/* ---------- the bits that make step 1 visibly change steps 2 and 3 ---------- */

const ACCOUNT_TYPES = {
  personal:  { label: 'Personal',  noun: 'personal account' },
  business:  { label: 'Business',  noun: 'business account' },
  nonprofit: { label: 'Non-profit', noun: 'non-profit account' }
};

const COUNTRIES = {
  au: { label: 'Australia',   dial: '+61', regLabel: 'ABN',                regHint: '11 digits', charity: 'ACNC registration number' },
  nz: { label: 'New Zealand', dial: '+64', regLabel: 'NZBN',               regHint: '13 digits', charity: 'Charities Services number' },
  /* dial is empty on purpose — a lone "+" in a prefix box looks like a bug,
     so the "somewhere else" branch asks for the full number instead. */
  other: { label: 'Somewhere else', dial: '',   regLabel: 'Company registration number', regHint: 'As issued in your country', charity: 'Charity registration number' }
};

const accountType = (d) => ACCOUNT_TYPES[d.accountType] || ACCOUNT_TYPES.personal;
const country     = (d) => COUNTRIES[d.country] || COUNTRIES.other;

/* ---------- small DOM helpers ---------- */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function markSteps(current) {
  $$('.steps__item').forEach((el, i) => {
    const n = i + 1;
    el.dataset.state = n < current ? 'done' : n === current ? 'current' : 'todo';
    if (n < current) el.querySelector('.steps__dot').textContent = '✓';
  });
}

/* Validation. Deliberately gentle: flag on submit, clear the moment they fix it.
   Yelling at people mid-keystroke is how you poison a usability test. */

function showError(input, message) {
  const err = document.getElementById(input.dataset.errorId);
  input.setAttribute('aria-invalid', 'true');
  if (err) { err.textContent = message; err.setAttribute('data-shown', ''); }
}

function clearError(input) {
  const err = document.getElementById(input.dataset.errorId);
  input.removeAttribute('aria-invalid');
  if (err) err.removeAttribute('data-shown');
}

function validate(form) {
  let firstBad = null;

  $$('[data-validate]', form).forEach((input) => {
    const rules = input.dataset.validate.split(' ');
    const value = (input.value || '').trim();
    let message = '';

    if (rules.includes('required') && !value) {
      message = input.dataset.msgRequired || 'This field is required.';
    } else if (rules.includes('email') && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      message = 'Enter an email address in the format name@example.com.';
    }

    if (message) {
      showError(input, message);
      firstBad = firstBad || input;
    } else {
      clearError(input);
    }
  });

  // Radio and checkbox groups get checked separately — they have no single input.
  $$('[data-group-required]', form).forEach((group) => {
    const ok = $$('input', group).some((i) => i.checked);
    const err = document.getElementById(group.dataset.errorId);
    if (!ok) {
      if (err) { err.textContent = group.dataset.msgRequired || 'Choose an option.'; err.setAttribute('data-shown', ''); }
      firstBad = firstBad || $('input', group);
    } else if (err) {
      err.removeAttribute('data-shown');
    }
  });

  const summary = $('.summary-error', form);
  if (firstBad) {
    if (summary) summary.setAttribute('data-shown', '');
    firstBad.focus();
    firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }
  if (summary) summary.removeAttribute('data-shown');
  return true;
}

/* Clear a field's error as soon as it stops being wrong. */
function wireLiveClearing(form) {
  $$('[data-validate]', form).forEach((input) => {
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true' && input.value.trim()) clearError(input);
    });
  });
  $$('[data-group-required]', form).forEach((group) => {
    group.addEventListener('change', () => {
      const err = document.getElementById(group.dataset.errorId);
      if (err && $$('input', group).some((i) => i.checked)) err.removeAttribute('data-shown');
    });
  });
}

/* Pull every named field out of a form into a flat object.
   Checkbox groups (name="x[]") collapse into arrays. */
function harvest(form) {
  const out = {};
  new FormData(form).forEach((value, name) => {
    if (name.endsWith('[]')) {
      const key = name.slice(0, -2);
      (out[key] = out[key] || []).push(value);
    } else {
      out[name] = typeof value === 'string' ? value.trim() : value;
    }
  });
  return out;
}

/* Repopulate a form from the store, so Back and Edit don't nuke anyone's typing. */
function rehydrate(form, data) {
  $$('input, select, textarea', form).forEach((el) => {
    const key = el.name.endsWith('[]') ? el.name.slice(0, -2) : el.name;
    if (!(key in data)) return;
    const saved = data[key];

    if (el.type === 'checkbox') {
      el.checked = Array.isArray(saved) ? saved.includes(el.value) : saved === el.value;
    } else if (el.type === 'radio') {
      el.checked = saved === el.value;
    } else {
      el.value = saved;
    }
  });
}

/* The reset link in the footer. Handy for him between pilot runs. */
function wireRestart() {
  const link = $('[data-restart]');
  if (!link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    Store.clear();
    location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', wireRestart);


/* ---------- numbers ---------- */

/* Everything the calculator shows the participant goes through here. Consistent
   formatting is half the battle in an unmoderated test — if the same figure
   renders three different ways across three steps, they'll think it changed. */

const money = (n, dp = 0) =>
  '$' + (Number(n) || 0).toLocaleString('en-AU', {
    minimumFractionDigits: dp, maximumFractionDigits: dp
  });

const pct = (n, dp = 1) => (Number(n) || 0).toFixed(dp) + '%';

/* Strip the decoration people type into a money field — "$1,250" is a number. */
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/* Present value of an annuity. The whole borrowing-power figure hangs off this:
   given what they can pay each month, how much principal does that service? */
function principalFor(monthlyPayment, annualRatePct, years) {
  const i = (annualRatePct / 100) / 12;
  const n = years * 12;
  if (i <= 0) return monthlyPayment * n;
  return monthlyPayment * (1 - Math.pow(1 + i, -n)) / i;
}

/* The reverse: given the loan, what's the monthly repayment? */
function repaymentFor(principal, annualRatePct, years) {
  const i = (annualRatePct / 100) / 12;
  const n = years * 12;
  if (i <= 0) return principal / n;
  return principal * i / (1 - Math.pow(1 + i, -n));
}

/* Shared assumptions. One place, so step 1's borrowing power and step 3's
   repayment can never quietly disagree about the buffer. */
const ASSUMPTIONS = {
  dependantAllowance: 400,   // per dependant per month
  cardFactor: 0.038,         // monthly commitment assumed against a card limit
  safetyMargin: 0.90,        // only commit 90% of surplus
  serviceBuffer: 3.0,        // percentage points added when assessing
  defaultRate: 6.10,
  defaultTerm: 30,
  lmiThreshold: 80           // LVR above this and LMI is in play
};

function borrowingPower(d) {
  const income   = num(d.income1) + num(d.income2);
  const living   = num(d.expenses) + num(d.dependants) * ASSUMPTIONS.dependantAllowance;
  const commits  = num(d.debts) + num(d.cardLimit) * ASSUMPTIONS.cardFactor;
  const surplus  = income - living - commits;
  const capacity = Math.max(0, surplus) * ASSUMPTIONS.safetyMargin;
  const assessed = ASSUMPTIONS.defaultRate + ASSUMPTIONS.serviceBuffer;
  const power    = principalFor(capacity, assessed, ASSUMPTIONS.defaultTerm);

  return {
    income, living, commits, surplus, capacity, assessed,
    power: Math.max(0, Math.round(power / 1000) * 1000)
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
