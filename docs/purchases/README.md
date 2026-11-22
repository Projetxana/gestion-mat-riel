# BuildTrack — Achats / budget, MVP 1 (proposed, not deployed)

## Business rules (agreed with operations)
- The original job estimate supplies a **baseline material budget**; it is imported once and never silently overwritten.
- Supplier **order confirmations** add pre-tax purchase commitments by supplier + PO (PO does **not** identify a job).
- The **shipping project name/address** determines the intended job. For this MVP, a company administrator explicitly selects/verifies the job; automatic recognition and email reception are next.
- **Delivery slips** compare shipped/received quantities against orders. They do **not** create purchases or change committed costs. BO is separate from simply not-yet-received quantities.
- No invoices, accounting, stock valuation, payables or tax collection.
- All purchase pricing is admin-only and tenant-isolated; employees will later be allowed only to submit delivery slips and view logistics as appropriate.

## Implemented in this branch
- Purchase budget panel embedded in `/sites/:id` (reachable from **Suivi des projets**).
- Template-based **CSV/XLS/XLSX import** of baseline material lines and confirmation lines.
- Preview totals, atomic budget import and immutable baseline UI.
- Supplier + PO + order number + shipping project manual verification and duplicate PO prevention.
- Read-only committed amount, baseline amount and uncommitted budget.
- SQL proposal: four isolated RLS-protected purchase tables and two atomic invoker RPCs.
- Unit tests for monetary parsing, tenant-scoped project matching, aliases, PO normalization, invalid rows and totals.

### Import template
One row per *material* article, with headers:
`Code;Description;Quantite;Unite;Prix unitaire;Montant`

Store all prices **pre-tax in CAD**. `Montant` is the supplier/estimator net line amount; when missing, it is computed as quantity × unit price. Exclude global **PRIX FIXE**, labor, subcontracts, discounts/adjustments not attributable to material, and subtotal/total rows. Do not blindly import the provided Orélis PDF total, as its report contains other categories and negative fixed-price lines.

This version intentionally **does not claim PDF extraction**. The real sample files are multi-page PDFs with text/order units and require a separate extraction + human preview workflow. It also does not modify existing delivery-slip scanning or the current bookkeeping email.

## Release gate / migration
The SQL in `migrations/bt_purchases_mvp1_PROPOSED.sql` is **NOT applied** by creating or merging this GitHub branch. It must be tested in an **isolated Supabase branch** (two tenants, admin and employee) before any production rollout.

1. Test schema creation on an isolated branch with representative `sites`, `companies`, `company_users`.
2. Verify authenticated employee cannot SELECT or INSERT **any purchase prices**, nor call the import RPC.
3. Verify admin A cannot access budget/order rows in tenant B, including by tampering with company/site IDs.
4. Verify one initial budget per site, atomic rollback for invalid rows, duplicate PO rejection across jobs within one company, and preservation of documents on failure.
5. Validate secure retention of purchase documents; do not use a public Storage bucket or insert files into email HTML.
6. Apply reviewed migration to production first, then deploy the UI branch. Confirm `/sites/:id` responsive on iPhone; preserve hours, IPMO, delivery-slip email and existing records.
7. Validate final cross-project matching in the incoming-email pipeline before enabling automation.

## Next increments
**MVP 2:** Inbound email address/alias per project with server-side email/attachment validation; PDF text extraction, store attachments privately, trust supplier + PO + shipping project name only after confidence checks; detect duplicates by (company, supplier, PO) and immutable document digest.

**MVP 3:** Adapt existing `DeliveryNoteModal`: infer current job where safe, allow job correction, retain the accounting email, persist one multi-page slip privately, extract PO/quantity ordered/shipped/BO, match to known order, deduplicate slip by supplier + document number/hash, aggregate deliveries. Unrecognized PO or project => admin review queue, **never** automatic financial update. Notify only partial shipment / true BO / unrecognized slip; do not price deliveries.

**Consolidation:** surface committed material totals and exceptions beside verified hours/IPMO in the executive project monitoring dashboard, with explicit indication that committed purchases are **not** final material forecast.

## Existing integration and caution
The current `src/components/DeliveryNoteModal.jsx` already takes multiple photos and invokes `send-email` to forward them to accounting. It currently uploads to `delivery-notes` and calls `getPublicUrl()`. The next increment should protect those documents with private signed access and ensure any migrated email path is tested before replacing the working operational flow.

Avoid merging the entire active `hotfix/admin-production` branch into `main` simply to release this feature; the branch history contains unrelated unfinished work.
