import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOrderLinesQuery, phase1Api } from '../api/client';
import { TIME_BASIS_OPTIONS } from '../contracts/phase1';
import { OrderLinesPage } from '../pages/OrderLinesPage';
import { ReportsPage } from '../pages/ReportsPage';

function renderWithProviders(ui: React.ReactElement, initialRoute = '/orders') {
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

describe('Ticket 08 — Order Lines Query & Reports Export', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('restricts Time Basis strictly to order_time and pay_time (never ship_time)', () => {
    const values = TIME_BASIS_OPTIONS.map((o) => o.value);
    expect(values).toEqual(['order_time', 'pay_time']);
    expect(values).not.toContain('ship_time');

    const qs = buildOrderLinesQuery({
      time_basis: 'pay_time',
      date_from: '2026-11-01',
      date_to: '2026-11-24',
      platform: ['jd', 'tmall'],
      keyword: '3691453007789022',
      page: 1,
      page_size: 50,
    });
    expect(qs.get('time_basis')).toBe('pay_time');
    expect(qs.getAll('platform')).toEqual(['jd', 'tmall']);
    expect(qs.get('keyword')).toBe('3691453007789022');
  });

  it('renders order lines, opens raw_extra drawer, and triggers Excel export', async () => {
    vi.spyOn(phase1Api, 'listShops').mockResolvedValue({ items: [] });
    vi.spyOn(phase1Api, 'listBatches').mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
    vi.spyOn(phase1Api, 'listOrderLines').mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 50,
      items: [
        {
          id: 101,
          platform: 'jd',
          shop_id: 1,
          shop_name: '品牌京东旗舰店',
          data_source: 'jd',
          platform_order_id: '3691453007789022',
          line_key: 'HXKTSN2600010#1',
          order_time: '2026-11-23 15:10:08',
          pay_time: '2026-11-23 15:14:57',
          product_name: '大3匹一级能效空调柜机',
          sku_code: 'HXKTSN2600010',
          is_gift: false,
          quantity: 1,
          unit_price: '5599.00',
          gross_amount: '5599.00',
          discount_amount: '0.00',
          shipping_fee: '0.00',
          paid_amount: '3537.38',
          is_amount_prorated: true,
          refund_amount: '0.00',
          raw_order_status: '等待确认收货',
          normalized_status: 'shipped',
          is_valid_for_gmv: true,
          raw_extra: { 应付金额: '5773.0', 仓库名称: '商家全国仓' },
          first_batch_id: 1,
          last_batch_id: 1,
        },
      ],
    });
    const exportSpy = vi.spyOn(phase1Api, 'exportOrderLines').mockResolvedValue('order-lines.xlsx');

    renderWithProviders(<OrderLinesPage />, '/orders');

    await waitFor(() => {
      expect(screen.getByText('3691453007789022')).toBeInTheDocument();
      expect(screen.getByText('整单分摊')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
    await waitFor(() => {
      expect(screen.getByText('商家全国仓')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /导出 Excel/ }));
    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith(
        expect.objectContaining({ time_basis: 'order_time' }),
        'xlsx',
      );
    });
  }, 15000);

  it('renders ReportsPage KPIs and exports dual-sheet summary workbook', async () => {
    vi.spyOn(phase1Api, 'listShops').mockResolvedValue({ items: [] });
    vi.spyOn(phase1Api, 'getSummaryReport').mockResolvedValue({
      kpi: {
        gmv: '5748.01',
        refund_amount: '0.00',
        net_sales: '5748.01',
        order_count: 1,
        units_sold: 4,
      },
      rows: [
        {
          period: '2026-11-23',
          platform: 'jd',
          shop_id: 1,
          shop_name: '品牌京东旗舰店',
          gmv: '5748.01',
          refund_amount: '0.00',
          net_sales: '5748.01',
          order_count: 1,
          units_sold: 4,
        },
      ],
    });
    const exportReportSpy = vi
      .spyOn(phase1Api, 'exportReport')
      .mockResolvedValue('summary-report.xlsx');

    renderWithProviders(<ReportsPage />, '/reports');

    await waitFor(() => {
      expect(screen.getAllByText(/5,748|5748\.01/).length).toBeGreaterThan(0);
      expect(screen.getByText('品牌京东旗舰店')).toBeInTheDocument();
    });

    // Confirm only 下单时间 / 付款时间 exist (never 发货时间)
    expect(screen.getByText('下单时间')).toBeInTheDocument();
    expect(screen.getByText('付款时间')).toBeInTheDocument();
    expect(screen.queryByText('发货时间')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /导出报表 Excel/ }));
    await waitFor(() => {
      expect(exportReportSpy).toHaveBeenCalledWith(
        'summary',
        true,
        expect.objectContaining({ time_basis: 'order_time', granularity: 'day', group_by: 'shop' }),
      );
    });
  }, 15000);
});
