# Askable prototypes — two 3-step flows

Static HTML prototypes for unmoderated testing on Askable, served from one address.
The entry page at `/` offers two independent tasks. Both demonstrate carry-through:
what a participant enters on step 1 determines what they see on steps 2 and 3.

| Task | URL | Demonstrates |
| --- | --- | --- |
| A — Open an account | `/onboarding/` | Step 1 answers change which **fields and labels** appear |
| B — What you can borrow | `/calculator/` | Step 1 figures are **calculated forward** into later steps |

Give participants the root URL to let them choose, or link a flow directly to send
them straight in.

## Live

- URL: https://test.marcusg.co
- Host: Lightsail 15.134.89.136, nginx site `test.marcusg.co`, docroot `/var/www/test-proto`
- DNS: **Name.com** (marcusg.co is delegated to `ns1cmt`/`ns2gtx`/`ns3bgq`/`ns4cfn.name.com`,
  not Cloudflare — unlike toddlerknifefight.com and sleeplesspixel.com, which are).
  A record: host `test`, answer `15.134.89.136`. No proxy layer, so certbot HTTP-01 works
  as soon as the record propagates.
- TLS: Let's Encrypt via certbot (`sudo certbot --nginx -d test.marcusg.co`)
- `noindex` is set via meta tag and `X-Robots-Tag`. `Cache-Control: no-store` prevents
  participants receiving a stale step.

## Deploy

```
./deploy.sh
```

rsyncs the directory to `/var/www/test-proto`. No git on the server. `deploy.sh` and
`INSTRUCTIONS.md` are excluded from the upload.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Entry page — the two tasks |
| `app.js` | Shared: namespaced sessionStorage, validation, rehydration, money and loan maths |
| `styles.css` | Shared. All styling. No framework, no build step. |
| `onboarding/index.html` | Task A step 1 — name, email, country, account type |
| `onboarding/step-2.html` | Task A step 2 — fields generated from step 1 answers |
| `onboarding/step-3.html` | Task A step 3 — review, edit links, consent |
| `onboarding/done.html` | Task A confirmation |
| `calculator/index.html` | Task B step 1 — income and expenses, live borrowing estimate |
| `calculator/step-2.html` | Task B step 2 — deposit and price against that estimate |
| `calculator/step-3.html` | Task B step 3 — rate and term, repayments, full trace |

Each flow keeps its own sessionStorage namespace — `proto.signup` and `proto.calc` —
set at the top of every page's inline script. They never collide, so a participant can
run both in one session.

## Task A — how the carry-through works

State lives in `sessionStorage` under the key `proto.signup`. Nothing is sent to a
server; there is no backend. Storage clears when the participant closes the tab, so
each session starts clean.

Two step-1 answers drive everything downstream:

**Account type**

| Chosen | Step 2 asks for |
| --- | --- |
| Personal | Date of birth, mobile, intended uses |
| Business | Business name, registration number, team size, industry, mobile |
| Non-profit | Organisation name, charity registration number, cause area, mobile |

**Country**

| Chosen | Phone prefix | Business reg. label | Non-profit reg. label |
| --- | --- | --- | --- |
| Australia | +61 | ABN | ACNC registration number |
| New Zealand | +64 | NZBN | Charities Services number |
| Somewhere else | None — full number requested | Company registration number | Charity registration number |

Also carried forward: the participant's first name in the step 2 and step 4 headings,
their email quoted in the notification options and confirmation, and their account type
in the step 3 consent wording.

## Task B — how the carry-through works

Step 1 asks for monthly take-home pay, dependants, living expenses, loan repayments and
credit card limit, and computes a borrowing estimate live as they type. The workings are
shown in an expandable panel so a participant can see where the figure came from:

```
take-home pay
  − living expenses
  − $400 per dependant
  − loan repayments
  − 3.8% of the credit card limit
= monthly surplus
  × 90% (safety margin)
= amount committed to repayments
  serviced over 30 years at the rate + 3 percentage point buffer
= borrowing power
```

Step 2 inherits that figure. Deposit raises the spending ceiling dollar for dollar;
property price is checked against it. The page flags going over the limit, and flags
when the loan exceeds 80% of the price (lenders mortgage insurance territory).

Step 3 inherits the loan amount. Interest rate and loan term are the only new inputs;
monthly repayment, total interest and total repaid all recalculate live, and the
repayment is compared back against the surplus from step 1.

All assumptions live in one `ASSUMPTIONS` object in `app.js`, so the borrowing estimate
on step 1 and the repayment on step 3 can never quietly disagree.

Figures are indicative and clearly labelled as such on every step. This is a usability
prototype, not a financial tool, and it gives no advice.

## The research banner

Every page carries a sticky amber bar at the top:

> **Research prototype — not a real service**
> Nothing here is real. Do not enter real personal or financial details.

It stays put on scroll and is marked `role="alert"`. It is there because the
prototypes wear an invented bank's name and ask for date of birth, ABN, income and
deposit — which is structurally what a phishing page looks like. The banner is what
tells a participant, their IT department, or anyone who gets sent the link that it
isn't one.

Do not remove it, and do not let it scroll away. If a flow is restyled, the banner
markup goes back in at the top of `<body>` on every page.

## Behaviours worth testing

- The blue context bar at the top of step 2 restates what was captured on step 1.
- Step 3 links each section back to the step that owns it. Returning repopulates the
  form; nothing is lost.
- Changing account type on step 1 rebuilds step 2 and discards data belonging to the
  abandoned branch, so no stale ABN appears on a personal account.
- Deep-linking to a later step without completing earlier ones redirects to step 1.
- Validation fires on submit only, and clears as soon as a field is corrected.
- Task B recalculates on every keystroke, so cause and effect are visible without
  submitting. Worth watching whether participants notice the figure moving.
- Task B blocks continuing when the numbers do not work — no surplus on step 1, or a
  price beyond reach on step 2 — with an inline explanation rather than a dead button.

## Resetting between pilot runs

"Start over" in the footer of every page clears storage and returns to step 1.
Closing the tab does the same.

## Local development

```
python3 -m http.server 8899
```

Then open http://127.0.0.1:8899.

## Known limits

- No data is captured. Askable's session recording is the only record of what
  participants entered. If response capture is needed later it requires a backend.
- Field validation is presence and email-format only. Registration numbers are not
  checked against real formats.
