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
export type SkuSortBy = 'net_sales' | 'gmv' | 'units_sold' | 'order_count';
export type BatchStatus = 'committed' | 'rolled_back';

export type MappableField =
  | 'shop_name'
  | 'platform_order_id'
  | 'sub_order_id'
  | 'order_time'
  | 'pay_time'
  | 'ship_time'
  | 'finish_time'
  | 'product_id'
  | 'sku_code'
  | 'product_name'
  | 'sku_spec'
  | 'is_gift'
  | 'quantity'
  | 'unit_price'
  | 'gross_amount'
  | 'discount_amount'
  | 'shipping_fee'
  | 'paid_amount'
  | 'refund_amount'
  | 'raw_order_status'
  | 'refund_status'
  | 'province'
  | 'city'
  | 'seller_note'
  | 'buyer_note';

export type ColumnMapping = Partial<Record<MappableField, string | string[]>>;

export interface CanonicalFieldMeta {
  key: MappableField;
  label: string;
  required: boolean;
  hint: string;
}

export const CANONICAL_FIELDS: CanonicalFieldMeta[] = [
  { key: 'platform_order_id', label: '平台订单号', required: true, hint: '主订单号，强制文本保留防科学计数法' },
  { key: 'order_time', label: '下单时间', required: true, hint: '拼多多映射「订单成交时间」（未付款空值自动按单号日期前缀推导）' },
  { key: 'paid_amount', label: '实付/商家应收金额', required: true, hint: '统一按商家实收口径（京东分摊、拼多多商家实收、聚水潭卖家实收、淘宝百亿补贴提取供货单价）' },
  { key: 'quantity', label: '商品数量', required: true, hint: '正整数' },
  { key: 'product_name', label: '商品名称', required: true, hint: '商品名称或 SKU 编码至少需有一项' },
  { key: 'raw_order_status', label: '原始订单状态', required: true, hint: '将按状态字典归一化为 5 种标准状态' },
  { key: 'shop_name', label: '店铺名称', required: false, hint: '聚水潭含此列；无此列时使用上传默认店铺' },
  { key: 'sub_order_id', label: '子订单号', required: false, hint: '缺失时自动按 SKU/商品ID + 同单序号生成行键' },
  { key: 'sku_code', label: 'SKU / 商家编码', required: false, hint: '允许为空（如京东旧机代扣 SKU）' },
  { key: 'product_id', label: '商品ID / SPU', required: false, hint: '平台商品 ID，强制文本格式' },
  { key: 'sku_spec', label: '商品规格/属性', required: false, hint: '颜色、尺码、匹数等规格' },
  { key: 'pay_time', label: '付款时间', required: false, hint: '可选统计时间基准之一' },
  { key: 'ship_time', label: '发货时间', required: false, hint: '仅存档展示，不作为报表日期筛选基准' },
  { key: 'finish_time', label: '完成/签收时间', required: false, hint: '确认收货或交易完成时间' },
  { key: 'unit_price', label: '商品单价/京东价', required: false, hint: '京东整单分摊权重依据（0 元外机分摊 0）' },
  { key: 'gross_amount', label: '应付/商品原价', required: false, hint: '优惠前金额' },
  { key: 'discount_amount', label: '优惠总金额', required: false, hint: '平台/店铺优惠合计' },
  { key: 'shipping_fee', label: '运费', required: false, hint: '邮费或快递费' },
  { key: 'refund_amount', label: '退款金额', required: false, hint: '用于计算净销售额 = GMV - 退款金额' },
  { key: 'refund_status', label: '售后/退款状态', required: false, hint: '平台原始售后状态' },
  { key: 'is_gift', label: '是否赠品', required: false, hint: '赠品标识列' },
  { key: 'province', label: '收货省', required: false, hint: '脱敏保留地域分析字段' },
  { key: 'city', label: '收货市', required: false, hint: '脱敏保留地域分析字段' },
  { key: 'seller_note', label: '商家备注', required: false, hint: '商家内部备注' },
  { key: 'buyer_note', label: '买家留言', required: false, hint: '买家订单备注' },
];

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
  created_at?: string;
  updated_at?: string;
}

export interface ShopInput {
  shop_name: string;
  platform: Platform;
  default_data_source?: DataSource | null;
  is_active?: boolean;
}

export interface MappingTemplateRules {
  prorate_order_amount?: boolean;
  prorate_weight_field?: 'unit_price';
  pii_columns?: string[];
  gross_amount_from_unit_price?: boolean;
  sum_discount_columns?: boolean;
  derive_order_time_from_pdd_order_id?: boolean;
  extract_bybt_supply_price?: boolean;
  infer_full_refund_from_status?: boolean;
}

export interface MappingTemplate {
  id: number;
  code: string;
  name: string;
  data_source: DataSource;
  is_builtin: boolean;
  header_fingerprint: string[];
  column_mapping: ColumnMapping;
  rules: MappingTemplateRules;
  default_platform?: Platform | null;
}

export interface TemplateInput {
  code: string;
  name: string;
  data_source: DataSource;
  header_fingerprint: string[];
  column_mapping: ColumnMapping;
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

export interface StatusMappingInput {
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
  sample_rows: Record<string, string | null>[];
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
  template_id?: number | null;
  template_name_snapshot: string;
  default_shop_id?: number | null;
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

export interface BatchRollbackResponse {
  batch_id: number;
  status: 'rolled_back';
  deleted_rows: number;
  restored_rows: number;
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

export interface OrderLinesFilter {
  time_basis: TimeBasis;
  date_from?: string;
  date_to?: string;
  platform?: Platform[];
  shop_id?: number;
  data_source?: DataSource;
  normalized_status?: NormalizedStatus;
  batch_id?: number;
  keyword?: string;
  page?: number;
  page_size?: number;
}

export interface SummaryReportFilter {
  time_basis: TimeBasis;
  date_from?: string;
  date_to?: string;
  platform?: Platform[];
  shop_id?: number;
  normalized_status?: NormalizedStatus;
  granularity: ReportGranularity;
  group_by: ReportGroupBy;
}

export interface SkuRankingFilter {
  time_basis: TimeBasis;
  date_from?: string;
  date_to?: string;
  platform?: Platform[];
  shop_id?: number;
  normalized_status?: NormalizedStatus;
  sort_by: SkuSortBy;
  page?: number;
  page_size?: number;
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
  { label: string; badge: 'default' | 'processing' | 'success' | 'error' | 'warning'; color: string }
> = {
  pending_pay: { label: '待付款', badge: 'default', color: 'default' },
  paid_unshipped: { label: '已付款待发货', badge: 'processing', color: 'blue' },
  shipped: { label: '已发货', badge: 'processing', color: 'cyan' },
  completed: { label: '已完成', badge: 'success', color: 'green' },
  closed_cancelled: { label: '已关闭/取消', badge: 'error', color: 'red' },
};

export const TIME_BASIS_OPTIONS: { value: TimeBasis; label: string }[] = [
  { value: 'order_time', label: '下单时间' },
  { value: 'pay_time', label: '付款时间' },
];
