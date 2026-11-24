import type {
  ApiErrorEnvelope,
  DuplicateStrategy,
  ImportBatch,
  ImportCommitResponse,
  MappingTemplate,
  OrderLine,
  ParsePreviewResponse,
  Platform,
  ReportGranularity,
  ReportGroupBy,
  ReportKpi,
  Shop,
  SkuRankingRow,
  StatusMapping,
  SummaryReportRow,
  TimeBasis,
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

const API_BASE = '/api/v1';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let envelope: ApiErrorEnvelope | null = null;
    try {
      envelope = (await response.json()) as ApiErrorEnvelope;
    } catch {
      envelope = null;
    }
    throw new ApiClientError(
      response.status,
      envelope?.error?.code ?? `HTTP_${response.status}`,
      envelope?.error?.message ?? response.statusText,
      envelope?.error?.details,
    );
  }

  return (await response.json()) as T;
}

export const phase1Api = {
  parsePreview(file: File, sheetName?: string): Promise<ParsePreviewResponse> {
    const form = new FormData();
    form.append('file', file);
    if (sheetName) form.append('sheet_name', sheetName);
    return requestJson('/imports/parse-preview', { method: 'POST', body: form });
  },

  validateImport(payload: {
    staged_file_id: string;
    sheet_name?: string;
    data_source: string;
    template_id?: number;
    column_mapping: Record<string, string | string[]>;
    rules?: Record<string, unknown>;
    default_shop_id?: number;
  }): Promise<ValidateResponse> {
    return requestJson('/imports/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
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

  listBatches(params?: URLSearchParams): Promise<{ items: ImportBatch[]; total: number }> {
    const qs = params?.toString() ? `?${params.toString()}` : '';
    return requestJson(`/batches${qs}`);
  },

  rollbackBatch(batchId: number): Promise<{
    batch_id: number;
    status: 'rolled_back';
    deleted_rows: number;
    restored_rows: number;
  }> {
    return requestJson(`/batches/${batchId}/rollback`, { method: 'POST' });
  },

  listTemplates(): Promise<{ items: MappingTemplate[] }> {
    return requestJson('/templates');
  },

  listShops(): Promise<{ items: Shop[] }> {
    return requestJson('/shops');
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

  listOrderLines(params: URLSearchParams): Promise<{
    items: OrderLine[];
    total: number;
    page: number;
    page_size: number;
  }> {
    return requestJson(`/order-lines?${params.toString()}`);
  },

  getSummaryReport(params: {
    time_basis: TimeBasis;
    date_from?: string;
    date_to?: string;
    granularity: ReportGranularity;
    group_by: ReportGroupBy;
  }): Promise<{ kpi: ReportKpi; rows: SummaryReportRow[] }> {
    const qs = new URLSearchParams();
    qs.set('time_basis', params.time_basis);
    qs.set('granularity', params.granularity);
    qs.set('group_by', params.group_by);
    if (params.date_from) qs.set('date_from', params.date_from);
    if (params.date_to) qs.set('date_to', params.date_to);
    return requestJson(`/reports/summary?${qs.toString()}`);
  },

  getSkuRanking(params: URLSearchParams): Promise<{
    kpi: ReportKpi;
    items: SkuRankingRow[];
    total: number;
  }> {
    return requestJson(`/reports/sku-ranking?${params.toString()}`);
  },
};
