import { downloadFile, requestJson } from './client';
import type { DataSource, Shop, ShopInput } from '../contracts/phase1';
import type {
  ChannelMappingsResponse,
  ChannelType,
  EffectiveSalesDetail,
  EffectiveSalesFilter,
  EffectiveSalesListResponse,
  PendingModelFilter,
  PendingModelListResponse,
  ProductCategory,
  ProductCategoryInput,
  ProductChannelMapping,
  ProductChannelMappingInput,
  ProductModel,
  ProductModelInput,
  ProductModelsResponse,
  ProductsExcelImportResult,
  ProductUnitComponent,
  ProductUnitComponentInput,
  ResolveModelRequest,
  ResolveModelResponse,
  SalesRule,
  ShopAlias,
  ShopFilterParams,
  ShopListResponse,
  ShopsExcelImportResult,
} from '../contracts/v2';

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    qs.set(key, String(value));
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export const v2Api = {
  // ---- Shops & Aliases ----
  listShops(params?: ShopFilterParams): Promise<ShopListResponse> {
    return requestJson(`/shops${buildQuery({ ...params })}`);
  },

  createShop(body: ShopInput): Promise<Shop> {
    return requestJson('/shops', { method: 'POST', body: JSON.stringify(body) });
  },

  updateShop(id: number, body: ShopInput): Promise<Shop> {
    return requestJson(`/shops/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  deleteShop(id: number): Promise<void> {
    return requestJson(`/shops/${id}`, { method: 'DELETE' });
  },

  createShopAlias(
    shopId: number,
    body: { alias_name: string; source_hint?: DataSource | '*' | null },
  ): Promise<ShopAlias> {
    return requestJson(`/shops/${shopId}/aliases`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  deleteShopAlias(aliasId: number): Promise<void> {
    return requestJson(`/shops/aliases/${aliasId}`, { method: 'DELETE' });
  },

  importShopsExcel(file: File): Promise<ShopsExcelImportResult> {
    const form = new FormData();
    form.append('file', file);
    return requestJson('/master-data/shops/import-excel', { method: 'POST', body: form });
  },

  // ---- Product Master ----
  listCategories(): Promise<{ items: ProductCategory[] }> {
    return requestJson('/products/categories');
  },

  createCategory(body: ProductCategoryInput): Promise<ProductCategory> {
    return requestJson('/products/categories', { method: 'POST', body: JSON.stringify(body) });
  },

  updateCategory(id: number, body: ProductCategoryInput): Promise<ProductCategory> {
    return requestJson(`/products/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  deleteCategory(id: number): Promise<void> {
    return requestJson(`/products/categories/${id}`, { method: 'DELETE' });
  },

  listModels(params?: {
    business_segment?: string;
    category?: string;
    brand?: string;
    keyword?: string;
    only_with_components?: boolean;
    only_ambiguous?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<ProductModelsResponse> {
    return requestJson(`/products/models${buildQuery({ ...params })}`);
  },

  createModel(body: ProductModelInput): Promise<ProductModel> {
    return requestJson('/products/models', { method: 'POST', body: JSON.stringify(body) });
  },

  updateModel(id: number, body: ProductModelInput): Promise<ProductModel> {
    return requestJson(`/products/models/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  deleteModel(id: number): Promise<void> {
    return requestJson(`/products/models/${id}`, { method: 'DELETE' });
  },

  createComponent(modelId: number, body: ProductUnitComponentInput): Promise<ProductUnitComponent> {
    return requestJson(`/products/models/${modelId}/components`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateComponent(id: number, body: ProductUnitComponentInput): Promise<ProductUnitComponent> {
    return requestJson(`/products/components/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  deleteComponent(id: number): Promise<void> {
    return requestJson(`/products/components/${id}`, { method: 'DELETE' });
  },

  listChannelMappings(params?: {
    channel_type?: ChannelType;
    external_id?: string;
    model_id?: number;
    only_ambiguous?: boolean;
    keyword?: string;
    page?: number;
    page_size?: number;
  }): Promise<ChannelMappingsResponse> {
    return requestJson(`/products/channel-mappings${buildQuery({ ...params })}`);
  },

  createChannelMapping(body: ProductChannelMappingInput): Promise<ProductChannelMapping> {
    return requestJson('/products/channel-mappings', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateChannelMapping(
    id: number,
    body: ProductChannelMappingInput,
  ): Promise<ProductChannelMapping> {
    return requestJson(`/products/channel-mappings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  deleteChannelMapping(id: number): Promise<void> {
    return requestJson(`/products/channel-mappings/${id}`, { method: 'DELETE' });
  },

  importProductsExcel(file: File): Promise<ProductsExcelImportResult> {
    const form = new FormData();
    form.append('file', file);
    return requestJson('/master-data/products/import-excel', { method: 'POST', body: form });
  },

  // ---- Sales Rules ----
  listSalesRules(): Promise<{ items: SalesRule[] }> {
    return requestJson('/sales-rules');
  },

  updateSalesRule(
    ruleKey: string,
    body: { enabled: boolean; config_json: Record<string, unknown> },
  ): Promise<SalesRule> {
    return requestJson(`/sales-rules/${encodeURIComponent(ruleKey)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  // ---- Effective Sales (Layer 2) ----
  listEffectiveSales(filters: EffectiveSalesFilter): Promise<EffectiveSalesListResponse> {
    return requestJson(`/effective-sales${buildQuery({ ...filters })}`);
  },

  getEffectiveSale(recordId: number): Promise<EffectiveSalesDetail> {
    return requestJson(`/effective-sales/${recordId}`);
  },

  exportEffectiveSales(filters: EffectiveSalesFilter, format: 'xlsx' | 'csv'): Promise<string> {
    const qs = buildQuery({
      ...filters,
      page: undefined,
      page_size: undefined,
      format,
    });
    return downloadFile(`/effective-sales/export${qs}`, `effective-sales.${format}`);
  },

  // ---- Pending Model Confirmation Queue ----
  listPendingModels(filters?: PendingModelFilter): Promise<PendingModelListResponse> {
    return requestJson(`/model-review/pending${buildQuery({ ...filters })}`);
  },

  resolveModels(body: ResolveModelRequest): Promise<ResolveModelResponse> {
    return requestJson('/model-review/resolve', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
