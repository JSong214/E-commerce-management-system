# SJH-DATA

E-commerce sales data management and analytics platform for unifying, validating, storing, and exporting multi-platform sales reports.

## Language

### Data Ingestion

**Data Source**:
The system or portal from which a raw Excel/CSV export file was downloaded (`taobao`, `tmall`, `douyin`, `jd`, `pdd`, `jushuitan`). Distinct from **Platform**, because an ERP source (`jushuitan`) can export orders originating from multiple sales platforms.
_Avoid_: Channel, origin, platform (when referring to the export file's system)

**Platform**:
The e-commerce marketplace where the customer placed the order (`taobao`, `tmall`, `douyin`, `jd`, `pdd`).
_Avoid_: Data source, portal

**Shop**:
A specific merchant store operating on one **Platform** (e.g., "旗舰店-天猫"). A shop's orders may be exported either directly from its platform backend or via `jushuitan` ERP; each shop maps to exactly one **Platform** via the shop-platform mapping table.
_Avoid_: Account, store_account

**Mapping Template**:
A reusable column-mapping configuration that translates raw column headers of a **Data Source** export into canonical **Order Line** fields. Includes built-in presets per source and user-saved custom templates.
_Avoid_: Schema config, import profile

**Import Batch**:
A single file upload and ingestion execution tracked with its source, template, validation summary, row counts, and rollback state.
_Avoid_: Upload job, import task, file record

**Batch Rollback**:
Reverting an **Import Batch** by deleting rows it newly inserted and restoring rows it updated via Upsert back to their pre-batch state. Allowed in reverse chronological order for conflicting batches to prevent cross-batch corruption.
_Avoid_: Batch delete, undo upload

### Core Sales Data

**Order Line**:
The canonical fact record representing one product/SKU line item within an e-commerce order. Non-PII unmapped source columns are preserved in `raw_extra` alongside standardized columns; buyer PII (name, phone, street address) is stripped prior to storage.
_Avoid_: Sub-order row, sale item, raw record

**Line Key**:
The deterministic identifier distinguishing each **Order Line** within the same `(Platform, platform_order_id)`. Uses `sub_order_id` when exported by the source; otherwise falls back to a stable composite of product/SKU identifier and intra-order sequence index so multi-row orders (split shipments, accessories, gifts) never overwrite each other.
_Avoid_: Row ID, composite key, dedup key

**Order-Level Amount Proration**:
The cleaning transformation applied when a source (notably JD) repeats the order-level total payment on every **Order Line** of a multi-item order. The unique order total is distributed across lines proportionally by `unit_price * quantity` (0-priced accessory/gift lines receive `0.00`), with any rounding remainder absorbed by the last weighted line so line sums exactly equal the order total.
_Avoid_: Amount splitting, revenue allocation

**Normalized Order Status**:
The unified 5-value order lifecycle state mapped from platform-specific status labels: `pending_pay`, `paid_unshipped`, `shipped`, `completed`, and `closed_cancelled`. The original platform status string is retained for reference.
_Avoid_: Order state, status code

### Sales Metrics & Reporting

**Time Basis**:
The timestamp field used to filter and group sales reports: `order_time` (default) or `pay_time`. `ship_time` is excluded from report date filters because not all platforms export it.
_Avoid_: Date dimension, report date

**GMV**:
Total valid transaction amount, calculated as the sum of `paid_amount` across **Order Lines** excluding `pending_pay` and pre-payment cancellations.
_Avoid_: Gross sales, total revenue, order total

**Refund Amount**:
Total refunded value, calculated as the sum of `refund_amount` attributed to the matching **Order Line** under the selected **Time Basis**.
_Avoid_: Returns, refund total

**Net Sales**:
Actual retained sales after refunds, calculated as `GMV - Refund Amount`.
_Avoid_: Net revenue, net GMV, actual sales

**Order Count**:
Number of valid unique orders, calculated as `COUNT(DISTINCT platform_order_id)` (never raw **Order Line** row count).
_Avoid_: Line count, transaction count

**Units Sold**:
Total product quantity sold, calculated as the sum of `quantity` across valid **Order Lines**.
_Avoid_: Sales volume, item count
