import { useState } from 'react';
import { Button, Input, Select, Space, Switch, Table, Tag, message } from 'antd';
import { DownloadOutlined, FileExcelOutlined, RollbackOutlined } from '@ant-design/icons';
import {
  DATA_SOURCE_META,
  NORMALIZED_STATUS_META,
  PLATFORM_META,
  TIME_BASIS_OPTIONS,
  type OrderLine,
  type Platform,
  type TimeBasis,
} from '../contracts/phase1';
import {
  MOCK_BATCHES,
  MOCK_ORDER_LINES,
  MOCK_PARSE_PREVIEW,
  MOCK_REPORT_KPI,
  MOCK_SKU_RANKING,
  MOCK_SUMMARY_ROWS,
  MOCK_TEMPLATES,
  MOCK_VALIDATE_RESPONSE,
} from '../mocks/phase1MockData';
import type { AppRouteKey } from './VariantAWorkbench';

interface VariantProps {
  route: AppRouteKey;
  onNavigate: (next: AppRouteKey) => void;
}

/**
 * Variant C: High-Density Command Workspace
 * Flat, card-free hairline-bordered terminal aesthetic with instant platform pill switchers,
 * tabular-nums monospace metrics, inline expandable raw_extra, and sticky bottom action bar.
 */
export function VariantCCommandTerminal({ route, onNavigate }: VariantProps) {
  const [platformPill, setPlatformPill] = useState<Platform | 'all'>('all');
  const [timeBasis, setTimeBasis] = useState<TimeBasis>('order_time');
  const [keyword, setKeyword] = useState('');
  const [reportMode, setReportMode] = useState<'summary' | 'sku'>('summary');
  const [includeDetailSheet, setIncludeDetailSheet] = useState(true);

  const filteredOrders = MOCK_ORDER_LINES.filter((r) => {
    if (platformPill !== 'all' && r.platform !== platformPill) return false;
    if (
      keyword.trim() &&
      !r.platform_order_id.includes(keyword.trim()) &&
      !r.product_name.includes(keyword.trim()) &&
      !(r.sku_code ?? '').includes(keyword.trim())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
      {/* Slim Dark Command Header */}
      <div
        style={{
          height: 44,
          background: '#111827',
          color: '#e5e7eb',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 13,
        }}
      >
        <Space size={16}>
          <span className="num-mono" style={{ fontWeight: 700, color: '#38bdf8' }}>
            SJH-DATA // TERMINAL
          </span>
          {(
            [
              ['import', '[1] 导入校验'],
              ['orders', '[2] 明细网格'],
              ['reports', '[3] 汇总报表'],
              ['management', '[4] 批次字典'],
            ] as [AppRouteKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
              style={{
                background: route === key ? '#1f2937' : 'transparent',
                color: route === key ? '#ffffff' : '#9ca3af',
                border: route === key ? '1px solid #374151' : '1px solid transparent',
                borderRadius: 4,
                padding: '3px 10px',
                cursor: 'pointer',
                fontSize: 12.5,
              }}
            >
              {label}
            </button>
          ))}
        </Space>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>方案 C · 高密度数据终端</span>
      </div>

      {/* Instant Platform Filter & Metric Ribbon */}
      <div
        style={{
          borderBottom: '1px solid #cbd5e1',
          background: '#f8fafc',
          padding: '7px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Space size={4} wrap>
          <button
            type="button"
            onClick={() => setPlatformPill('all')}
            style={{
              padding: '2px 10px',
              fontSize: 12,
              borderRadius: 3,
              cursor: 'pointer',
              border: '1px solid #cbd5e1',
              background: platformPill === 'all' ? '#0f172a' : '#fff',
              color: platformPill === 'all' ? '#fff' : '#334155',
            }}
          >
            全部平台
          </button>
          {(Object.keys(PLATFORM_META) as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatformPill(p)}
              style={{
                padding: '2px 10px',
                fontSize: 12,
                borderRadius: 3,
                cursor: 'pointer',
                border: '1px solid #cbd5e1',
                background: platformPill === p ? PLATFORM_META[p].color : '#fff',
                color: platformPill === p ? '#fff' : '#334155',
              }}
            >
              {PLATFORM_META[p].label}
            </button>
          ))}
        </Space>

        <Space size={12}>
          <Select
            size="small"
            value={timeBasis}
            onChange={setTimeBasis}
            style={{ width: 112 }}
            options={TIME_BASIS_OPTIONS}
          />
          <Input
            size="small"
            placeholder="快速过滤单号 / SKU / 商品"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 210 }}
            allowClear
          />
          <Button
            size="small"
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={() => message.success('已触发高密度视图 Excel 导出')}
          >
            导出 XLSX
          </Button>
        </Space>
      </div>

      {/* Main Flat Grid Body */}
      <div style={{ flex: 1, padding: '10px 16px 90px' }}>
        {route === 'import' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                background: '#f1f5f9',
                marginBottom: 10,
                fontSize: 12.5,
              }}
            >
              <span className="num-mono">
                FILE: <strong>{MOCK_PARSE_PREVIEW.file_name}</strong> | ENC: {MOCK_PARSE_PREVIEW.file_encoding} |
                TEMPLATE: <strong>{MOCK_PARSE_PREVIEW.matched_template?.code}</strong> (98%) | PII STRIPPED:{' '}
                {MOCK_PARSE_PREVIEW.pii_columns_detected.length} COLS
              </span>
              <Space>
                <Button size="small" icon={<DownloadOutlined />}>
                  错行 XLSX (4)
                </Button>
                <Button size="small" type="primary" onClick={() => message.success('原型：已提交 Upsert 入库')}>
                  执行 Upsert 入库 (1244)
                </Button>
              </Space>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ border: '1px solid #cbd5e1' }}>
                <div style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', fontWeight: 600, fontSize: 12 }}>
                  字段映射对照（京东 · 商家应收分摊=ON）
                </div>
                <Table
                  className="terminal-table"
                  size="small"
                  pagination={false}
                  rowKey="k"
                  dataSource={Object.entries(MOCK_TEMPLATES[0].column_mapping).map(([k, v]) => ({
                    k,
                    v: Array.isArray(v) ? v.join(' / ') : v,
                  }))}
                  columns={[
                    { title: 'Canonical', dataIndex: 'k', render: (v) => <span className="num-mono">{v}</span> },
                    { title: 'Raw Header', dataIndex: 'v' },
                  ]}
                />
              </div>
              <div style={{ border: '1px solid #cbd5e1' }}>
                <div style={{ padding: '6px 10px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontWeight: 600, fontSize: 12, color: '#991b1b' }}>
                  预校验阻断项：错误行 (4) + 未绑定店铺 (1: {MOCK_VALIDATE_RESPONSE.unknown_shops[0]})
                </div>
                <Table
                  className="terminal-table"
                  size="small"
                  pagination={false}
                  rowKey={(r) => `${r.row_number}-${r.field_name}`}
                  dataSource={MOCK_VALIDATE_RESPONSE.errors_preview}
                  columns={[
                    { title: 'ROW', dataIndex: 'row_number', width: 55, render: (v) => <span className="num-mono">{v}</span> },
                    { title: 'FIELD', dataIndex: 'field_name', width: 120, render: (v) => <span className="num-mono">{v}</span> },
                    { title: 'REASON', dataIndex: 'error_message' },
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {route === 'orders' && (
          <Table<OrderLine>
            className="terminal-table"
            bordered
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={filteredOrders}
            expandable={{
              expandedRowRender: (r) => (
                <div className="num-mono" style={{ fontSize: 12, background: '#f8fafc', padding: 8 }}>
                  <strong>raw_extra:</strong> {JSON.stringify(r.raw_extra)}
                </div>
              ),
            }}
            columns={[
              {
                title: '平台',
                dataIndex: 'platform',
                width: 64,
                render: (p: Platform) => <Tag color={PLATFORM_META[p].color} style={{ marginRight: 0 }}>{PLATFORM_META[p].label}</Tag>,
              },
              { title: '店铺', dataIndex: 'shop_name', width: 145 },
              { title: '订单号', dataIndex: 'platform_order_id', width: 165, render: (v) => <span className="num-mono">{v}</span> },
              { title: '行键', dataIndex: 'line_key', width: 145, render: (v) => <span className="num-mono">{v}</span> },
              {
                title: timeBasis === 'order_time' ? '下单时间' : '付款时间',
                width: 145,
                render: (_, r) => <span className="num-mono">{(timeBasis === 'order_time' ? r.order_time : r.pay_time) ?? '-'}</span>,
              },
              { title: '商品名称', dataIndex: 'product_name' },
              { title: '数', dataIndex: 'quantity', width: 46, align: 'right', render: (v) => <span className="num-mono">{v}</span> },
              {
                title: '实付/应收',
                width: 112,
                align: 'right',
                render: (_, r) => (
                  <span className="num-mono" style={{ fontWeight: 700, color: r.is_valid_for_gmv ? '#0f172a' : '#94a3b8' }}>
                    {r.paid_amount} {r.is_amount_prorated ? '⚡' : ''}
                  </span>
                ),
              },
              {
                title: '退款',
                dataIndex: 'refund_amount',
                width: 82,
                align: 'right',
                render: (v) => <span className="num-mono" style={{ color: v !== '0.00' ? '#dc2626' : '#94a3b8' }}>{v}</span>,
              },
              {
                title: '状态',
                width: 120,
                render: (_, r) => (
                  <span>
                    {NORMALIZED_STATUS_META[r.normalized_status].label}
                    {!r.is_valid_for_gmv && <Tag color="red" style={{ marginLeft: 4 }}>非GMV</Tag>}
                  </span>
                ),
              },
            ]}
          />
        )}

        {route === 'reports' && (
          <div>
            <div
              className="num-mono"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                marginBottom: 10,
                fontSize: 13,
              }}
            >
              <Space size={24}>
                <span>GMV: <strong>¥{MOCK_REPORT_KPI.gmv}</strong></span>
                <span style={{ color: '#0284c7' }}>NET: <strong>¥{MOCK_REPORT_KPI.net_sales}</strong></span>
                <span style={{ color: '#dc2626' }}>REFUND: <strong>¥{MOCK_REPORT_KPI.refund_amount}</strong></span>
                <span>ORDERS: <strong>{MOCK_REPORT_KPI.order_count}</strong></span>
                <span>UNITS: <strong>{MOCK_REPORT_KPI.units_sold}</strong></span>
              </Space>
              <Space>
                <Button size="small" type={reportMode === 'summary' ? 'primary' : 'default'} onClick={() => setReportMode('summary')}>
                  按店铺汇总
                </Button>
                <Button size="small" type={reportMode === 'sku' ? 'primary' : 'default'} onClick={() => setReportMode('sku')}>
                  按SKU排行
                </Button>
                <Switch
                  size="small"
                  checked={includeDetailSheet}
                  onChange={setIncludeDetailSheet}
                  checkedChildren="+明细Sheet"
                  unCheckedChildren="单Sheet"
                />
              </Space>
            </div>
            {reportMode === 'summary' ? (
              <Table
                className="terminal-table"
                bordered
                size="small"
                pagination={false}
                rowKey={(r) => `${r.period}-${r.shop_id}`}
                dataSource={MOCK_SUMMARY_ROWS}
                columns={[
                  { title: '周期', dataIndex: 'period', width: 105, render: (v) => <span className="num-mono">{v}</span> },
                  { title: '店铺', dataIndex: 'shop_name' },
                  { title: 'GMV', dataIndex: 'gmv', align: 'right', render: (v) => <span className="num-mono">{v}</span> },
                  { title: '退款额', dataIndex: 'refund_amount', align: 'right', render: (v) => <span className="num-mono">{v}</span> },
                  { title: '净销售额', dataIndex: 'net_sales', align: 'right', render: (v) => <strong className="num-mono">{v}</strong> },
                  { title: '去重订单', dataIndex: 'order_count', align: 'right', render: (v) => <span className="num-mono">{v}</span> },
                  { title: '销量', dataIndex: 'units_sold', align: 'right', render: (v) => <span className="num-mono">{v}</span> },
                ]}
              />
            ) : (
              <Table
                className="terminal-table"
                bordered
                size="small"
                pagination={false}
                rowKey={(r) => `${r.sku_code}-${r.platform}`}
                dataSource={MOCK_SKU_RANKING}
                columns={[
                  { title: 'SKU', dataIndex: 'sku_code', width: 140, render: (v) => <span className="num-mono">{v}</span> },
                  { title: '商品名称', dataIndex: 'product_name' },
                  { title: 'GMV', dataIndex: 'gmv', align: 'right', render: (v) => <span className="num-mono">{v}</span> },
                  { title: '净销售额', dataIndex: 'net_sales', align: 'right', render: (v) => <strong className="num-mono">{v}</strong> },
                  { title: '销量', dataIndex: 'units_sold', align: 'right', render: (v) => <span className="num-mono">{v}</span> },
                ]}
              />
            )}
          </div>
        )}

        {route === 'management' && (
          <Table
            className="terminal-table"
            bordered
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={MOCK_BATCHES}
            columns={[
              { title: '批次号', dataIndex: 'batch_no', width: 165, render: (v) => <span className="num-mono">{v}</span> },
              { title: '文件名', dataIndex: 'file_name' },
              {
                title: '来源',
                dataIndex: 'data_source',
                width: 95,
                render: (s: keyof typeof DATA_SOURCE_META) => DATA_SOURCE_META[s].label,
              },
              { title: '总/增/改/错', width: 145, render: (_, b) => <span className="num-mono">{b.total_rows}/{b.inserted_rows}/{b.updated_rows}/{b.error_rows}</span> },
              { title: '状态', dataIndex: 'status', width: 90 },
              {
                title: '操作',
                width: 140,
                render: (_, b) => (
                  <Button
                    size="small"
                    danger={b.can_rollback}
                    disabled={!b.can_rollback}
                    icon={<RollbackOutlined />}
                    onClick={() => message.warning(`原型：回滚 ${b.batch_no}`)}
                  >
                    {b.can_rollback ? '精确回滚' : b.blocking_batches.length ? '存在新批阻塞' : '已回滚'}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
