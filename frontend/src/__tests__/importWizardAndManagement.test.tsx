import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { phase1Api } from '../api/client';
import { ImportWizardPage } from '../pages/ImportWizardPage';
import { ManagementPage } from '../pages/ManagementPage';

function renderWithProviders(ui: React.ReactElement, initialRoute = '/import') {
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

describe('Ticket 07 — Import Wizard & Management Console', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('walks the 4-step import wizard, gates commit on unknown shops, binds them, and commits', async () => {
    vi.spyOn(phase1Api, 'listTemplates').mockResolvedValue({
      items: [
        {
          id: 1,
          code: 'jd_orders',
          name: '京东订单明细（标准）',
          data_source: 'jd',
          is_builtin: true,
          header_fingerprint: ['订单号', '京东价', '商家应收'],
          column_mapping: {
            platform_order_id: '订单号',
            order_time: '下单时间',
            product_name: '商品名称',
            quantity: '订购数量',
            paid_amount: '商家应收',
            raw_order_status: '订单状态',
          },
          rules: { prorate_order_amount: true, prorate_weight_field: 'unit_price' },
          default_platform: 'jd',
        },
      ],
    });
    vi.spyOn(phase1Api, 'listShops').mockResolvedValue({
      items: [{ id: 1, shop_name: '品牌京东旗舰店', platform: 'jd', is_active: true }],
    });
    vi.spyOn(phase1Api, 'parsePreview').mockResolvedValue({
      staged_file_id: 'stg_20261124aaaa1111bbbb2222',
      file_name: 'jd_sample.csv',
      file_encoding: 'gb18030',
      sheets: ['Sheet1'],
      selected_sheet: 'Sheet1',
      total_rows: 4,
      headers: ['订单号', '下单时间', '商品名称', '订购数量', '京东价', '商家应收', '订单状态'],
      sample_rows: [{ 订单号: '3691453007789022', 商家应收: '5748.01' }],
      matched_template: {
        id: 1,
        code: 'jd_orders',
        name: '京东订单明细（标准）',
        data_source: 'jd',
        match_score: 0.98,
        needs_default_shop: true,
      },
      pii_columns_detected: ['下单帐号'],
    });

    const validateSpy = vi
      .spyOn(phase1Api, 'validateImport')
      .mockResolvedValueOnce({
        validation_id: 'val_202611240000000000000001',
        summary: {
          total_rows: 4,
          valid_rows: 4,
          error_rows: 0,
          warning_rows: 1,
          estimated_inserts: 4,
          estimated_updates: 0,
          prorated_orders: 1,
        },
        unknown_shops: ['聚水潭新店铺X'],
        unknown_statuses: [],
        errors_preview: [],
        warnings_preview: [],
        cleaned_sample_rows: [],
      })
      .mockResolvedValueOnce({
        validation_id: 'val_202611240000000000000002',
        summary: {
          total_rows: 4,
          valid_rows: 4,
          error_rows: 0,
          warning_rows: 1,
          estimated_inserts: 4,
          estimated_updates: 0,
          prorated_orders: 1,
        },
        unknown_shops: [],
        unknown_statuses: [],
        errors_preview: [],
        warnings_preview: [],
        cleaned_sample_rows: [],
      });

    const bindSpy = vi.spyOn(phase1Api, 'batchBindShops').mockResolvedValue({
      items: [{ id: 2, shop_name: '聚水潭新店铺X', platform: 'taobao', is_active: true }],
    });

    const commitSpy = vi.spyOn(phase1Api, 'commitImport').mockResolvedValue({
      batch_id: 9,
      batch_no: 'IMP-20261124-0000000000000002',
      status: 'committed',
      total_rows: 4,
      valid_rows: 4,
      inserted_rows: 4,
      updated_rows: 0,
      skipped_rows: 0,
      error_rows: 0,
    });

    const { container } = renderWithProviders(<ImportWizardPage />);

    // Step 0: upload file
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['订单号\n3691453007789022'], 'jd_sample.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Step 1: mapping step appears with PII stripped alert
    await waitFor(() => {
      expect(screen.getByText(/已自动剥离 1 个买家隐私字段/)).toBeInTheDocument();
    });

    // Run validation
    fireEvent.click(screen.getByRole('button', { name: '执行预校验' }));

    // Step 2: unknown shop blocks next step
    await waitFor(() => {
      expect(screen.getByText(/发现 1 个未绑定销售平台的新店铺/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /下一步：确认入库策略/ })).toBeDisabled();

    // Bind unknown shop and re-validate
    const shopPlatformSelect = screen.getByRole('combobox', { name: '绑定店铺-聚水潭新店铺X' });
    fireEvent.mouseDown(shopPlatformSelect);
    const taobaoOption = await screen.findByTitle('淘宝');
    fireEvent.click(taobaoOption);

    fireEvent.click(screen.getByRole('button', { name: '一键绑定并重新校验' }));

    await waitFor(() => {
      expect(bindSpy).toHaveBeenCalledWith([{ shop_name: '聚水潭新店铺X', platform: 'taobao' }]);
      expect(validateSpy).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /下一步：确认入库策略/ })).toBeEnabled();
    });

    // Step 3: commit
    fireEvent.click(screen.getByRole('button', { name: /下一步：确认入库策略/ }));
    fireEvent.click(screen.getByRole('button', { name: /确认正式入库/ }));

    await waitFor(() => {
      expect(commitSpy).toHaveBeenCalledWith({
        validation_id: 'val_202611240000000000000002',
        duplicate_strategy: 'upsert',
        skip_error_rows: true,
      });
      expect(screen.getByText(/导入批次 IMP-20261124-0000000000000002 已入库完成/)).toBeInTheDocument();
    });
  }, 20000);

  it('displays rollback-blocked guidance for older overlapping batches in ManagementPage', async () => {
    vi.spyOn(phase1Api, 'listBatches').mockResolvedValue({
      total: 2,
      page: 1,
      page_size: 20,
      items: [
        {
          id: 2,
          batch_no: 'IMP-20261124-0002',
          file_name: 'jd_new.csv',
          data_source: 'jd',
          template_name_snapshot: '京东订单明细',
          duplicate_strategy: 'upsert',
          status: 'committed',
          total_rows: 10,
          valid_rows: 10,
          inserted_rows: 2,
          updated_rows: 8,
          skipped_rows: 0,
          error_rows: 0,
          warning_rows: 0,
          created_at: '2026-11-24 14:00:00',
          can_rollback: true,
          blocking_batches: [],
        },
        {
          id: 1,
          batch_no: 'IMP-20261124-0001',
          file_name: 'jd_old.csv',
          data_source: 'jd',
          template_name_snapshot: '京东订单明细',
          duplicate_strategy: 'upsert',
          status: 'committed',
          total_rows: 10,
          valid_rows: 10,
          inserted_rows: 10,
          updated_rows: 0,
          skipped_rows: 0,
          error_rows: 0,
          warning_rows: 0,
          created_at: '2026-11-24 12:00:00',
          can_rollback: false,
          blocking_batches: ['IMP-20261124-0002'],
        },
      ],
    });
    vi.spyOn(phase1Api, 'listTemplates').mockResolvedValue({ items: [] });
    vi.spyOn(phase1Api, 'listShops').mockResolvedValue({ items: [] });
    vi.spyOn(phase1Api, 'listStatusMappings').mockResolvedValue({ items: [] });

    renderWithProviders(<ManagementPage />, '/management');

    await waitFor(() => {
      expect(screen.getByText('IMP-20261124-0002')).toBeInTheDocument();
      expect(screen.getByText('IMP-20261124-0001')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /精确回滚/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /需先回滚新批/ })).toBeDisabled();
  }, 15000);

  it('guards commit on unknown statuses in Step 3 and allows inline batch-upsert + revalidate', async () => {
    vi.spyOn(phase1Api, 'listTemplates').mockResolvedValue({
      items: [
        {
          id: 2,
          code: 'pdd_orders',
          name: '拼多多订单明细',
          data_source: 'pdd',
          is_builtin: true,
          header_fingerprint: ['订单号', '商家实收金额(元)'],
          column_mapping: {
            platform_order_id: '订单号',
            order_time: '订单成交时间',
            product_name: '商品',
            quantity: '商品数量(件)',
            paid_amount: '商家实收金额(元)',
            raw_order_status: '订单状态',
          },
          rules: { infer_full_refund_from_status: true },
          default_platform: 'pdd',
        },
      ],
    });
    vi.spyOn(phase1Api, 'listShops').mockResolvedValue({
      items: [{ id: 3, shop_name: '拼多多测试店', platform: 'pdd', is_active: true }],
    });
    vi.spyOn(phase1Api, 'parsePreview').mockResolvedValue({
      staged_file_id: 'stg_status_guard_001',
      file_name: 'pdd_sample.csv',
      file_encoding: 'utf-8-sig',
      sheets: ['Sheet1'],
      selected_sheet: 'Sheet1',
      total_rows: 1,
      headers: ['订单号', '订单成交时间', '商品', '商品数量(件)', '商家实收金额(元)', '订单状态'],
      sample_rows: [{ 订单号: '261114-123456', 商家实收金额: '1500.00' }],
      matched_template: {
        id: 2,
        code: 'pdd_orders',
        name: '拼多多订单明细',
        data_source: 'pdd',
        match_score: 1,
        needs_default_shop: true,
      },
      pii_columns_detected: [],
    });

    const validateSpy = vi
      .spyOn(phase1Api, 'validateImport')
      .mockResolvedValueOnce({
        validation_id: 'val_status_001',
        summary: {
          total_rows: 1,
          valid_rows: 1,
          error_rows: 0,
          warning_rows: 1,
          estimated_inserts: 1,
          estimated_updates: 0,
          prorated_orders: 0,
        },
        unknown_shops: [],
        unknown_statuses: ['拼多多新异常状态'],
        errors_preview: [],
        warnings_preview: [],
        cleaned_sample_rows: [],
      })
      .mockResolvedValueOnce({
        validation_id: 'val_status_002',
        summary: {
          total_rows: 1,
          valid_rows: 1,
          error_rows: 0,
          warning_rows: 0,
          estimated_inserts: 1,
          estimated_updates: 0,
          prorated_orders: 0,
        },
        unknown_shops: [],
        unknown_statuses: [],
        errors_preview: [],
        warnings_preview: [],
        cleaned_sample_rows: [],
      });

    const upsertSpy = vi.spyOn(phase1Api, 'batchUpsertStatusMappings').mockResolvedValue({
      items: [
        {
          id: 99,
          data_source: 'pdd',
          raw_status: '拼多多新异常状态',
          normalized_status: 'closed_cancelled',
          is_valid_for_gmv: true,
        },
      ],
    });

    const { container } = renderWithProviders(<ImportWizardPage />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['订单号\n261114-123456'], 'pdd_sample.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '执行预校验' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '执行预校验' }));

    await waitFor(() => {
      expect(screen.getByText(/检测到 1 个未配置归一化规则的原始订单状态/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /下一步：确认入库策略/ })).toBeDisabled();

    const statusSelect = screen.getByRole('combobox', { name: '配置状态-拼多多新异常状态' });
    fireEvent.mouseDown(statusSelect);
    const closedOpt = await screen.findByTitle('已关闭/取消');
    fireEvent.click(closedOpt);

    fireEvent.click(screen.getByRole('button', { name: '一键保存状态规则并重新校验' }));

    await waitFor(() => {
      expect(upsertSpy).toHaveBeenCalledWith([
        {
          data_source: 'pdd',
          raw_status: '拼多多新异常状态',
          normalized_status: 'closed_cancelled',
          is_valid_for_gmv: true,
        },
      ]);
      expect(validateSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: /下一步：确认入库策略/ })).toBeEnabled();
    });
  }, 20000);
});
