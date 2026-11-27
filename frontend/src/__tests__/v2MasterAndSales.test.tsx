import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { phase1Api } from '../api/client';
import { v2Api } from '../api/v2Client';
import { EffectiveSalesPage } from '../pages/EffectiveSalesPage';
import { ManagementPage } from '../pages/ManagementPage';
import { MasterDataPage } from '../pages/MasterDataPage';
import { ModelReviewPage } from '../pages/ModelReviewPage';

function renderWithProviders(ui: React.ReactElement, initialRoute = '/master-data') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ConfigProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ConfigProvider>,
  );
}

describe('V2 Slice 1 — Master Data, Effective Sales, Model Review & Sales Rules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders MasterDataPage shops, products, and conflict groups', async () => {
    vi.spyOn(v2Api, 'listShops').mockResolvedValue({
      items: [
        {
          id: 1,
          shop_name: '智电汇通3C店',
          platform: 'huanxin',
          operator_type: 'self_operated',
          entity_name: '测试主体',
          sales_mode: 'hybrid',
          shop_status: 'active',
          is_active: true,
          erp_sales_enabled: true,
          zero_received_use_paid: true,
          preserve_full_product_name: true,
          aliases: [{ id: 10, shop_id: 1, alias_name: '展翅豪鹏3C店', source_hint: 'manual' }],
        },
      ],
      summary: { total: 38, active: 18, dormant: 5, inactive: 15, erp_sales_enabled: 8 },
    });
    vi.spyOn(v2Api, 'listCategories').mockResolvedValue({
      items: [{ id: 1, business_segment: '家电', category: '空调', brand: '华凌' }],
    });
    vi.spyOn(v2Api, 'listModels').mockResolvedValue({
      items: [
        {
          id: 10,
          standard_model: 'KFR-35GW/N8HE1',
          business_segment: '家电',
          category: '空调',
          brand: '华凌',
          is_3c_full_name: false,
          is_active: true,
          component_count: 2,
          mapping_count: 1,
          has_ambiguous_mapping: true,
          components: [
            { id: 1, model_id: 10, component_model: 'KFR-35G/N8HE1', unit_type: 'indoor', mapping_value: null },
            { id: 2, model_id: 10, component_model: 'KFR-35W/N8HE1', unit_type: 'outdoor', mapping_value: null },
          ],
          channel_mappings: [],
        },
      ],
      total: 1,
      page: 1,
      page_size: 30,
      summary: {
        total_categories: 13,
        total_models: 173,
        total_components: 78,
        total_channel_mappings: 494,
        ambiguous_id_groups: 2,
      },
    });
    vi.spyOn(v2Api, 'listChannelMappings').mockResolvedValue({
      items: [],
      total: 2,
      ambiguous_groups: [
        {
          channel_type: 'pdd_sku_id',
          external_id: 'PDD-CONFLICT-99',
          candidate_models: [
            { model_id: 10, standard_model: 'KFR-35GW/N8HE1', brand: '华凌', category: '空调' },
            { model_id: 11, standard_model: 'KFR-35GW/N8HL1', brand: '华凌', category: '空调' },
          ],
        },
      ],
    });

    renderWithProviders(<MasterDataPage />, '/master-data');

    expect(await screen.findByText('智电汇通3C店')).toBeInTheDocument();
    expect(screen.getByText('焕新生活')).toBeInTheDocument();
    expect(screen.getByText('别名: 展翅豪鹏3C店')).toBeInTheDocument();

    fireEvent.click(screen.getByText('渠道 ID 冲突清单'));
    expect(await screen.findByText('PDD-CONFLICT-99')).toBeInTheDocument();
    expect(screen.getByText('华凌 · KFR-35GW/N8HE1')).toBeInTheDocument();
  });

  it('renders EffectiveSalesPage KPI strip and opens Layer-1 traceability drawer', async () => {
    vi.spyOn(v2Api, 'listShops').mockResolvedValue({
      items: [],
      summary: { total: 0, active: 0, dormant: 0, inactive: 0, erp_sales_enabled: 0 },
    });
    vi.spyOn(v2Api, 'listCategories').mockResolvedValue({ items: [] });
    vi.spyOn(v2Api, 'listEffectiveSales').mockResolvedValue({
      items: [
        {
          id: 101,
          platform: 'jd',
          shop_id: 5,
          shop_name: '京东空调旗舰店',
          business_order_id: 'JD20261124001',
          record_key: 'whole_unit',
          source_role: 'direct_sales',
          primary_data_source: 'jd',
          source_order_line_ids: [501, 502],
          business_time: '2026-11-24T10:15:00',
          order_time: '2026-11-24T10:12:00',
          pay_time: '2026-11-24T10:15:00',
          model_id: 10,
          standard_model: 'KFR-35GW/N8HE1',
          brand: '华凌',
          category: '空调',
          business_segment: '家电',
          model_match_status: 'matched',
          raw_product_summary: '华凌1.5匹空调',
          sales_quantity: 1,
          sales_amount: '2499.00',
          amount_source: 'jd_payable',
          eligibility_status: 'valid',
          exclusion_reason: null,
          notices: [],
          province: '广东省',
          city: '佛山市',
          raw_order_status: '完成',
          erp_enriched: true,
          last_batch_id: 1,
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
      kpi: {
        total_records: 2,
        valid_records: 1,
        valid_sales_quantity: 1,
        valid_sales_amount: '2499.00',
        excluded_records: 1,
        needs_review_records: 0,
        pending_model_records: 0,
      },
    });
    vi.spyOn(v2Api, 'getEffectiveSale').mockResolvedValue({
      id: 101,
      platform: 'jd',
      shop_id: 5,
      shop_name: '京东空调旗舰店',
      business_order_id: 'JD20261124001',
      record_key: 'whole_unit',
      source_role: 'direct_sales',
      primary_data_source: 'jd',
      source_order_line_ids: [501, 502],
      business_time: '2026-11-24T10:15:00',
      order_time: '2026-11-24T10:12:00',
      pay_time: '2026-11-24T10:15:00',
      model_id: 10,
      standard_model: 'KFR-35GW/N8HE1',
      brand: '华凌',
      category: '空调',
      business_segment: '家电',
      model_match_status: 'matched',
      raw_product_summary: '华凌1.5匹空调',
      sales_quantity: 1,
      sales_amount: '2499.00',
      amount_source: 'jd_payable',
      eligibility_status: 'valid',
      exclusion_reason: null,
      notices: [],
      province: '广东省',
      city: '佛山市',
      raw_order_status: '完成',
      erp_enriched: true,
      last_batch_id: 1,
      source_order_lines: [
        {
          id: 501,
          platform: 'jd',
          shop_id: 5,
          shop_name: '京东空调旗舰店',
          data_source: 'jd',
          platform_order_id: 'JD20261124001',
          line_key: 'indoor#1',
          order_time: '2026-11-24T10:12:00',
          product_name: '华凌1.5匹空调内机',
          is_gift: false,
          quantity: 1,
          discount_amount: '0.00',
          shipping_fee: '0.00',
          paid_amount: '2599.00',
          payable_amount: '2499.00',
          is_amount_prorated: false,
          refund_amount: '0.00',
          raw_order_status: '完成',
          normalized_status: 'completed',
          is_valid_for_gmv: true,
          raw_extra: {},
          first_batch_id: 1,
          last_batch_id: 1,
        },
        {
          id: 502,
          platform: 'jd',
          shop_id: 5,
          shop_name: '京东空调旗舰店',
          data_source: 'jd',
          platform_order_id: 'JD20261124001',
          line_key: 'outdoor#1',
          order_time: '2026-11-24T10:12:00',
          product_name: '华凌1.5匹空调外机',
          is_gift: false,
          quantity: 1,
          discount_amount: '0.00',
          shipping_fee: '0.00',
          paid_amount: '0.00',
          payable_amount: '0.00',
          is_amount_prorated: false,
          refund_amount: '0.00',
          raw_order_status: '完成',
          normalized_status: 'completed',
          is_valid_for_gmv: true,
          raw_extra: {},
          first_batch_id: 1,
          last_batch_id: 1,
        },
      ],
    });

    renderWithProviders(<EffectiveSalesPage />, '/effective-sales');

    expect(await screen.findByText('JD20261124001')).toBeInTheDocument();
    expect(screen.getByText('整机合并 (2 原始行)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /详情/ }));
    expect(await screen.findByText('华凌1.5匹空调内机')).toBeInTheDocument();
    expect(screen.getByText('华凌1.5匹空调外机')).toBeInTheDocument();
  });

  it('resolves grouped ambiguous models with one-click rule learning on ModelReviewPage', async () => {
    vi.spyOn(v2Api, 'listShops').mockResolvedValue({
      items: [],
      summary: { total: 0, active: 0, dormant: 0, inactive: 0, erp_sales_enabled: 0 },
    });
    vi.spyOn(v2Api, 'listModels').mockResolvedValue({
      items: [
        {
          id: 10,
          standard_model: 'MODEL-A',
          business_segment: '家电',
          category: '空调',
          brand: '华凌',
          is_3c_full_name: false,
          is_active: true,
          component_count: 0,
          mapping_count: 1,
          has_ambiguous_mapping: true,
          components: [],
          channel_mappings: [],
        },
      ],
      total: 1,
      page: 1,
      page_size: 200,
      summary: {
        total_categories: 1,
        total_models: 1,
        total_components: 0,
        total_channel_mappings: 1,
        ambiguous_id_groups: 1,
      },
    });
    vi.spyOn(v2Api, 'listPendingModels').mockResolvedValue({
      groups: [
        {
          group_key: 'grp-1',
          data_source: 'pdd',
          platform: 'pdd',
          shop_id: 3,
          shop_name: '拼多多测试店',
          channel_type: 'pdd_sku_id',
          external_id: '998877',
          secondary_external_id: '',
          raw_model_hint: 'HINT-1',
          raw_product_summary: '测试空调商品',
          model_match_status: 'ambiguous',
          candidates: [
            { model_id: 10, standard_model: 'MODEL-A', brand: '华凌', category: '空调' },
            { model_id: 11, standard_model: 'MODEL-B', brand: '华凌', category: '空调' },
          ],
          affected_record_count: 12,
          valid_record_count: 10,
          total_sales_amount: '24000.00',
          sample_record_ids: [1, 2, 3],
        },
      ],
      total_groups: 1,
      total_pending_records: 12,
      ambiguous_records: 12,
      unmatched_records: 0,
    });
    const resolveSpy = vi.spyOn(v2Api, 'resolveModels').mockResolvedValue({
      resolved_effective_records: 12,
      resolved_order_lines: 12,
      saved_mapping_id: 501,
      retroactively_resolved_records: 0,
    });

    renderWithProviders(<ModelReviewPage />, '/model-review');

    expect(await screen.findByText('拼多多测试店')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /确认型号/ }));
    expect(await screen.findByText('批量确认标准型号')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /确认并应用/ }));
    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model_id: 10,
          save_as_mapping_rule: true,
          rule_scope: 'shop',
        }),
      );
    });
  });

  it('toggles configurable sales rules in ManagementPage', async () => {
    vi.spyOn(phase1Api, 'listBatches').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    });
    vi.spyOn(phase1Api, 'listTemplates').mockResolvedValue({ items: [] });
    vi.spyOn(phase1Api, 'listShops').mockResolvedValue({ items: [] });
    vi.spyOn(phase1Api, 'listStatusMappings').mockResolvedValue({ items: [] });
    vi.spyOn(v2Api, 'listSalesRules').mockResolvedValue({
      items: [
        {
          rule_key: 'min_sales_amount',
          rule_name: '最低销售额门槛',
          rule_group: 'eligibility',
          enabled: true,
          config_json: { threshold: '400.00', exclude_reason: 'BELOW_MIN_AMOUNT' },
          description: '低于400元排除出有效销售',
        },
      ],
    });
    const updateRuleSpy = vi.spyOn(v2Api, 'updateSalesRule').mockResolvedValue({
      rule_key: 'min_sales_amount',
      rule_name: '最低销售额门槛',
      rule_group: 'eligibility',
      enabled: false,
      config_json: { threshold: '400.00', exclude_reason: 'BELOW_MIN_AMOUNT' },
      description: '低于400元排除出有效销售',
    });

    renderWithProviders(<ManagementPage />, '/management');

    fireEvent.click(await screen.findByText('销售业务规则（可配置开关）'));
    expect(await screen.findByText('最低销售额门槛')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('开关-min_sales_amount'));
    await waitFor(() => {
      expect(updateRuleSpy).toHaveBeenCalledWith('min_sales_amount', {
        enabled: false,
        config_json: { threshold: '400.00', exclude_reason: 'BELOW_MIN_AMOUNT' },
      });
    });
  });
});
