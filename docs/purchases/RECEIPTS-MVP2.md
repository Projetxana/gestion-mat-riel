# BuildTrack — Achats / Réceptions + BO (MVP 2, proposed)

**Deployment state:** development-only, not installed in Supabase production. Depends on purchase tables and atomic importers from MVP 1 (PR #39).

## Operational flow
1. A worker taps **Livraison** on the dashboard, selects the active project shown on the delivery slip, takes one or several photos and taps Send.
2. The existing accounting email function is invoked **first**, as before, with project in its subject. Existing destination remains unchanged.
3. After successful accounting email, BuildTrack attempts to insert **only metadata** in `bt_purchase_delivery_notes` for admin review: company, site, photo paths, sender, timestamp and SHA-256 fingerprint of captured bytes. If DB insertion fails, the employee sees a warning that **accounting email succeeded but tracking did not**; never resends email automatically.
4. In **Projet → Achats → Livraisons / BO**, the admin reads the original emailed slip, transcribes PO and received/BO quantities for only the rows visible on that slip, then verifies.
5. The RPC `bt_purchase_verify_delivery` confirms that supplier PO belongs to the same tenant and project as the scanned slip; it rejects already processed slips, wrong-site assignment and cumulative shipped quantities above the order. It commits the shipment lines **atomically** without changing any purchase costs.
6. All scanned notes remain **pending_review** unless explicitly verified. The summary totals only verified shipments; BO is explicit supplier-reported quantity, not the full unshipped balance.

## Explicit limitations (important)
- **No OCR yet**: scanning photographs alone does not read the PO or quantities. The admin enters those while consulting the copy already sent to accounting. OCR/pdf extraction and email intake are next steps after this workflow passes tests.
- No accounting invoices, tax entries, stock or vendor bill payment.
- The current `delivery-notes` Storage bucket and email function still use public attachment URLs. A private document-serving strategy is required before full release. This PR does **not** change bucket permissions or break the accounting handoff.
- Duplicate identical captured JPEG bytes are blocked by a unique SHA-256 fingerprint within a company. Two *new photos* of the same piece of paper have different hashes; admin must still review PO + supplier slip ID. Never claim exact physical-document dedup.
- Employee sees only own scan metadata and only while company membership is active; all order prices and validated line data remain admin-only.
- The SQL migrations are proposals; do not deploy a page that needs the new tables without applying reviewed migrations first.
- A scanned delivery note **does not** contribute to committed spend.

## Security / acceptance criteria
- Correct tenant and active site required for scanning.
- Both stages: PostgreSQL 17 fixture, isolated mocked Auth IDs, RLS for admins/employees/anon/other tenants; attempted cross-project PO linkage rejected.
- Multiscan deliveries accumulate and can complete a partial shipment; `supplier_bo_qty = 0` clears the latest explicit BO.
- Wrong site / duplicate exact scan / same note replay / overdelivery are rejected by SQL constraints or RPC, with transactional rollback.
- UI: iPhone project selection, camera and accounting email still succeed. Check failure case where table is missing: explicit warning must show **without resending** the email.
- Storage policy hardening and user experience with OCR are launch requirements, not deferred silently.

## MVP 3 next
- Automatic extraction of PO, supplier, site and line quantities from PDFs + photographed slips, with human review on low confidence.
- Receive forwarded confirmation emails per site with server-side sender/domain/document validation; route by shipping address, never PO alone.
- Use private, auditable document storage and time-bounded download links.
- Consolidated Hours + Purchases + delivery exceptions in Suivi projets.
