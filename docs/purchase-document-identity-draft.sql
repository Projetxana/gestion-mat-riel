-- Additive document identity; old rows retain their IDs and amounts.
-- Apply only after staging and updating clients. Existing RPC remains unchanged.
ALTER TABLE public.bt_purchase_orders ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'order' CHECK (document_kind IN ('order','credit'));
ALTER TABLE public.bt_purchase_orders ADD COLUMN IF NOT EXISTS file_sha256 text CHECK (file_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE public.bt_purchase_orders ADD COLUMN IF NOT EXISTS original_supplier_order_number text;
CREATE UNIQUE INDEX IF NOT EXISTS bt_purchase_document_sha ON public.bt_purchase_orders(company_id,file_sha256) WHERE file_sha256 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bt_purchase_document_reference ON public.bt_purchase_orders(company_id,lower(btrim(supplier)),document_kind,upper(regexp_replace(supplier_order_number,'[[:space:]]+','','g'))) WHERE file_sha256 IS NOT NULL AND btrim(supplier_order_number)<>'';
-- Keep legacy PO uniqueness until the new RPC and all client paths are verified.
-- Signed lines must be constrained by parent document kind, not merely allowed globally.
