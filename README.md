# Governance Waivers

A browser-first tool for **sanctioned, owned, expiring API governance exceptions**. Author a
machine-readable waivers file and reconcile it against Spectral lint output: genuinely waived
violations are suppressed, while **expired**, **stale**, and **expiring** waivers surface — so
teams stop routing *around* governance. No backend, no accounts; runs entirely in your
browser. Live at **[waivers.apicommons.org](https://waivers.apicommons.org)**.

Every real governance program hits a case where a rule can't be satisfied yet — a legacy
endpoint, a deadline, a deliberate deviation. Without a sanctioned way to say so, teams route
*around* governance: they disable the rule globally, delete the CI step, or ignore the report.
The rule is gone, and so is the record of why. A **waiver** is the honest alternative.

Part of the [API Commons](https://apicommons.org/tools/) tools, alongside
[API Validator](https://github.com/api-commons/api-validator),
[Governance Coverage](https://github.com/api-commons/governance-coverage),
[Spectral Reporter](https://github.com/api-commons/spectral-reporter), and
[Governance Pipeline Auditor](https://github.com/api-commons/governance-pipeline-auditor).

## The waiver

A waiver is a small, machine-readable record — rule + optional scope + a reason, owner, and
expiry:

```yaml
version: "0.1"
waivers:
  - id: WVR-001
    rule: operation-tags
    scope:
      files: ["apis/legacy/**"]         # optional file glob(s)
      path: "$.paths['/v1/legacy'].*"   # optional JSONPath / JSON-Pointer prefix
    reason: Legacy endpoint predates our tagging standard; tracked in JIRA-482.
    owner: team-billing
    ticket: https://example.atlassian.net/browse/JIRA-482
    granted: "2026-05-01"
    expires: "2026-12-01"
```

`scope` is optional and precise: a waiver can cover a rule everywhere, only in certain files,
or only under a specific path — so waiving `operation-tags` on `/v1/legacy` does **not** hide a
new `operation-tags` violation on `/invoices`.

## What it does

Paste your `spectral lint -f json` output and a waivers file, and it reconciles them:

- **Violations** are classified **waived** (an active waiver covers it — suppressed),
  **live** (no waiver — fails the gate), or **expired** (a waiver *used* to cover it but has
  lapsed, so it resurfaces).
- **Waivers** are classified **active**, **expiring** (within 30 days), **expired**,
  **permanent** (no expiry — a smell), and **stale** (matches nothing anymore — the issue was
  fixed, so delete it).
- The headline is the **effective result** — the honest set of failures after sanctioned
  waivers, which is what your build should actually gate on. Download it as filtered Spectral
  JSON.

You can author waivers in the tool (a small form appends to the file) and download the result,
or bring an existing waivers file.

## Develop

```bash
npm install
npm run dev
npm run build     # → dist/
```

Pure client-side; no data build. The samples in `public/` demonstrate every waiver state.

## Privacy

Everything runs client-side. The lint results and waivers you paste never leave the page —
there is no server.

---

**Governance guidance** — the human *why* behind exceptions:
[Accountability](https://guidance.apievangelist.com/store/accountability/) and
[Rules](https://guidance.apievangelist.com/store/rules/) at guidance.apievangelist.com.

A project of [API Evangelist](https://apievangelist.com), maintained openly under
[API Commons](https://apicommons.org). Free to fork; API Evangelist offers expert API
governance services — including standing up a real exceptions process — when you want help.
Apache-2.0.
