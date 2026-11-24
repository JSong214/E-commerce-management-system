/**
 * SJH-DATA Phase 1 API & Domain Contract Types
 * Mirrors docs/contracts/phase1-api-and-schema.md and GLOSSARY.md.
 */

export type DataSource =
  | 'taobao'
  | 'tmall'
  | 'douyin'
  | 'jd'
  | 'pdd'
  | 'jushuitan'
  | 'custom';

export type Platform = 'taobao' | 'tmall' | 'douyin' | 'jd' | 'pdd' | 'other';

export type NormalizedStatus =
  | 'pending_pay'
  | 'paid_unshipped'
  | 'shipped'
  | 'completed'
  | 'closed_cancelled';

/** Report & Query Time Basis — ship_time is intentionally excluded. */
export type TimeBasis = 'order_time' | 'pay_time';

export type DuplicateStrategy = 'upsert' | 'skip';

export type ReportGranularity = 'day' | 'week' | 'month';
export type ReportGroupBy = 'platform' | 'shop' | 'none';
export type BatchStatus = 'committed' | 'rolled_back';

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface Shop {
  id: number;
  shop_name: string;
  platform: Platform;
  default_data_source?: DataSource | null;
  is_active: boolean;
}

export interface MappingTemplateRules {
  prorate_order_amount?: boolean;
  prorate_weight_field?: string;
  pii_columns?: string[];
}

export interface MappingTemplate {
  id: number;
  code: string;
  name: string;
  data_source: DataSource;
  is_builtin: boolean;
  header_fingerprint: string[];
  column_mapping: Record<string, string | string[]>;
  rules: MappingTemplateRules;
  default_platform?: Platform | null;
}

export interface StatusMapping {
  id: number;
  data_source: DataSource | '*';
  raw_status: string;
  normalized_status: NormalizedStatus;
  is_valid_for_gmv: boolean;
}

export interface ParsePreviewResponse {
  staged_file_id: string;
  file_name: string;
  file_encoding: string;
  sheets: string[];
  selected_sheet: string;
  total_rows: number;
  headers: string[];
  sample_rows: Record<string, string>[];
  matched_template: {
    id: number;
    code: string;
    name: string;
    data_source: DataSource;
    match_score: number;
    needs_default_shop: boolean;
  } | null;
  pii_columns_detected: string[];
}

export interface ValidationErrorItem {
  row_number: number;
  field_name: string;
  raw_value: string | null;
  error_code: string;
  error_message: string;
}

export interface ValidationWarningItem {
  row_number: number;
  field_name: string;
  message: string;
}

export interface ValidateResponse {
  validation_id: string;
  summary: {
    total_rows: number;
    valid_rows: number;
    error_rows: number;
    warning_rows: number;
    estimated_inserts: number;
    estimated_updates: number;
    prorated_orders: number;
  };
  unknown_shops: string[];
  unknown_statuses: string[];
  errors_preview: ValidationErrorItem[];
  warnings_preview: ValidationWarningItem[];
  cleaned_sample_rows: Partial<OrderLine>[];
}

export interface ImportCommitResponse {
  batch_id: number;
  batch_no: string;
  status: BatchStatus;
  total_rows: number;
  valid_rows: number;
  inserted_rows: number;
  updated_rows: number;
  skipped_rows: number;
  error_rows: number;
}

export interface ImportBatch {
  id: number;
  batch_no: string;
  file_name: string;
  sheet_name?: string | null;
  file_encoding?: string | null;
  data_source: DataSource;
  template_name_snapshot: string;
  duplicate_strategy: DuplicateStrategy;
  status: BatchStatus;
  total_rows: number;
  valid_rows: number;
  inserted_rows: number;
  updated_rows: number;
  skipped_rows: number;
  error_rows: number;
  warning_rows: number;
  created_at: string;
  rolled_back_at?: string | null;
  can_rollback: boolean;
  blocking_batches: string[];
}

export interface OrderLine {
  id: number;
  platform: Platform;
  shop_id: number;
  shop_name: string;
  data_source: DataSource;
  platform_order_id: string;
  sub_order_id?: string | null;
  line_key: string;
  order_time: string;
  pay_time?: string | null;
  ship_time?: string | null;
  finish_time?: string | null;
  product_id?: string | null;
  sku_code?: string | null;
  product_name: string;
  sku_spec?: string | null;
  is_gift: boolean;
  quantity: number;
  unit_price?: string | null;
  gross_amount?: string | null;
  discount_amount: string;
  shipping_fee: string;
  paid_amount: string;
  is_amount_prorated: boolean;
  refund_amount: string;
  raw_order_status: string;
  normalized_status: NormalizedStatus;
  is_valid_for_gmv: boolean;
  refund_status?: string | null;
  province?: string | null;
  city?: string | null;
  seller_note?: string | null;
  buyer_note?: string | null;
  raw_extra: Record<string, unknown>;
  first_batch_id: number;
  last_batch_id: number;
}

export interface ReportKpi {
  gmv: string;
  refund_amount: string;
  net_sales: string;
  order_count: number;
  units_sold: number;
}

export interface SummaryReportRow {
  period: string;
  platform?: Platform | null;
  shop_id?: number | null;
  shop_name?: string | null;
  gmv: string;
  refund_amount: string;
  net_sales: string;
  order_count: number;
  units_sold: number;
}

export interface SkuRankingRow {
  sku_code: string | null;
  product_id: string | null;
  product_name: string;
  platform: Platform;
  gmv: string;
  refund_amount: string;
  net_sales: string;
  order_count: number;
  units_sold: number;
}

export const PLATFORM_META: Record<Platform, { label: string; color: string }> = {
  taobao: { label: '淘宝', color: '#ff6a00' },
  tmall: { label: '天猫', color: '#cf1322' },
  douyin: { label: '抖音', color: '#1f2329' },
  jd: { label: '京东', color: '#e1251b' },
  pdd: { label: '拼多多', color: '#e02e24' },
  other: { label: '其他', color: '#64748b' },
};

export const DATA_SOURCE_META: Record<DataSource, { label: string; color: string }> = {
  taobao: { label: '淘宝后台', color: 'orange' },
  tmall: { label: '天猫后台', color: 'red' },
  douyin: { label: '抖音抖店', color: 'default' },
  jd: { label: '京东后台', color: 'volcano' },
  pdd: { label: '拼多多后台', color: 'magenta' },
  jushuitan: { label: '聚水潭 ERP', color: 'blue' },
  custom: { label: '自定义来源', color: 'purple' },
};

export const NORMALIZED_STATUS_META: Record<
  NormalizedStatus,
  { label: string; color: string }
> = {
  pending_pay: { label: '待付款', color: 'default' },
  paid_unshipped: { label: '已付款待发货', color: 'processing' },
  shipped: { label: '已发货', color: 'cyan' },
  completed: { label: '已完成', color: 'success' },
  closed_cancelled: { label: '已关闭/取消', color: 'error' },
};

export const TIME_BASIS_OPTIONS: { value: TimeBasis; label: string }[] = [
  { value: 'order_time', label: '下单时间' },
  { value: 'pay_time', label: '付款时间' },
];
