/**
 * SJH-DATA V2 Slice 1 API & Domain Contract Types
 * Mirrors docs/contracts/v2-master-and-sales-ingestion.md.
 */

import type { DataSource, ModelCandidate, OrderLine, Platform, Shop, ShopAlias } from './phase1';

export type SourceRole = 'direct_sales' | 'erp_enrich' | 'erp_independent_sales';
export type OperatorType = 'self_operated' | 'agency_operated';
export type SalesMode = 'dealer' | 'distribution' | 'hybrid';
export type ShopStatus = 'active' | 'dormant' | 'inactive';
export type UnitType = 'indoor' | 'outdoor';
export type ChannelType =
  | 'jst_i_id'
  | 'jst_sku_id'
  | 'pdd_sku_id'
  | 'tb_sku_id'
  | 'tm_sku_id'
  | 'dy_sku_id'
  | 'jd_sku_id'
  | 'merchant_code'
  | 'custom_title';
export type MatchSource = 'excel_import' | 'manual' | 'learned_from_review';
export type ModelMatchStatus = 'matched' | 'ambiguous' | 'unmatched' | 'manual_confirmed';
export type EligibilityStatus = 'valid' | 'excluded' | 'needs_review';
export type EffectiveTimeBasis = 'business_time' | 'order_time' | 'pay_time';

export interface ShopSummary {
  total: number;
  active: number;
  dormant: number;
  inactive: number;
  erp_sales_enabled: number;
}

export interface ShopListResponse {
  items: Shop[];
  summary: ShopSummary;
}

export interface ShopFilterParams {
  platform?: Platform;
  operator_type?: OperatorType;
  sales_mode?: SalesMode;
  shop_status?: ShopStatus;
  erp_sales_enabled?: boolean;
  keyword?: string;
}

export interface ShopsExcelImportResult {
  total_rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

export interface ProductCategory {
  id: number;
  business_segment: string;
  category: string;
  brand: string;
  report_brand?: string | null;
}

export interface ProductCategoryInput {
  business_segment: string;
  category: string;
  brand: string;
  report_brand?: string | null;
}

export interface ProductUnitComponent {
  id: number;
  model_id: number;
  component_model: string;
  unit_type: UnitType;
  mapping_value?: string | null;
}

export interface ProductUnitComponentInput {
  component_model: string;
  unit_type: UnitType;
  mapping_value?: string | null;
}

export interface ProductChannelMapping {
  id: number;
  model_id: number;
  standard_model?: string;
  brand?: string;
  category?: string;
  channel_type: ChannelType;
  external_id: string;
  secondary_external_id: string;
  shop_scope_id: number;
  shop_scope_name?: string | null;
  match_source: MatchSource;
  is_active: boolean;
  is_ambiguous: boolean;
  conflict_models?: ModelCandidate[];
}

export interface ProductChannelMappingInput {
  model_id: number;
  channel_type: ChannelType;
  external_id: string;
  secondary_external_id?: string;
  shop_scope_id?: number;
  match_source?: MatchSource;
  is_active?: boolean;
}

export interface ProductModel {
  id: number;
  standard_model: string;
  category_id?: number | null;
  business_segment: string;
  category: string;
  brand: string;
  is_3c_full_name: boolean;
  is_active: boolean;
  notes?: string | null;
  component_count: number;
  mapping_count: number;
  has_ambiguous_mapping: boolean;
  components: ProductUnitComponent[];
  channel_mappings: ProductChannelMapping[];
}

export interface ProductModelInput {
  standard_model: string;
  business_segment: string;
  category: string;
  brand: string;
  is_3c_full_name?: boolean;
  is_active?: boolean;
  notes?: string | null;
}

export interface ProductModelsSummary {
  total_categories: number;
  total_models: number;
  total_components: number;
  total_channel_mappings: number;
  ambiguous_id_groups: number;
}

export interface ProductModelsResponse {
  items: ProductModel[];
  total: number;
  page: number;
  page_size: number;
  summary: ProductModelsSummary;
}

export interface AmbiguousGroup {
  channel_type: ChannelType;
  external_id: string;
  candidate_models: ModelCandidate[];
}

export interface ChannelMappingsResponse {
  items: ProductChannelMapping[];
  total: number;
  ambiguous_groups: AmbiguousGroup[];
}

export interface ProductsExcelImportResult {
  categories: { inserted: number; updated: number };
  models: { inserted: number; updated: number };
  components: { inserted: number; updated: number };
  channel_mappings: { inserted: number; updated: number };
  ambiguous_conflicts: {
    channel_type: ChannelType;
    external_id: string;
    models: string[];
  }[];
  warnings: string[];
}

export interface SalesRule {
  rule_key: string;
  rule_name: string;
  rule_group: string;
  enabled: boolean;
  config_json: Record<string, unknown>;
  description: string;
  updated_at?: string;
}

export interface EffectiveSalesRecord {
  id: number;
  platform: Platform;
  shop_id: number;
  shop_name: string;
  business_order_id: string;
  record_key: string;
  source_role: SourceRole;
  primary_data_source: DataSource;
  source_order_line_ids: number[];
  business_time: string;
  order_time: string;
  pay_time?: string | null;
  model_id?: number | null;
  standard_model?: string | null;
  brand?: string | null;
  category?: string | null;
  business_segment?: string | null;
  model_match_status: ModelMatchStatus;
  model_match_method?: string | null;
  model_match_candidates?: ModelCandidate[] | null;
  raw_product_summary?: string | null;
  sales_quantity: number;
  sales_amount: string;
  amount_source: string;
  eligibility_status: EligibilityStatus;
  exclusion_reason?: string | null;
  notices?: string[] | null;
  province?: string | null;
  city?: string | null;
  raw_order_status: string;
  erp_enriched: boolean;
  last_batch_id: number;
}

export interface EffectiveSalesDetail extends EffectiveSalesRecord {
  source_order_lines: OrderLine[];
}

export interface EffectiveSalesKpi {
  total_records: number;
  valid_records: number;
  valid_sales_quantity: number;
  valid_sales_amount: string;
  excluded_records: number;
  needs_review_records: number;
  pending_model_records: number;
}

export interface EffectiveSalesFilter {
  time_basis: EffectiveTimeBasis;
  start_date?: string;
  end_date?: string;
  platform?: Platform;
  shop_id?: number;
  brand?: string;
  category?: string;
  business_segment?: string;
  standard_model?: string;
  eligibility_status?: EligibilityStatus | 'all';
  model_match_status?: ModelMatchStatus | 'pending' | 'all';
  source_role?: SourceRole;
  batch_id?: number;
  keyword?: string;
  page?: number;
  page_size?: number;
}

export interface EffectiveSalesListResponse {
  items: EffectiveSalesRecord[];
  total: number;
  page: number;
  page_size: number;
  kpi: EffectiveSalesKpi;
}

export interface PendingModelGroup {
  group_key: string;
  data_source: DataSource;
  platform: Platform;
  shop_id: number;
  shop_name: string;
  channel_type?: ChannelType | null;
  external_id?: string | null;
  secondary_external_id: string;
  raw_model_hint?: string | null;
  raw_product_summary?: string | null;
  model_match_status: 'ambiguous' | 'unmatched';
  candidates: ModelCandidate[];
  affected_record_count: number;
  valid_record_count: number;
  total_sales_amount: string;
  sample_record_ids: number[];
}

export interface PendingModelListResponse {
  groups: PendingModelGroup[];
  total_groups: number;
  total_pending_records: number;
  ambiguous_records: number;
  unmatched_records: number;
}

export interface PendingModelFilter {
  status?: 'ambiguous' | 'unmatched' | 'all';
  platform?: Platform;
  shop_id?: number;
  data_source?: DataSource;
  eligibility_status?: 'valid' | 'all';
  keyword?: string;
  page?: number;
  page_size?: number;
}

export interface ResolveModelRequest {
  record_ids?: number[];
  group_filter?: {
    data_source: DataSource;
    shop_id: number;
    channel_type?: ChannelType | null;
    external_id?: string | null;
    secondary_external_id?: string;
    raw_product_summary?: string | null;
  };
  model_id: number;
  save_as_mapping_rule: boolean;
  rule_scope?: 'shop' | 'global';
}

export interface ResolveModelResponse {
  resolved_effective_records: number;
  resolved_order_lines: number;
  saved_mapping_id: number | null;
  retroactively_resolved_records: number;
}

export type { ShopAlias };

export const SOURCE_ROLE_META: Record<SourceRole, { label: string; color: string; desc: string }> = {
  direct_sales: {
    label: '平台直出销售',
    color: 'blue',
    desc: '权威销售来源，直出金额、销量、时间与状态始终优先保留',
  },
  erp_enrich: {
    label: '聚水潭 ERP 补全',
    color: 'cyan',
    desc: '仅补充空缺字段（省市/型号提示/ERP状态参考），绝不覆盖直出销售事实',
  },
  erp_independent_sales: {
    label: 'ERP / 手工独立销售',
    color: 'purple',
    desc: '仅对主数据开启「ERP独立入销」的店铺生成有效销售，其余店铺仅按补全处理',
  },
};

export const OPERATOR_TYPE_META: Record<OperatorType, { label: string; color: string }> = {
  self_operated: { label: '自运营', color: 'blue' },
  agency_operated: { label: '代运营', color: 'purple' },
};

export const SALES_MODE_META: Record<SalesMode, { label: string; color: string }> = {
  dealer: { label: '经销', color: 'green' },
  distribution: { label: '分销', color: 'orange' },
  hybrid: { label: '混合', color: 'geekblue' },
};

export const SHOP_STATUS_META: Record<ShopStatus, { label: string; color: string }> = {
  active: { label: '启用', color: 'success' },
  dormant: { label: '休眠', color: 'warning' },
  inactive: { label: '未启用', color: 'default' },
};

export const CHANNEL_TYPE_META: Record<ChannelType, { label: string; color: string }> = {
  jst_i_id: { label: '聚水潭款号 (jst_i_id)', color: 'blue' },
  jst_sku_id: { label: '聚水潭SKU (jst_sku_id)', color: 'cyan' },
  pdd_sku_id: { label: '拼多多商品ID', color: 'magenta' },
  tb_sku_id: { label: '淘宝商品ID', color: 'orange' },
  tm_sku_id: { label: '天猫商品编码', color: 'red' },
  dy_sku_id: { label: '抖音商品ID', color: 'default' },
  jd_sku_id: { label: '京东商品ID', color: 'volcano' },
  merchant_code: { label: '通用商家编码', color: 'geekblue' },
  custom_title: { label: '3C/自定义品名', color: 'purple' },
};

export const MODEL_MATCH_STATUS_META: Record<ModelMatchStatus, { label: string; color: string }> = {
  matched: { label: '自动命中', color: 'success' },
  manual_confirmed: { label: '人工已确认', color: 'blue' },
  ambiguous: { label: '一对多冲突', color: 'warning' },
  unmatched: { label: '未命中型号', color: 'error' },
};

export const ELIGIBILITY_STATUS_META: Record<EligibilityStatus, { label: string; color: string }> = {
  valid: { label: '有效销售', color: 'success' },
  excluded: { label: '已排除', color: 'default' },
  needs_review: { label: '待核对', color: 'warning' },
};

export const EXCLUSION_REASON_LABELS: Record<string, string> = {
  BELOW_MIN_AMOUNT: '金额低于门槛 (<400)',
  RESHIP_ORDER: '补发订单',
  PRICE_DIFF: '补收差价',
  STATUS_CLOSED: '交易关闭/取消/删除',
  STATUS_REFUNDED: '源单退款成功',
  NO_PAY_TIME: '缺少付款/成交时间',
  ERP_NOT_ENABLED: 'ERP补全(未开独立入销)',
  MISSING_AMOUNT: '缺失有效金额',
};

export const AMOUNT_SOURCE_LABELS: Record<string, string> = {
  jd_payable: '京东应付金额(K)',
  jd_paid_fallback: '京东实付兜底',
  taobao_buyer_paid: '淘宝买家实付(N)',
  taobao_bybt_supply: '淘宝百亿补贴供货价×数量',
  tmall_actual_received: '天猫实收金额',
  pdd_merchant_received: '拼多多商家实收',
  douyin_payable: '抖音订单应付',
  erp_seller_received: 'ERP卖家实收',
  erp_paid_fallback: '3C零实收取已付(V)',
  direct_paid: '平台直出实付',
};

export const EFFECTIVE_TIME_BASIS_OPTIONS: { value: EffectiveTimeBasis; label: string }[] = [
  { value: 'business_time', label: '业务时间（默认）' },
  { value: 'pay_time', label: '付款时间' },
  { value: 'order_time', label: '下单时间' },
];
