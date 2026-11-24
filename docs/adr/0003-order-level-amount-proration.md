---
status: accepted
---

# Order-Level Amount Proration & Line Key Strategy (JD Multi-Row Orders)

When a **Data Source** (specifically JD merchant exports) repeats the entire order's `paid_amount` on every **Order Line** of a multi-item order (e.g., an air-conditioner indoor unit paired with a `0.00`-priced outdoor unit or multi-item cart), naive line summation double-counts revenue. We therefore support a template-level `prorate_order_amount` rule that detects multi-line orders, extracts the unique order total once, and prorates `paid_amount` across lines by `unit_price * quantity` (assigning `0.00` to `0`-priced accessory/gift rows and assigning rounding cent remainders to the last positive-weight line; falling back to quantity weights only if all unit prices are zero).

Additionally, because JD and ERP exports can contain multiple lines with the same SKU under one order (split warehouses, accessories, gifts) without a platform `sub_order_id`, we identify each line by `(platform, platform_order_id, line_key)` where `line_key` uses `sub_order_id` if present, or `{product_or_sku_id}#{intra_order_occurrence_index}` in deterministic file order. Numeric parsers also sanitize trailing Chinese annotations (such as JD's `2449.00（系统计算中，该值仅供参考）`) before decimal conversion.
