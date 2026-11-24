# 08: Frontend Standardized Order Query & Summary Report Export Screens

**Owner:** Antigravity (frontend)
**Blocked by:** 02: Frontend Scaffold, Contract Types & Interactive UI Prototype (live integration blocked by 06)
**Status:** ready-for-agent

**What to build:**
Implement production `/orders` (multi-dimension filter bar, paginated standardized **Order Lines** table with expandable `raw_extra` drawer, Excel/CSV export) and `/reports` (top KPI strip, `Time × Platform/Shop` & `Product/SKU Ranking` tabs, `order_time`/`pay_time` switch, and single/dual-sheet Excel export) following the user-approved visual design from Ticket 02.

- [ ] Both `/orders` and `/reports` expose `Time Basis` strictly as `下单时间 (order_time)` and `付款时间 (pay_time)` — never `ship_time`.
- [ ] `/orders` supports filtering by date range, **Platform**, **Shop**, **Data Source**, **Normalized Order Status**, **Import Batch**, and order/SKU/product keyword; shows prorated-amount badge, normalized + raw status, and an inspectable `raw_extra` JSON drawer; triggers browser file download for `.xlsx` and `.csv`.
- [ ] `/reports` displays KPI cards (**GMV**, **Refund Amount**, **Net Sales**, **Order Count**, **Units Sold**), toggles granularity (`day`/`week`/`month`) and grouping (`platform`/`shop`), switches to **Product/SKU Ranking**, and exports `.xlsx` with optional `include_detail_sheet` toggle.
- [ ] Vitest + React Testing Library tests verify `Time Basis` options, KPI formatting, filter query serialization, and export trigger behavior.
