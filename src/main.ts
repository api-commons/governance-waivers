import './style.css';
import { parseWaiverFile, serializeWaivers, reconcile, type Waiver, type Violation, type ReconcileResult, type WaiverInfo } from './waivers';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const val = (s: string) => ($(s) as HTMLTextAreaElement | HTMLInputElement).value;
const setVal = (s: string, v: string) => { ($(s) as HTMLTextAreaElement | HTMLInputElement).value = v; };
const ptr = (p?: (string | number)[]) => '/' + (p ?? []).join('/');

let sampleResults = '', sampleWaivers = '';

init();
async function init() {
  wire();
  try {
    [sampleResults, sampleWaivers] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}sample-spectral.json`).then((r) => r.text()),
      fetch(`${import.meta.env.BASE_URL}sample-waivers.yaml`).then((r) => r.text()),
    ]);
    setVal('#results-text', sampleResults);
    setVal('#waivers-text', sampleWaivers);
    run();
  } catch (e) { $('#report').innerHTML = `<div class="cov-error">Couldn't load samples. ${esc((e as Error).message)}</div>`; }
}

function wire() {
  $('#reconcile').addEventListener('click', run);
  $('#load-sample').addEventListener('click', () => { setVal('#results-text', sampleResults); setVal('#waivers-text', sampleWaivers); run(); });
  $('#up-results').addEventListener('click', () => $('#file-results').click());
  $('#up-waivers').addEventListener('click', () => $('#file-waivers').click());
  $('#file-results').addEventListener('change', (e) => readFile(e, '#results-text'));
  $('#file-waivers').addEventListener('change', (e) => readFile(e, '#waivers-text'));
  $('#dl-waivers').addEventListener('click', () => download('governance-waivers.yaml', val('#waivers-text'), 'text/yaml'));
  $('#add-waiver').addEventListener('click', () => { ($('#drawer') as HTMLDetailsElement).open = true; $('#wform').classList.toggle('show'); });
  $('#w-cancel').addEventListener('click', () => $('#wform').classList.remove('show'));
  $('#w-add').addEventListener('click', addWaiver);
  $('#engage-ae').addEventListener('click', () => { location.href = 'mailto:info@apievangelist.com?subject=' + encodeURIComponent('API governance — exceptions & waivers'); });
  $('#nav-about').addEventListener('click', (e) => { e.preventDefault(); about(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('about-modal')?.remove(); });
}

function readFile(e: Event, target: string) {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { setVal(target, String(r.result)); run(); }; r.readAsText(f);
}

function addWaiver() {
  const rule = val('#w-rule').trim();
  if (!rule) { alert('A waiver needs a rule code.'); return; }
  const scope: any = {};
  const files = val('#w-files').trim(); if (files) scope.files = files.split(',').map((s) => s.trim()).filter(Boolean);
  const path = val('#w-path').trim(); if (path) scope.path = path;
  let file;
  try { file = parseWaiverFile(val('#waivers-text') || 'waivers: []'); }
  catch { file = { version: '0.1', waivers: [] as Waiver[] }; }
  const n = file.waivers.length + 1;
  const kind = ($('#w-kind') as HTMLSelectElement).value as 'exception' | 'override' | '';
  const w: Waiver = {
    id: `WVR-${String(n).padStart(3, '0')}`, rule,
    scope: scope.files || scope.path ? scope : undefined,
    reason: val('#w-reason').trim() || undefined, owner: val('#w-owner').trim() || undefined,
    expires: val('#w-expires') || undefined,
    kind: kind || undefined,
    allowed: ($('#w-allowed') as HTMLInputElement).checked ? undefined : false,
    shareable: ($('#w-shareable') as HTMLInputElement).checked ? true : false,
    oneTimeUse: ($('#w-onetime') as HTMLInputElement).checked ? true : undefined,
  };
  file.waivers.push(w);
  setVal('#waivers-text', serializeWaivers(file));
  $('#wform').classList.remove('show');
  ['#w-rule', '#w-files', '#w-path', '#w-owner', '#w-reason', '#w-expires'].forEach((s) => setVal(s, ''));
  ['#w-allowed', '#w-shareable'].forEach((s) => (($(s) as HTMLInputElement).checked = true));
  ($('#w-onetime') as HTMLInputElement).checked = false;
  ($('#w-kind') as HTMLSelectElement).value = '';
  run();
}

let lastEffective: Violation[] = [];
function run() {
  let violations: Violation[], file;
  try { violations = JSON.parse(val('#results-text') || '[]'); if (!Array.isArray(violations)) throw new Error('Expected a JSON array of Spectral results.'); }
  catch (e) { return err(`Couldn't parse Spectral results: ${(e as Error).message}`); }
  try { file = parseWaiverFile(val('#waivers-text')); }
  catch (e) { return err(`Couldn't parse waivers: ${(e as Error).message}`); }

  const r = reconcile(file.waivers, violations, new Date());
  lastEffective = r.rows.filter((row) => row.state !== 'waived').map((row) => row.v);
  $('#status').innerHTML = `<b>${violations.length}</b> results · <b>${file.waivers.length}</b> waivers · <b style="color:${r.counts.live ? 'var(--error)' : 'var(--ok)'}">${r.counts.live}</b> live`;
  render(r);
}
function err(msg: string) { $('#report').innerHTML = `<div class="cov-error">${esc(msg)}</div>`; }

function render(r: ReconcileResult) {
  const order = { live: 0, expired: 1, waived: 2 } as const;
  const rows = [...r.rows].sort((a, b) => order[a.state] - order[b.state]);
  const wrank = { expired: 0, stale: 1, expiring: 2, permanent: 3, active: 4 } as const;
  const wsorted = [...r.waiverInfo].sort((a, b) => wrank[a.stale ? 'stale' : a.status] - wrank[b.stale ? 'stale' : b.status]);

  $('#report').innerHTML = `
    <div class="hero">
      <div class="gauge">
        <div class="gauge-num" style="color:${r.counts.live ? 'var(--error)' : 'var(--ok)'}">${r.counts.live}</div>
        <div class="gauge-cap">live violations<br>after waivers</div>
      </div>
      <div class="facts">
        <div class="fact"><b>${r.counts.total}</b><span>total results</span></div>
        <div class="fact okf"><b>${r.counts.waived}</b><span>waived (suppressed)</span></div>
        <div class="fact ${r.counts.expiredResurfaced ? 'warnf' : ''}"><b>${r.counts.expiredResurfaced}</b><span>resurfaced (waiver expired)</span></div>
        <div class="fact ${r.health.expiring ? 'warnf' : ''}"><b>${r.health.expiring}</b><span>waivers expiring soon</span></div>
        <div class="fact ${r.health.stale ? 'warnf' : ''}"><b>${r.health.stale}</b><span>stale waivers (remove)</span></div>
        <div class="fact ${r.health.policyBreaches ? 'errf' : ''}"><b>${r.health.policyBreaches}</b><span>policy breaches</span></div>
      </div>
    </div>
    <p class="hint small">A waiver makes an exception <strong>sanctioned, owned, and time-boxed</strong> — so teams stop routing around governance by disabling rules. Waived violations are suppressed below; when a waiver <strong>expires</strong> its violation comes back, and a waiver that no longer matches anything is <strong>stale</strong> (the issue was fixed — delete it).</p>

    <div class="cols">
      <section class="panel">
        <h3>Violations <span class="muted">(${r.counts.total})</span></h3>
        <p class="small">Live first — these are what actually fails the gate. Waived ones are suppressed but shown for the record.</p>
        <div class="vlist">${rows.map(vrow).join('')}</div>
      </section>
      <section class="panel">
        <h3>Waivers <span class="muted">(${r.waiverInfo.length})</span></h3>
        <p class="small">Problems first: expired and stale waivers are the ones to act on.</p>
        <div class="wtable">${wsorted.map(wrow).join('')}</div>
      </section>
    </div>

    <div class="export-bar">
      <button class="measure-btn" id="dl-effective" type="button">Download effective results (${lastEffective.length}) ↓</button>
      <button class="ghost-btn" id="dl-waivers2" type="button">Download waivers.yaml ↓</button>
      <span class="muted small">Gate your build on the effective results — the honest failing set after sanctioned waivers.</span>
    </div>`;
  $('#dl-effective').addEventListener('click', () => download('spectral-effective.json', JSON.stringify(lastEffective, null, 2), 'application/json'));
  $('#dl-waivers2').addEventListener('click', () => download('governance-waivers.yaml', val('#waivers-text'), 'text/yaml'));
}

function vrow(row: ReconcileResult['rows'][number]): string {
  const label = row.state === 'waived' ? 'waived' : row.state === 'expired' ? 'expired waiver' : 'live';
  const by = row.waiver ? `<div class="vby">← <b>${esc(row.waiver.id)}</b>${row.waiver.owner ? ' · ' + esc(row.waiver.owner) : ''}${row.waiver.expires ? ' · exp ' + esc(row.waiver.expires) : ''}</div>` : '';
  return `<div class="vrow ${row.state}"><span class="vstate ${row.state}">${label}</span>
    <div class="vmain"><div class="vcode">${esc(row.v.code)}</div><div class="vpath">${esc(ptr(row.v.path))}${row.v.source ? ' · ' + esc(row.v.source) : ''}</div></div>${by}</div>`;
}

function wrow(i: WaiverInfo): string {
  const w = i.waiver;
  const scope = [w.scope?.files?.length ? `files: ${w.scope.files.join(', ')}` : '', w.scope?.path ? `path: ${w.scope.path}` : ''].filter(Boolean).join(' · ') || 'whole ruleset';
  const days = i.daysLeft == null ? 'no expiry' : i.daysLeft < 0 ? `${-i.daysLeft}d ago` : `${i.daysLeft}d left`;
  const tags = [
    w.kind === 'override' ? '<span class="wr-kind override">override</span>' : w.kind === 'exception' ? '<span class="wr-kind">exception</span>' : '',
    w.allowed === false ? '<span class="wr-flag no">not sanctioned</span>' : '',
    w.shareable === false ? '<span class="wr-flag">local-only</span>' : w.shareable === true ? '<span class="wr-flag">shareable</span>' : '',
    w.oneTimeUse ? '<span class="wr-flag">one-time</span>' : '',
  ].filter(Boolean).join('');
  const policy = i.policy.map((p) => `<div class="wr-policy ${esc(p.code)}">⚠ ${esc(p.detail)}</div>`).join('');
  return `<div class="wr ${i.policy.length ? 'breach' : i.status}">
    <div class="wr-top"><span class="wr-id">${esc(w.id)}</span><span class="wr-rule">${esc(w.rule)}</span>
      <span class="wr-status ${i.status}">${i.status}</span>${i.stale ? '<span class="badge-stale">stale</span>' : ''}</div>
    <div class="wr-scope">${esc(scope)}</div>
    ${tags ? `<div class="wr-tags">${tags}</div>` : ''}
    <div class="wr-meta">${w.owner ? `<span>owner <b>${esc(w.owner)}</b></span>` : ''}<span>${esc(w.expires || '—')} · ${days}</span><span>matches <b>${i.matched}</b>${i.sources.length > 1 ? ` in ${i.sources.length} files` : ''}</span>${w.reason ? `<span class="muted">${esc(w.reason)}</span>` : ''}</div>
    ${policy}
  </div>`;
}

function download(name: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function about() {
  const el = document.createElement('div');
  el.id = 'about-modal';
  el.innerHTML = `<div class="about-backdrop"></div><div class="about-card">
    <button class="detail-close" id="about-close">&times;</button>
    <h2>Waivers keep governance honest</h2>
    <p>Every real governance program hits a case where a rule can't be satisfied yet — a legacy endpoint, a deadline, a deliberate deviation. Without a sanctioned way to say so, teams route <em>around</em> governance: they disable the rule globally, delete the CI step, or ignore the report. The rule is gone, and so is the record of why.</p>
    <p>A <strong>waiver</strong> is the honest alternative: a machine-readable exception that names the rule, the exact scope (a file, a path), a <strong>reason</strong>, an <strong>owner</strong>, and an <strong>expiry</strong>. It suppresses that one violation and nothing more — and when it lapses, the violation comes back on its own. A waiver that no longer matches anything is <strong>stale</strong>: the underlying issue was fixed, so the exception should be deleted.</p>
    <p>Paste your <code>spectral lint -f json</code> output and a waivers file; this reconciles them into the <strong>effective</strong> result — the honest set of failures your build should gate on — while surfacing the waivers that are expiring, expired, or stale.</p>
    <p class="muted small">Runs entirely in your browser. Nothing you paste leaves the page.</p>
  </div>`;
  document.body.appendChild(el);
  el.querySelector('#about-close')!.addEventListener('click', () => el.remove());
  el.querySelector('.about-backdrop')!.addEventListener('click', () => el.remove());
}
