# Mortgage Calculator — QA Audit, Bug Fix & Test Suite Report

**Date:** September 10, 2026
**Scope reviewed:** `calculator.js`, `amortization.js`, `app.js`, `ui.js`, `storage.js`, `scraper.js`, `config.js`, `utils.js`, `index.html`, `mls-proxy.php`, `rates-proxy.php` — the live working copy in your connected `mortgage-calculator` project folder (no ZIP was attached to the conversation; I confirmed with you this is the authoritative source and worked directly against it).
**Method:** Every financial function below was run through Node.js directly against the *actual production `calculator.js`/`amortization.js` modules* — not reimplementations — using independently hand-derived or closed-form expected values (never one function checked against another). 71 automated regression tests were written and now all pass; they're committed to `tests/regression-suite.mjs` in your project folder so you (or CI) can re-run them any time with `node tests/regression-suite.mjs`.

**Update — live browser testing was subsequently performed against `http://127.0.0.1:8888/mortgage-calculator/`.** The note below originally said I had no browser available and had only reviewed code; that's no longer accurate. I ran the actual site in a live browser after the fixes above, and that testing caught a **third bug** — a real one, introduced by my own biweekly fix, that the Node-only regression suite had *not* caught. Full details in a new subsection under Critical Bugs below (**Bug #3**), and in a new "Live Browser Testing" section. The 12 additional tests (59 → 71) were added specifically to cover this class of bug going forward.

---

## Executive Summary

The calculation engine was in noticeably better shape than a generic "mortgage calculator" audit brief usually finds — DTI is already correctly split into gross-income (lender) and take-home (personal-budgeting) tracks with distinct labels and disclaimers, PMI already cuts off cleanly at exactly 20% down, recast math was already correct, and there was no duplicate dead code lurking in `app.js` (a specific "duplicate `closeBookmarkletNeededModal`" bug I was asked to check for does not exist in the current file — likely already cleaned up in an earlier pass).

That said, I found and fixed **two genuine, high-severity financial-correctness bugs**, both in the core amortization engine (`calculator.js`'s `simulatePayoff()`, mirrored in `amortization.js`'s `runAmortizationSchedule()`):

1. **Biweekly payments were modeled as lumpy monthly buckets, not real biweekly periods**, which could make "biweekly" show *more* total interest and a *longer* payoff than plain monthly — backwards from what paying the same money more often can ever actually do.
2. **A loan that couldn't amortize (payment below accrued interest) could have its balance silently frozen, then a fabricated `$0` balance appended to the chart data**, which would show a false payoff. This can't currently be triggered through the live UI's normal input ranges (see below), but it was a real latent bug in the engine, and is now fixed and covered by tests either way.

Both are fixed at the engine level, verified against independent oracles, and now guarded by regression tests. The standard $400,000 / 6.5% / 30-year P&I of **$2,528.27** — the audit's acceptance-criteria number — matches exactly.

Live browser testing (see below) then caught a **third bug**, introduced by my own fix for #1: the detailed amortization schedule (`amortization.html`) could show a *negative* interest dollar amount on the final payoff row in biweekly/accelerated mode. This was not visible from the Node-only test suite — it only surfaced once I actually loaded the rendered schedule table in a browser. It's now fixed, verified live, and covered by 12 new regression tests.

**Is it safe to publish/use?** Yes, with the fixes applied. Before this pass, the biweekly feature specifically was giving financially backwards guidance (showing biweekly as worse than monthly) whenever a user selected non-accelerated biweekly with no other extra payments — that's now correct. Nothing else I found was severe enough to call the calculator unsafe to publish; the rest are UX/robustness improvements.

---

## Critical Bugs

### 1. Biweekly payments aggregated into monthly buckets instead of true 26-period simulation — **FIXED**

- **Severity:** Critical (financial correctness)
- **File / function:** `calculator.js` → `simulatePayoff()` (and mirrored in `amortization.js` → `runAmortizationSchedule()`)
- **The problem:** The old code computed one interest charge per *calendar month* (`balance * monthlyRate`), then applied either 2 or 3 biweekly-sized payments against it depending on the month. Because a 2-payment month's total (`2 × biweeklyPi`) is about **7.7% smaller** than a normal month's P&I, 10 of every 12 months paid down principal *slower* than plain monthly — with only 2 months a year "catching up." Interest only accrued once a month regardless, so this was pure bucketing noise, not a real modeling choice.
- **Reproduction (confirmed against the actual code before the fix):** $400,000 / 6.5% / 30yr. Monthly: $2,528.27 P&I, $510,177.95 total interest, 360 months. Old "biweekly": $1,166.89 payment, **$513,092 total interest, ~362 months** — worse than monthly on both counts, which is impossible for paying the same annual total more frequently.
- **Fix:** Biweekly and accelerated-biweekly modes now run a genuine 26-periods-per-year simulation — interest accrues and principal reduces every two weeks, using a period rate of `annualRate / 26` (the standard "APR ÷ N" biweekly convention). Monthly mode is untouched (it was already correct).
- **Result after fix (same $400k/6.5%/30yr):** True biweekly total interest **$508,856.10** (correctly *lower* than monthly, as it should be) — a small, real, mathematically legitimate benefit from resetting the balance more often, instead of the previous backwards $513,092/362-month result.
- **Accelerated biweekly** (26 half-payments/year = 13 monthly-equivalents/year) was already conceptually right in spirit but shared the same bucketing flaw; it's now also true-period-simulated: **$392,682.25 total interest, ~290 months (24.2 years)** — the expected large acceleration from an extra payment a year.
- Applied consistently to `amortization.js`'s detailed schedule page too (same underlying primitive, see below), so the summary calculator and the printable amortization schedule now agree with each other (previously they used two independently-buggy copies of the same flawed logic).

### 2. Negative-amortization could silently freeze the balance and fabricate a false payoff — **FIXED**

- **Severity:** Critical (data integrity — a false "paid off" is worse than a wrong number)
- **File / function:** `calculator.js` → `simulatePayoff()`
- **The problem:** `Math.max(0, requiredPiThisMonth - interestThisMonth)` clamped principal paid to zero whenever a period's payment didn't cover interest, but the *unpaid interest was never added back to the balance* — it just vanished from the loan's books while still being counted in `totalInterest`. Worse, the code had an unconditional post-loop step commented `"// Ensure final balance is exactly zero"` that appended a `0` to the yearly-balance array whenever the last recorded snapshot was still above the payoff threshold — which is exactly the situation a stuck, non-amortizing loan would be in after exhausting the 1,200-month (100-year) simulation cap. That combination meant a loan that genuinely never paid off could have a fabricated `$0` balance appended to its burndown-chart data, reporting a payoff that never happened.
- **Is this reachable today?** No — and I verified why, rather than assuming it: every payment size this app ever hands to the engine is derived from `calcPIPayment()`, which is mathematically guaranteed to exceed interest-on-principal for any positive rate (that's what "fully amortizing" means). So under the app's current feature set, this could never trigger through the live UI. It was a real, provable defect in the engine itself, though — the kind of thing that becomes very reachable the moment someone adds an interest-only or ARM-teaser-rate feature later — so I fixed it as a correctness issue, not a cosmetic one, and it's now fully covered by regression tests using the exact `$100,000 balance / $8,333 interest / $8,000 payment` example from the audit brief.
- **Fix:**
  - Extracted the payment-vs-interest decision into a small, independently testable pure function, `applyRequiredPayment(balance, periodRate, requiredPayment)`, exported from `calculator.js`. When payment < interest, it now **capitalizes the shortfall onto the balance** (real negative-amortization modeling, per the audit's "or model it correctly" option) instead of freezing it silently.
  - The loop now tracks whether the loan *actually* reached zero (`paidOff: true/false`). The "force a final zero" step only fires when a genuine payoff occurred (e.g., the loan clears mid-year, between two yearly snapshots) — never when the 100-year cap was hit with a real, non-zero, possibly-growing balance still outstanding.
  - `simulatePayoff()`'s return value now includes `paidOff`, `finalBalance`, and `unpaidInterestCapitalized` so any future caller can detect and surface this state rather than trust a number that might be a lie.
  - Regression tests confirm every normal scenario (monthly, biweekly, accelerated, with extra payments and lump sums) has `unpaidInterestCapitalized === 0` and `paidOff === true` — i.e., the fix changes *nothing* about any real-world scenario's numbers; it only closes the false-payoff hole.
- **Not done, and why:** I did not add a UI banner ("Payment is insufficient to amortize this loan") because there is currently no input combination that can trigger this state — building visible UI for an unreachable state would be speculative work against a feature that doesn't exist yet. If you add an interest-only, ARM, or teaser-rate feature in the future, wire its payment into `applyRequiredPayment()`/`simulatePayoff()` and the safety net (plus a UI check on `results.amort30.paidOff`) is already there waiting.

### 3. Amortization schedule could show negative interest on the final payoff row — **FOUND VIA LIVE BROWSER TESTING, FIXED**

- **Severity:** Critical (financial correctness, user-visible)
- **File / function:** `amortization.js` → `runAmortizationSchedule()`
- **How it was found:** Not by the Node regression suite — by actually loading `amortization.html` in a live browser and reading the rendered schedule table near a loan's payoff month. The bug was self-inflicted: it was introduced by my own fix for Critical Bug #1 above (the true-biweekly-period rewrite), and my Node tests at the time were checking totals and boundary math, not scanning every row of a rendered table for an impossible value — a real gap in test design that live testing exposed.
- **The problem:** The new biweekly logic in `amortization.js` runs 2–3 true biweekly sub-periods inside each calendar-month loop iteration. Near payoff, with a small remaining balance (e.g. $30.65), the first sub-period's principal payment (e.g. ~$590.91) was applied without being capped at that sub-period's own balance — driving the running balance deeply negative (e.g. to –$560.26) mid-month. The next sub-period then computed interest on that negative balance, producing a **negative interest dollar amount** (observed live as **–$1.42** on the schedule's final row). `calculator.js`'s own summary-card engine did not have this bug — it already capped principal at the current balance in its single-period loop — so the main calculator's summary numbers were correct throughout; only the detailed `amortization.html` schedule table was affected.
- **Fix:** Each biweekly sub-period's principal payment is now capped at `Math.min(balanceAfterAccrual, requiredPrincipalPaid)`, mirroring the same safeguard `calculator.js` already had, so a sub-period can never drive the balance past zero.
- **Verification:**
  - Re-ran the exact scenario in Node standalone: Month 286 (the affected row) now shows **interest = $0.08**, not negative.
  - Re-ran the full regression suite: 71/71 pass (12 new tests added specifically for this, see Test Coverage).
  - Cross-engine check: `calculator.js` and `amortization.js` now agree to the cent on total interest paid (e.g. $508,856.10 = $508,856.10 for biweekly, $392,682.25 = $392,682.25 for accelerated) — previously off by ~$1.50 due to this bug.
  - **Live re-verification in the browser:** reloaded `amortization.html` for both accelerated and plain (non-accelerated) biweekly modes. Accelerated mode's final row now shows Interest $0.08 / Principal $30.65 / Balance $0.00, and the "Total Interest Paid" figure now matches identically between the main calculator page and the amortization schedule page ($186,524.14 on both, previously mismatched). Plain biweekly mode's full 360-row schedule was also scanned end-to-end (final rows: Month 359 interest $9.56, Month 360 interest $3.75, balance reaching exactly $0.00) — no negative values anywhere in the table.

### Findings from the audit brief that I checked and did **not** find in the current code

- **"Duplicate `closeBookmarkletNeededModal` function in app.js"** — not present. There is exactly one definition (line ~1924) plus a separately-named `closeBookmarkletModal()` for a different modal; a full scan for duplicate top-level function names across every JS file in the project found zero duplicates anywhere. This looks like it was already cleaned up.
- **"Confusing `$-.--` / incomplete-sentence initial state"** — the main calculator's `initializeApp()` loads saved/default data and calls `calculateAll()` synchronously before first paint, so the primary results render real numbers immediately (defaults are the coherent $400k/20%-down/6.5%/5.8% scenario from `config.js`). `$-.--` placeholders do still exist, but only inside optional sub-panels (the "Sell As-Is" comparison box, the rental-offset lines, the Max-Affordability box) that are intentionally collapsed/hidden until the user enters the relevant inputs — that's a deliberate "not configured yet" state, not the broken indefinite-loading state described in the brief.

---

## Calculation Audit

All items below were independently verified by importing the real production functions into Node and comparing against hand-derived/closed-form expected values — not by comparing one function in the codebase against another.

| Area | Function(s) | Result | Notes |
|---|---|---|---|
| Standard P&I | `calcPIPayment` | **PASS** | $400k/6.5%/30yr = $2,528.27, matches closed-form oracle to the cent |
| Zero-interest loan | `calcPIPayment`, `simulatePayoff` | **PASS** | $360k/0%/30yr = exactly $1,000/mo; fully amortizes, $0 total interest |
| PMI 20% boundary | `performCalculations` | **PASS** | 19.99% down → PMI applies; 20.00% and 20.01% → PMI is exactly $0 |
| Biweekly (true) | `simulatePayoff` | **FIXED, now PASS** | Was financially backwards (see Critical Bug #1); now matches an independent 26-period oracle to within a few dollars |
| Amortization schedule rows (detailed page) | `runAmortizationSchedule` | **FIXED, now PASS** | Found via live browser testing (Critical Bug #3): could show negative interest on the payoff row in biweekly/accelerated mode; now capped correctly and cross-checked to the cent against `simulatePayoff`'s totals |
| Accelerated biweekly | `simulatePayoff` | **FIXED, now PASS** | 26 half-payments/yr = 13 monthly-equivalents, confirmed exactly; payoff ≈24.2yr on the $400k/6.5%/30yr case |
| Negative amortization | `applyRequiredPayment`, `simulatePayoff` | **FIXED, now PASS** | Shortfall capitalizes correctly; loop can never fabricate a payoff; unreachable via current UI inputs (see Critical Bug #2) |
| Recast | `calculateRecast`, `calcRemainingBalance` | **PASS** | Balance ↓, payment ↓, rate & remaining term unchanged, across $0/partial/full/over-balance lump sums, early/late in the loan, and both 15yr and 30yr terms; fee correctly netted out of the amount applied to principal |
| Extra monthly / recurring lump sum | `simulatePayoff` | **PASS** | Contractual P&I stays unchanged; payoff date moves earlier; total interest decreases, for both extra-monthly and lump-sum modes |
| DTI (front-end, gross) | `calculateDTI`, `getDTIStatus` | **PASS** | Correctly gated on gross income only |
| DTI (back-end, gross) | `calculateBackEndDTI` | **PASS** | Audit's own worked example ($150k income / $1,000 other debt / $3,000 housing → 32%) reproduced exactly |
| "Net" / take-home ratio | `getDTIStatus(..., isNetIncome)`, UI labels in `ui.js` | **PASS** | Already distinctly labeled ("Housing %", "Total Debts %") vs. the gross-DTI labels ("Housing DTI (Front-End)", "Total Debt DTI (Back-End)"), with an explicit UI caveat: *"lenders still qualify you using gross income."* This already matches the audit's own recommendation (reserve "DTI" for gross, rename the take-home version) — no rename needed |
| PMI formula & boundary | `performCalculations` | **PASS**, labeling **IMPROVED** | Formula and 20% cutoff were already correct; added an "Estimated PMI" framing (see UX Issues) since the formula genuinely is a simplification |
| Sale proceeds | `calculateSaleProceeds` | **PASS** | Full cost breakdown matches independent arithmetic; underwater sale (payoff > value) correctly reports a *negative* net proceeds figure rather than clamping to $0 |
| Cash to close | `calculateCashToClose` | **PASS** | Down payment + closing costs + reserves + extra project cash = total, matches independent sum |
| Max affordability solver | `solveMaxAffordablePrice` | **PASS** | Reverse-solved price, run forward through the *actual* `calcPIPayment`, reproduces the target back-end DTI to within 0.05 points; correctly returns `null` when existing obligations already exceed the target |
| Bridge loan | `calculateBridgeLoanCosts` | **PASS** | Interest-only payment, origination fee, and total holding cost all match independent formulas |
| Rental income offset (double-counting check) | `calculateRentalOffset` | **PASS** | When rent fully covers the departure mortgage, that mortgage is correctly excluded from DTI entirely (not counted twice); when it doesn't, only the *shortfall* counts against DTI — not the full mortgage payment on top of the rent already netted against it |
| HELOC | `calculateRentalHelocCost` | **PASS** | $0 balance → $0 payment; interest-only payment matches `amount × rate ÷ 12`; scales linearly with rate |
| Rounding practice | (codebase-wide) | **PASS** | No round-trip rounding found (searched for the `parseFloat(x.toFixed(n))` pattern and similar) — full-precision floats are carried through every calculation, and `toFixed`/`toLocaleString` are only ever used at final display time |

---

## Live Browser Testing

Performed against `http://127.0.0.1:8888/mortgage-calculator/` (your local dev server) using an actual browser, after all the Node-level fixes above.

**What I did:**
- Loaded the main calculator page and confirmed it renders real, non-placeholder numbers on first paint (no `$-.--` flash).
- Switched the payment-frequency toggle through Monthly → Biweekly (26x) → Accelerated Biweekly and confirmed, live, that: biweekly total interest is *lower* than monthly (not higher, as the pre-fix bug would have shown), and accelerated biweekly shows a substantially larger interest savings and a materially shorter payoff — both directionally and numerically consistent with the Node-verified fix for Critical Bug #1.
- Opened `amortization.html` (the detailed schedule page) in accelerated-biweekly mode and read the full rendered table. This is what surfaced Critical Bug #3 (a –$1.42 interest value on the final payoff row) — a defect that existed only in the rendered schedule, not in the Node test suite's assertions at the time.
- After fixing Bug #3, reloaded `amortization.html` in both accelerated and plain (non-accelerated) biweekly modes and read the schedule tables again end-to-end (all 360 rows scanned in the plain-biweekly case) to confirm no negative interest, principal, or balance values remain anywhere, and that both modes reach exactly $0.00 on their final row.
- Confirmed the main calculator's "Total Interest Paid" figure and the amortization schedule's total now agree to the cent, where before Bug #3 they differed by roughly $1.50.

**What this changes about the earlier draft of this report:** the "Important honesty note" and the Test Coverage section originally said no browser testing was possible in this session and that only the underlying engine had been exercised via Node. That's superseded — live testing was performed, it worked, and it caught a real bug (#3) that the Node suite alone had missed. That's now folded into Critical Bugs, the Calculation Audit is unaffected (the engine-level numbers were already correct), and Test Coverage below reflects the expanded 71-test suite that resulted.

**Not covered by this pass** (still reviewed by reading code only, not exercised live): the property-lookup/Redfin auto-fill flow (requires a real or mocked scrape response I didn't have in the dev environment), recast, sale proceeds, DTI/affordability, bridge loan, HELOC, and rental-offset UI panels, save/share-link round-trips, and mobile/responsive layout. If you'd like those smoke-tested live as well, say the word and I can run through them against the same dev server.

---

## UX Issues

**High**
- **PMI wasn't labeled as an estimate.** The PMI input's tooltip explained what PMI *is* but never said the app's number is a simplified formula. **Fixed:** the tooltip now states the calculation method and that real PMI also depends on credit score, LTV, loan program, and insurer; the payment-breakdown legend now reads **"Est. PMI"** instead of plain "PMI."

**Medium**
- **Two independent amortization engines existed with no shared source of truth.** `calculator.js`'s `simulatePayoff()` and `amortization.js`'s `runAmortizationSchedule()` each had their own copy of the biweekly-bucketing logic — meaning a fix to one wouldn't have reached the other (which is exactly what happened here; both needed the same fix). I extracted the negative-amortization safety net (`applyRequiredPayment`) as a single shared function both engines now call, closing that gap for at least that piece of logic. The two engines still duplicate the surrounding period-stepping logic (necessarily, since one returns yearly chart data and the other returns a full row-by-row table) — worth consolidating further if this app keeps growing, but I didn't attempt a larger refactor given the instruction to improve rather than rewrite.
- **`scraper.js` detected the local-dev-vs-production backend by string-sniffing the response body for a literal `"<?php"` marker** rather than checking `Content-Type`/`response.ok`. **Fixed:** both `fetchPropertyData()` and `fetchRedfinValueOnly()` now gate on `response.headers.get('content-type').includes('application/json')` before attempting to parse, falling through to the existing graceful fallback (address-parsing from the URL, or a clear error) exactly as before for every other case. This is more robust against a backend 500/HTML error page, a different local dev server that doesn't literally echo `<?php`, or a future change in how the PHP source gets served statically.

**Low**
- `rates-proxy.php` doesn't set an explicit `Content-Type: application/json` response header (it still works today because `fetch().json()` doesn't require the header to parse valid JSON, but it's inconsistent with the rest of the backend and worth a one-line fix for correctness).

---

## Security / Reliability

- **Secrets:** No API keys, tokens, or scrape credentials found client-side in any JS file. `scraper.js` explicitly documents (in its own header comment) why it must never call a scrape API directly from the browser, and routes everything through the server-side `backend/property-lookup.php`. `mls-proxy.php` is a retired stub that returns HTTP 410 and points callers at the real endpoint — no active secret-bearing code there. `rates-proxy.php` calls a public, unauthenticated widget URL — nothing sensitive to leak.
- **XSS / unsafe DOM insertion:** I checked every `.innerHTML =` assignment in the codebase (12 sites across `ui.js`, `app.js`, and `amortization.js`). All of them build their HTML from either static template strings or `formatCurrency()`/`.toFixed()`-formatted numbers — never from raw scraped property data or user-typed text. Anywhere scraped/user text is actually inserted (property address, MLS preview details), the code consistently uses `.textContent`, not `.innerHTML` — the correct, safe choice. I found no injection vector here.
- **URL parameters:** `initializeApp()` reads `?price=`, `?taxRate=`, `?hoaFees=`, `?address=`, `?url=`/`?mls=`, and `?share=` from the query string. Numeric ones are always run through `parseFloat`/`isNaN` guards before use; `address` is only ever assigned via `.textContent`; the MLS/share URL values are passed to the existing URL-validation (`looksLikeUrl`) and JSON-decode-with-try/catch paths respectively, both of which fail closed (return `null`/show a generic error) rather than throwing or executing anything.
- **localStorage / share links:** Calculator inputs are explicitly documented as local-only — `storage.js` has a code comment warning against ever reintroducing a shared server-side sync, referencing a real past incident where that leaked one visitor's inputs to every other visitor. The share-link encode/decode (`encodeStateForSharing`/`decodeStateFromSharing`) is pure `JSON.stringify`/`JSON.parse` wrapped in try/catch with a `typeof === 'object'` guard — a malformed or malicious `?share=` value degrades to `null` (ignored) rather than throwing uncaught or executing anything.
- **External API failures:** `fetchMortgageRates()` (live rate loading) and both scraper functions all wrap their `fetch()` calls in try/catch and degrade gracefully — falling back to the previous field value with a soft "⚠ Unavailable" label rather than a hard error, blank field, or `NaN`. `rates-proxy.php` server-side has its own sanity-bounds fallback (rejects any scraped rate outside 3–12% and substitutes a hardcoded fallback) — a genuinely good defensive pattern already in place.
- **Rate limiting:** No client- or server-side rate limiting was evident in the two PHP files I could read (`mls-proxy.php` is a retired stub; the actual scrape endpoint, `backend/property-lookup.php`, lives outside this project folder and wasn't part of what you connected, so I couldn't audit it directly). Worth confirming that endpoint has its own protection given it fronts a paid scraping service.

---

## Performance

- **Debouncing is already in place correctly.** Every input listener calls a shared `debouncedCalculate()` (300ms) rather than recalculating on every keystroke — this is good practice and I want to call it out as something *not* to "fix."
- **`performCalculations()` runs `simulatePayoff()` roughly 6–8 times per calculation pass** (full 30-year and 15-year schedules, each in "monthly-only," "biweekly-only," and "combined" variants, plus baseline comparisons when extras are active) — each a loop of up to 360 months (or up to ~780 biweekly periods now). At 300ms debounce this isn't causing visible lag, but it is meaningfully more work than necessary per keystroke; a few of these calls compute the same baseline schedule repeatedly. **Nice to have:** memoize the zero-extra baseline schedule per term/rate combination so it's computed once per calculation pass instead of up to 3 times.
- No evidence of unnecessary DOM thrashing beyond what I could see from the code (batched updates via `textContent`/`innerHTML` assignment per field, not per-character). I did not instrument actual render timing since I couldn't run a browser in this session — this is a code-reading assessment, not a measured one.

---

## Test Coverage

**71 automated tests**, all passing, committed to `tests/regression-suite.mjs` (run with `node tests/regression-suite.mjs` from the project folder — no dependencies, uses Node's built-in `assert`):

1. Standard mortgage payment — closed-form oracle (2 tests)
2. Zero-interest loan (2 tests)
3. PMI 20% threshold boundary — 19.99% / 20.00% / 20.01%, plus end-to-end `performCalculations` checks (5 tests)
4. Biweekly true-period simulation — payment size, interest vs. monthly, independent 26-period oracle match, correct annual total (4 tests)
5. Accelerated biweekly — payment size, 13 monthly-equivalents/yr, payoff speed, interest savings (4 tests)
6. Negative amortization — the exact $100k/$8,333/$8,000 spec example, payment-equals-interest boundary, normal case, MAX_MONTHS-exhaustion safety net, and confirmation that zero real scenarios ever trigger it (5 tests)
7. Recast — balance/payment/rate/term behavior, $0/partial/full lump sums, fee netting, 15yr late-in-loan case, cross-check against `calcRemainingBalance` (6 tests)
8. Extra principal & recurring lump sum (2 tests)
9. DTI — the audit's own 32% worked example, zero income, zero debt, very high debt (4 tests)
10. Sale proceeds — standard breakdown and underwater sale (2 tests)
11. Cash to close (1 test)
12. Max affordability solver — forward-verified against `calcPIPayment`, null-return edge case (2 tests)
13. Bridge loan & rental offset — double-counting checks (3 tests)
14. HELOC — zero balance, interest-only formula, rate scaling (3 tests)
15. Edge cases — NaN/undefined formatting, zero/negative principal, comma/currency string parsing, down payment exceeding price, 20% interest rate, 1-year term, negative cash cushion (11 tests)
16. Cross-engine consistency — `calculator.js` vs. `amortization.js` agree on total interest for all three payment-frequency modes (3 tests)
17. **Amortization schedule rows — no negative interest/principal/balance near payoff** *(new, added after the live-browser-testing bug find)* — scans every row of the detailed schedule for four different loan scenarios (30yr/15yr, various rates and prices) across all three payment-frequency modes, asserting no row ever shows a negative interest, principal, or balance value, and the final row reaches ~$0.00 (12 tests)

**Live-tested, not just Node-tested:** the main calculator's payment-frequency toggle (Monthly/Biweekly/Accelerated) and the `amortization.html` detailed schedule page were both exercised in an actual browser against a local dev server — see the "Live Browser Testing" section above for what was checked and what it found.

**Still not covered** (reviewed by reading code only, not exercised live): the property-lookup/Redfin auto-fill flow, recast, sale proceeds, DTI/affordability, bridge loan, HELOC, and rental-offset UI panels, save/share-link round-trips, and mobile/responsive layout.

---

## Changes Made

| File | Change |
|---|---|
| `calculator.js` | Rewrote `simulatePayoff()` to run true per-period (26/year) simulation for biweekly/accelerated modes instead of monthly-bucket aggregation; extracted and exported `applyRequiredPayment()` as the single negative-amortization safety net; removed the unconditional "force final balance to zero" step, now gated on an actual `paidOff` flag; added `paidOff`, `finalBalance`, `unpaidInterestCapitalized` to the return value |
| `amortization.js` | Same true-period-simulation fix applied to `runAmortizationSchedule()`'s monthly-row loop (each "month" row now internally runs the correct 2–3 true biweekly sub-periods rather than one bucketed lump payment), now sharing `applyRequiredPayment()` from `calculator.js` instead of a second, independent copy of the flawed logic. **Follow-up fix from live browser testing:** each biweekly sub-period's principal is now capped at that sub-period's own balance (`Math.min(balanceAfterAccrual, requiredPrincipalPaid)`), closing the negative-interest-near-payoff bug described in Critical Bug #3 |
| `scraper.js` | Replaced `"<?php"` string-sniffing with explicit `Content-Type: application/json` checking in both `fetchPropertyData()` and `fetchRedfinValueOnly()`, preserving all existing fallback behavior |
| `index.html` | PMI tooltip now discloses the estimate methodology and its limitations; PMI legend label changed to "Est. PMI" |
| `tests/regression-suite.mjs` *(new)* | 71-test regression suite (59 original + 12 added after the live-testing bug find) covering every item in the audit brief's required test list plus the newly-discovered schedule-row bug class, run directly against the production modules |
| `tests/package.json` *(new)* | Minimal ESM package manifest so the test file resolves `calculator.js`'s `import` statements under Node |

All changes were verified with `node --check` (syntax), the full regression suite (behavior), and — for the amortization.js fix specifically — live re-verification in an actual browser, before being committed back to your project folder. No UI markup, styling, or unrelated logic was touched beyond the two PMI-label edits called out above.

**One delivery-process note, for full transparency:** while doing this update, I found that the copy of `tests/regression-suite.mjs` committed to your project folder after the live-testing fix had a path bug of my own making — it referenced `./calculator.js` instead of `../calculator.js`, which would have made the file fail to run with a module-not-found error if you tried it. I caught this while re-verifying everything for this report update, fixed the import paths, re-ran the full 71-test suite successfully from the correct project-relative path, and re-committed the corrected file. I also diffed `calculator.js`, `amortization.js`, `scraper.js`, and `index.html` against your project folder byte-for-byte to confirm those four are already correct and in sync — only the test file needed this correction.

---

## Remaining Recommendations — Status

All the actionable items below have now been implemented and verified (71/71 regression tests passing, committed to your project folder). Two items remain genuinely open because they're outside what I can do from here.

**Must fix:** None outstanding — both critical bugs (plus the third found via live testing) are fixed and tested.

**Should fix — done:**
- ~~Consolidate the two amortization engines' shared period-stepping logic further~~ — **Done, to the extent it's safely possible.** The two engines can't fully share their outer loop (`simulatePayoff()` needs yearly-snapshot output for the summary charts; `runAmortizationSchedule()` needs one row per calendar month with biweekly sub-period detail for the printable schedule — genuinely different output shapes, not just cosmetic duplication). What *was* pure, literal duplication — the "apply this period's payment, cap the resulting principal at the period's own balance" step, which `amortization.js` had hand-written twice (once for the biweekly sub-loop, once for the plain-monthly branch) — is now a single shared function, `applyCappedPeriodPayment()`, exported from `calculator.js` and used both times in `amortization.js`. This is the exact logic that Critical Bug #3 lived in, so it's now fixed in one place instead of two.
- ~~Add `Content-Type: application/json` header to `rates-proxy.php`~~ — **Done.** One-line addition, verified with `php -l`.
- ~~Defense-in-depth fix in `parseFloatSafe()` to strip a leading `$`~~ — **Done, and expanded slightly.** It now strips both a leading `$` and any `,` before parsing, since testing turned up that bare commas had the same silent-truncation problem (`"650,000"` used to parse to `650`, not `650000`, because native `parseFloat` stops at the first non-numeric character). Both now parse to the full correct number. The existing regression test for this function was updated to assert the new, correct values instead of documenting the old limitation.
- Confirm rate-limiting exists on the actual `backend/property-lookup.php` endpoint — **still open.** That endpoint lives outside the project folder you've connected, so I genuinely can't see or verify it from here. Worth checking directly.

**Nice to have — done:**
- ~~Memoize the repeated zero-extra baseline `simulatePayoff()` calls inside `performCalculations()`~~ — **Done.** Added a small per-call memoization cache (keyed by the full argument tuple, so it's provably safe — `simulatePayoff()` is a pure function) inside `performCalculations()`. In the common case (monthly frequency, no biweekly extra), this eliminates a genuinely redundant duplicate simulation that was happening on every calculation pass; in other cases it's a no-op (cache miss every time), so there's no behavior change, only less repeated work.
- If an interest-only/ARM/teaser-rate feature is ever added, wire a UI warning off the `paidOff`/`unpaidInterestCapitalized` fields — **still open, and intentionally so.** No such feature exists in the app yet, so there's nothing to wire the warning to; the engine-level plumbing (`paidOff`, `finalBalance`, `unpaidInterestCapitalized`) is already in place from the original fix, waiting for that feature if you build it.

### Changes Made (this pass)

| File | Change |
|---|---|
| `calculator.js` | Added `applyCappedPeriodPayment()` (shared step-and-cap primitive for `amortization.js`); added a per-call memoization cache to `performCalculations()` wrapping all 8 of its `simulatePayoff()` calls |
| `amortization.js` | Both the biweekly sub-period loop and the plain-monthly branch in `runAmortizationSchedule()` now call the shared `applyCappedPeriodPayment()` instead of duplicating the cap-at-balance logic |
| `utils.js` | `parseFloatSafe()` now strips a leading `$` and any `,` before parsing |
| `rates-proxy.php` | Added `header('Content-Type: application/json');` |
| `tests/regression-suite.mjs` | Updated the `parseFloatSafe` test to assert the new, correct parsing behavior instead of documenting the old limitation |

All changes verified with `node --check` / `php -l` (syntax) and a full re-run of the 71-test regression suite (behavior — all pass, no numeric outputs changed from these edits, confirming the consolidation and memoization are behavior-preserving). Committed to your project folder.
