import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { describe, expect, it } from 'vitest';
import { TIME_BASIS_OPTIONS } from '../contracts/phase1';
import { MOCK_ORDER_LINES, MOCK_TEMPLATES } from '../mocks/phase1MockData';
import { AppRoutes } from '../App';

describe('Phase 1 Contract & UI Prototype Smoke Tests', () => {
  it('enforces Time Basis strictly to order_time and pay_time (never ship_time)', () => {
    const values = TIME_BASIS_OPTIONS.map((o) => o.value);
    expect(values).toEqual(['order_time', 'pay_time']);
    expect(values).not.toContain('ship_time');
  });

  it('maps JD paid_amount to 商家应收 with proration enabled and preserves exact prorated sum', () => {
    const jdTemplate = MOCK_TEMPLATES.find((t) => t.code === 'jd_orders');
    expect(jdTemplate?.column_mapping.paid_amount).toBe('商家应收');
    expect(jdTemplate?.rules.prorate_order_amount).toBe(true);

    const jdOrderRows = MOCK_ORDER_LINES.filter((r) => r.platform_order_id === '3691453007789022');
    const sum = jdOrderRows.reduce((acc, row) => acc + Math.round(Number(row.paid_amount) * 100), 0);
    expect(sum).toBe(574801);
  });

  it('renders Variant A by default and switches through Variants B and C via the floating switcher', () => {
    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/import']}>
          <AppRoutes />
        </MemoryRouter>
      </ConfigProvider>,
    );

    expect(screen.getAllByText(/方案 A · 极简工作台/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '下一个视觉方案' }));
    expect(screen.getAllByText(/方案 B · 双栏操作台/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '下一个视觉方案' }));
    expect(screen.getAllByText(/方案 C · 高密度数据终端/).length).toBeGreaterThan(0);
  }, 20000);
});
