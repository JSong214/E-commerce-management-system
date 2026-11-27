import type {
  ApiErrorEnvelope,
  BatchRollbackResponse,
  BatchStatus,
  ColumnMapping,
  DataSource,
  DuplicateStrategy,
  ImportBatch,
  ImportCommitResponse,
  MappingTemplate,
  MappingTemplateRules,
  OrderLine,
  OrderLinesFilter,
  ParsePreviewResponse,
  Platform,
  ReportKpi,
  Shop,
  ShopInput,
  SkuRankingFilter,
  SkuRankingRow,
  StatusMapping,
  StatusMappingInput,
  SummaryReportFilter,
  SummaryReportRow,
  TemplateInput,
  ValidateResponse,
} from '../contracts/phase1';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

async function parseError(response: Response): Promise<ApiClientError> {
  let envelope: ApiErrorEnvelope | null = null;
  try {
    envelope = (await response.json()) as ApiErrorEnvelope;
  } catch {
    envelope = null;
  }
  return new ApiClientError(
    response.status,
    envelope?.error?.code ?? `HTTP_${response.status}`,
    envelope?.error?.message ?? (response.statusText || '请求失败'),
    envelope?.error?.details,
  );
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const asciiMatch = /filename="?([^";]+)"?/i.exec(disposition);
  return asciiMatch?.[1] ?? fallback;
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadFile(
  path: string,
  fallbackFilename: string,
  init?: RequestInit,
): Promise<string> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const filename = parseFilename(response.headers.get('Content-Disposition'), fallbackFilename);
  const blob = await response.blob();
  triggerBrowserDownload(blob, filename);
  return filename;
}

export function buildOrderLinesQuery(filters: OrderLinesFilter): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set('time_basis', filters.time_basis);
  if (filters.date_from) qs.set('date_from', filters.date_from);
  if (filters.date_to) qs.set('date_to', filters.date_to);
  if (filters.platform?.length) {
    for (const p of filters.platform) qs.append('platform', p);
  }
  if (filters.shop_id) qs.set('shop_id', String(filters.shop_id));
  if (filters.data_source) qs.set('data_source', filters.data_source);
  if (filters.normalized_status) qs.set('normalized_status', filters.normalized_status);
  if (filters.batch_id) qs.set('batch_id', String(filters.batch_id));
  if (filters.keyword?.trim()) qs.set('keyword', filters.keyword.trim());
  if (filters.page) qs.set('page', String(filters.page));
  if (filters.page_size) qs.set('page_size', String(filters.page_size));
  return qs;
}

function cleanScopePayload<T extends object>(filters: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export const phase1Api = {
  health(): Promise<{ status: string }> {
    return requestJson('/health');
  },

  parsePreview(file: File, sheetName?: string): Promise<ParsePreviewResponse> {
    const form = new FormData();
    form.append('file', file);
    if (sheetName) form.append('sheet_name', sheetName);
    return requestJson('/imports/parse-preview', { method: 'POST', body: form });
  },

  validateImport(payload: {
    staged_file_id: string;
    sheet_name?: string;
    data_source: DataSource;
    source_role?: 'direct_sales' | 'erp_enrich' | 'erp_independent_sales';
    template_id?: number | null;
    column_mapping: ColumnMapping;
    rules?: MappingTemplateRules;
    default_shop_id?: number | null;
  }): Promise<ValidateResponse> {
    const body: Record<string, unknown> = {
      staged_file_id: payload.staged_file_id,
      data_source: payload.data_source,
      column_mapping: payload.column_mapping,
    };
    if (payload.sheet_name) body.sheet_name = payload.sheet_name;
    if (payload.source_role) body.source_role = payload.source_role;
    if (payload.template_id !== undefined && payload.template_id !== null) {
      body.template_id = payload.template_id;
    }
    if (payload.rules) body.rules = payload.rules;
    if (payload.default_shop_id !== undefined && payload.default_shop_id !== null) {
      body.default_shop_id = payload.default_shop_id;
    }
    return requestJson('/imports/validate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  downloadValidationErrors(validationId: string): Promise<string> {
    return downloadFile(
      `/imports/validations/${encodeURIComponent(validationId)}/errors/export`,
      `validation-errors-${validationId}.xlsx`,
    );
  },

  commitImport(payload: {
    validation_id: string;
    duplicate_strategy: DuplicateStrategy;
    skip_error_rows: boolean;
  }): Promise<ImportCommitResponse> {
    return requestJson('/imports/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listBatches(params?: {
    page?: number;
    page_size?: number;
    data_source?: DataSource;
    status?: BatchStatus;
  }): Promise<{ items: ImportBatch[]; total: number; page: number; page_size: number }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    if (params?.data_source) qs.set('data_source', params.data_source);
    if (params?.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return requestJson(`/batches${suffix}`);
  },

  getBatch(batchId: number): Promise<ImportBatch> {
    return requestJson(`/batches/${batchId}`);
  },

  downloadBatchErrors(batchId: number, batchNo?: string): Promise<string> {
    return downloadFile(
      `/batches/${batchId}/errors/export`,
      `batch-errors-${batchNo ?? batchId}.xlsx`,
    );
  },

  rollbackBatch(batchId: number): Promise<BatchRollbackResponse> {
    return requestJson(`/batches/${batchId}/rollback`, { method: 'POST' });
  },

  listTemplates(): Promise<{ items: MappingTemplate[] }> {
    return requestJson('/templates');
  },

  createTemplate(body: TemplateInput): Promise<MappingTemplate> {
    return requestJson('/templates', { method: 'POST', body: JSON.stringify(body) });
  },

  updateTemplate(id: number, body: TemplateInput): Promise<MappingTemplate> {
    return requestJson(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  deleteTemplate(id: number): Promise<void> {
    return requestJson(`/templates/${id}`, { method: 'DELETE' });
  },

  listShops(): Promise<{ items: Shop[] }> {
    return requestJson('/shops');
  },

  createShop(body: ShopInput): Promise<Shop> {
    return requestJson('/shops', { method: 'POST', body: JSON.stringify(body) });
  },

  updateShop(id: number, body: ShopInput): Promise<Shop> {
    return requestJson(`/shops/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  batchBindShops(items: { shop_name: string; platform: Platform }[]): Promise<{ items: Shop[] }> {
    return requestJson('/shops/batch-bind', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  listStatusMappings(): Promise<{ items: StatusMapping[] }> {
    return requestJson('/status-mappings');
  },

  createStatusMapping(body: StatusMappingInput): Promise<StatusMapping> {
    return requestJson('/status-mappings', { method: 'POST', body: JSON.stringify(body) });
  },

  batchUpsertStatusMappings(items: StatusMappingInput[]): Promise<{ items: StatusMapping[] }> {
    return requestJson('/status-mappings/batch-upsert', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  updateStatusMapping(id: number, body: StatusMappingInput): Promise<StatusMapping> {
    return requestJson(`/status-mappings/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  deleteStatusMapping(id: number): Promise<void> {
    return requestJson(`/status-mappings/${id}`, { method: 'DELETE' });
  },

  listOrderLines(filters: OrderLinesFilter): Promise<{
    items: OrderLine[];
    total: number;
    page: number;
    page_size: number;
  }> {
    const qs = buildOrderLinesQuery(filters);
    return requestJson(`/order-lines?${qs.toString()}`);
  },

  exportOrderLines(filters: OrderLinesFilter, format: 'xlsx' | 'csv'): Promise<string> {
    const payload = {
      ...cleanScopePayload(filters),
      format,
    };
    return downloadFile('/order-lines/export', `order-lines.${format}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getSummaryReport(filters: SummaryReportFilter): Promise<{
    kpi: ReportKpi;
    rows: SummaryReportRow[];
  }> {
    const qs = new URLSearchParams();
    qs.set('time_basis', filters.time_basis);
    qs.set('granularity', filters.granularity);
    qs.set('group_by', filters.group_by);
    if (filters.date_from) qs.set('date_from', filters.date_from);
    if (filters.date_to) qs.set('date_to', filters.date_to);
    if (filters.platform?.length) {
      for (const p of filters.platform) qs.append('platform', p);
    }
    if (filters.shop_id) qs.set('shop_id', String(filters.shop_id));
    if (filters.normalized_status) qs.set('normalized_status', filters.normalized_status);
    return requestJson(`/reports/summary?${qs.toString()}`);
  },

  getSkuRanking(filters: SkuRankingFilter): Promise<{
    kpi: ReportKpi;
    items: SkuRankingRow[];
    total: number;
  }> {
    const qs = new URLSearchParams();
    qs.set('time_basis', filters.time_basis);
    qs.set('sort_by', filters.sort_by);
    if (filters.date_from) qs.set('date_from', filters.date_from);
    if (filters.date_to) qs.set('date_to', filters.date_to);
    if (filters.platform?.length) {
      for (const p of filters.platform) qs.append('platform', p);
    }
    if (filters.shop_id) qs.set('shop_id', String(filters.shop_id));
    if (filters.normalized_status) qs.set('normalized_status', filters.normalized_status);
    if (filters.page) qs.set('page', String(filters.page));
    if (filters.page_size) qs.set('page_size', String(filters.page_size));
    return requestJson(`/reports/sku-ranking?${qs.toString()}`);
  },

  exportReport(
    reportType: 'summary' | 'sku_ranking',
    includeDetailSheet: boolean,
    filters: SummaryReportFilter | SkuRankingFilter,
  ): Promise<string> {
    const fallback = reportType === 'summary' ? 'summary-report.xlsx' : 'sku-ranking.xlsx';
    return downloadFile('/reports/export', fallback, {
      method: 'POST',
      body: JSON.stringify({
        report_type: reportType,
        include_detail_sheet: includeDetailSheet,
        filters: cleanScopePayload(filters),
      }),
    });
  },
};
