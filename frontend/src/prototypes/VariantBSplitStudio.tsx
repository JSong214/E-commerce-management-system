import { useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Input,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CloudUploadOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import {
  DATA_SOURCE_META,
  NORMALIZED_STATUS_META,
  PLATFORM_META,
  TIME_BASIS_OPTIONS,
  type DuplicateStrategy,
  type Platform,
  type TimeBasis,
} from '../contracts/phase1';
import {
  MOCK_BATCHES,
  MOCK_ORDER_LINES,
  MOCK_PARSE_PREVIEW,
  MOCK_REPORT_KPI,
  MOCK_SHOPS,
  MOCK_SKU_RANKING,
  MOCK_SUMMARY_ROWS,
  MOCK_TEMPLATES,
  MOCK_VALIDATE_RESPONSE,
} from '../mocks/phase1MockData';
import type { AppRouteKey } from './VariantAWorkbench';

const { Text, Title } = Typography;

interface VariantProps {
  route: AppRouteKey;
  onNavigate: (next: AppRouteKey) => void;
}

/**
 * Variant B: Split-Pane Analyst Studio
 * Full-width top navigation bar (maximizes horizontal width for wide e-commerce tables)
 * paired with an asymmetric Left Control/Filter Rail + Right Live Data Canvas.
 */
export function VariantBSplitStudio({ route, onNavigate }: VariantProps) {
  const [timeBasis, setTimeBasis] = useState<TimeBasis>('order_time');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('upsert');
  const [prorateEnabled, setProrateEnabled] = useState(true);
  const [boundShopPlatform, setBoundShopPlatform] = useState<Platform | undefined>(undefined);
  const [selectedBatchId, setSelectedBatchId] = useState<number>(MOCK_BATCHES[0].id);
  const [reportView, setReportView] = useState<'summary' | 'sku'>('summary');
  const [includeDetailSheet, setIncludeDetailSheet] = useState(true);

  const selectedBatch = MOCK_BATCHES.find((b) => b.id === selectedBatchId) ?? MOCK_BATCHES[0];
  const filteredOrders = MOCK_ORDER_LINES.filter(
    (item) => platformFilter === 'all' || item.platform === platformFilter,
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
      {/* Top Horizontal Nav Bar — zero left menu rail */}
      <header
        style={{
          height: 54,
          padding: '0 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f8fafc',
        }}
      >
        <Space size={24}>
          <Space size={8}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                color: '#fff',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
              }}
            >
              SJ
            </div>
            <strong style={{ fontSize: 15 }}>SJH-DATA Studio</strong>
          </Space>
          <Space size={4}>
            {(
              [
                ['import', '导入与清洗'],
                ['orders', '明细查询'],
                ['reports', '汇总报表'],
                ['management', '批次与字典'],
              ] as [AppRouteKey, string][]
            ).map(([key, label]) => (
              <Button
                key={key}
                type={route === key ? 'primary' : 'text'}
                size="small"
                onClick={() => onNavigate(key)}
              >
                {label}
              </Button>
            ))}
          </Space>
        </Space>
        <Tag color="cyan">方案 B · 双栏操作台</Tag>
      </header>

      {/* Split-Pane Main Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 'calc(100vh - 54px)', paddingBottom: 64 }}>
        {/* Left Sticky Control Rail */}
        <aside
          style={{
            width: 320,
            flexShrink: 0,
            borderRight: '1px solid #e2e8f0',
            background: '#f8fafc',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {route === 'import' && (
            <>
              <Title level={5} style={{ margin: 0 }}>
                导入参数控制栏
              </Title>
              <Button
                type="dashed"
                icon={<CloudUploadOutlined />}
                block
                style={{ height: 56 }}
                onClick={() => message.success('已切换样例文件')}
              >
                选择 / 替换 Excel 或 CSV
              </Button>
              <div style={{ fontSize: 12, color: '#475569' }}>
                当前文件：<strong>{MOCK_PARSE_PREVIEW.file_name}</strong>（{MOCK_PARSE_PREVIEW.file_encoding}）
              </div>
              <div>
                <Text strong style={{ fontSize: 12 }}>
                  自动匹配模板（98%）
                </Text>
                <Select
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  defaultValue={1}
                  options={MOCK_TEMPLATES.map((t) => ({ value: t.id, label: t.name }))}
                />
              </div>
              <div>
                <Text strong style={{ fontSize: 12 }}>
                  默认店铺（无店铺列时生效）
                </Text>
                <Select
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  defaultValue={1}
                  options={MOCK_SHOPS.map((s) => ({ value: s.id, label: s.shop_name }))}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12 }}>京东「商家应收」整单分摊</Text>
                <Switch size="small" checked={prorateEnabled} onChange={setProrateEnabled} />
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <div>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                  待绑定新店铺（入库前必填）
                </Text>
                <Select
                  size="small"
                  placeholder="华东分销二店 → 归属平台"
                  style={{ width: '100%' }}
                  value={boundShopPlatform}
                  onChange={setBoundShopPlatform}
                  options={Object.entries(PLATFORM_META).map(([k, v]) => ({ value: k, label: v.label }))}
                />
              </div>
              <div>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                  重复订单策略
                </Text>
                <Radio.Group
                  size="small"
                  value={duplicateStrategy}
                  onChange={(e) => setDuplicateStrategy(e.target.value)}
                  optionType="button"
                  options={[
                    { value: 'upsert', label: '覆盖更新' },
                    { value: 'skip', label: '跳过重复' },
                  ]}
                />
              </div>
              <Button
                type="primary"
                block
                disabled={!boundShopPlatform}
                onClick={() => message.success('已按双栏配置提交入库')}
              >
                跳过 4 条错行并入库（1244 行）
              </Button>
            </>
          )}

          {(route === 'orders' || route === 'reports') && (
            <>
              <Title level={5} style={{ margin: 0 }}>
                {route === 'orders' ? '明细筛选器' : '报表口径与导出'}
              </Title>
              <div>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  统计时间基准（不含发货时间）
                </Text>
                <Radio.Group
                  size="small"
                  value={timeBasis}
                  onChange={(e) => setTimeBasis(e.target.value)}
                  optionType="button"
                  options={TIME_BASIS_OPTIONS}
                />
              </div>
              <div>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  销售平台
                </Text>
                <Select
                  size="small"
                  style={{ width: '100%' }}
                  value={platformFilter}
                  onChange={setPlatformFilter}
                  options={[
                    { value: 'all', label: '全部平台' },
                    ...Object.entries(PLATFORM_META).map(([k, v]) => ({ value: k, label: v.label })),
                  ]}
                />
              </div>
              {route === 'orders' ? (
                <>
                  <Input size="small" placeholder="订单号 / SKU / 商品关键词" />
                  <Divider style={{ margin: '4px 0' }} />
                  <Button
                    type="primary"
                    icon={<FileExcelOutlined />}
                    block
                    onClick={() => message.success('已导出标准化明细 Excel')}
                  >
                    导出标准化 Excel
                  </Button>
                  <Button icon={<DownloadOutlined />} block onClick={() => message.success('已导出 CSV')}>
                    导出 UTF-8-BOM CSV
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      报表视图
                    </Text>
                    <Radio.Group
                      size="small"
                      value={reportView}
                      onChange={(e) => setReportView(e.target.value)}
                      optionType="button"
                      options={[
                        { value: 'summary', label: '平台/店铺汇总' },
                        { value: 'sku', label: 'SKU 排行' },
                      ]}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12 }}>导出附带标准化明细 Sheet</Text>
                    <Switch size="small" checked={includeDetailSheet} onChange={setIncludeDetailSheet} />
                  </div>
                  <Button
                    type="primary"
                    icon={<FileExcelOutlined />}
                    block
                    onClick={() => message.success('已导出汇总报表 Excel')}
                  >
                    一键导出报表 Excel
                  </Button>
                </>
              )}
            </>
          )}

          {route === 'management' && (
            <>
              <Title level={5} style={{ margin: 0 }}>
                导入批次列表
              </Title>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {MOCK_BATCHES.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBatchId(b.id)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: selectedBatchId === b.id ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                      background: selectedBatchId === b.id ? '#eff6ff' : '#ffffff',
                    }}
                  >
                    <div className="num-mono" style={{ fontSize: 12, fontWeight: 600 }}>
                      {b.batch_no}
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{b.file_name}</div>
                    <Space size={4} style={{ marginTop: 4 }}>
                      <Tag color={DATA_SOURCE_META[b.data_source].color}>{DATA_SOURCE_META[b.data_source].label}</Tag>
                      {b.status === 'committed' ? <Tag color="green">已入库</Tag> : <Tag>已回滚</Tag>}
                    </Space>
                  </div>
                ))}
              </Space>
            </>
          )}
        </aside>

        {/* Right Live Preview / Data Canvas */}
        <main style={{ flex: 1, padding: '18px 22px', overflowX: 'auto' }}>
          {route === 'import' && (
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                message="左右对照模式：左侧调模板/开关，右侧实时看分摊预览与错误行（无需来回翻页）"
              />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Tag color="blue" style={{ padding: '4px 10px' }}>总行 {MOCK_VALIDATE_RESPONSE.summary.total_rows}</Tag>
                <Tag color="green" style={{ padding: '4px 10px' }}>通过 {MOCK_VALIDATE_RESPONSE.summary.valid_rows}</Tag>
                <Tag color="red" style={{ padding: '4px 10px' }}>错行 {MOCK_VALIDATE_RESPONSE.summary.error_rows}</Tag>
                <Tag color="purple" style={{ padding: '4px 10px' }}>京东分摊订单 {MOCK_VALIDATE_RESPONSE.summary.prorated_orders}</Tag>
                <Tag style={{ padding: '4px 10px' }}>已剥离 PII：{MOCK_PARSE_PREVIEW.pii_columns_detected.join('、')}</Tag>
              </div>

              <div>
                <Title level={5} style={{ marginTop: 0 }}>
                  京东整单分摊实时效果预览（订单 3691453007789022 · 商家应收 5748.01）
                </Title>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={MOCK_ORDER_LINES.slice(0, 3)}
                  columns={[
                    { title: '行键', dataIndex: 'line_key', width: 150, render: (v) => <span className="num-mono">{v}</span> },
                    { title: '商品名称', dataIndex: 'product_name' },
                    { title: '京东价', dataIndex: 'unit_price', align: 'right', render: (v) => <span className="num-mono">¥{v}</span> },
                    {
                      title: '分摊后实付',
                      dataIndex: 'paid_amount',
                      align: 'right',
                      render: (v) => <strong className="num-mono" style={{ color: '#0284c7' }}>¥{v}</strong>,
                    },
                  ]}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Title level={5} style={{ margin: 0 }}>校验错误行（4）</Title>
                  <Button size="small" icon={<DownloadOutlined />}>下载错误行 Excel</Button>
                </div>
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(r) => `${r.row_number}-${r.field_name}`}
                  dataSource={MOCK_VALIDATE_RESPONSE.errors_preview}
                  columns={[
                    { title: '行号', dataIndex: 'row_number', width: 70 },
                    { title: '字段', dataIndex: 'field_name', width: 140 },
                    { title: '原始值', dataIndex: 'raw_value', width: 110, render: (v) => v || '(空)' },
                    { title: '原因', dataIndex: 'error_message' },
                  ]}
                />
              </div>
            </Space>
          )}

          {route === 'orders' && (
            <Table
              size="small"
              rowKey="id"
              dataSource={filteredOrders}
              pagination={{ pageSize: 20 }}
              columns={[
                {
                  title: '平台',
                  dataIndex: 'platform',
                  width: 75,
                  render: (p: Platform) => <Tag color={PLATFORM_META[p].color}>{PLATFORM_META[p].label}</Tag>,
                },
                { title: '店铺', dataIndex: 'shop_name', width: 160 },
                { title: '平台订单号', dataIndex: 'platform_order_id', width: 175, render: (v) => <span className="num-mono">{v}</span> },
                {
                  title: timeBasis === 'order_time' ? '下单时间' : '付款时间',
                  width: 155,
                  render: (_, r) => <span className="num-mono">{(timeBasis === 'order_time' ? r.order_time : r.pay_time) ?? '-'}</span>,
                },
                { title: '商品名称', dataIndex: 'product_name' },
                { title: '数量', dataIndex: 'quantity', width: 60, align: 'right' },
                { title: '实付/应收', dataIndex: 'paid_amount', width: 110, align: 'right', render: (v) => <strong className="num-mono">¥{v}</strong> },
                {
                  title: '状态',
                  dataIndex: 'normalized_status',
                  width: 110,
                  render: (st: keyof typeof NORMALIZED_STATUS_META) => (
                    <Tag>{NORMALIZED_STATUS_META[st].label}</Tag>
                  ),
                },
              ]}
            />
          )}

          {route === 'reports' && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                  gap: 10,
                  padding: 14,
                  background: '#f8fafc',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>GMV</Text>
                  <div className="num-mono" style={{ fontSize: 18, fontWeight: 700 }}>¥{MOCK_REPORT_KPI.gmv}</div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>净销售额</Text>
                  <div className="num-mono" style={{ fontSize: 18, fontWeight: 700, color: '#0284c7' }}>¥{MOCK_REPORT_KPI.net_sales}</div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>退款额</Text>
                  <div className="num-mono" style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>¥{MOCK_REPORT_KPI.refund_amount}</div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>去重订单数</Text>
                  <div className="num-mono" style={{ fontSize: 18, fontWeight: 700 }}>{MOCK_REPORT_KPI.order_count}</div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>销量</Text>
                  <div className="num-mono" style={{ fontSize: 18, fontWeight: 700 }}>{MOCK_REPORT_KPI.units_sold}</div>
                </div>
              </div>

              {reportView === 'summary' ? (
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(r) => `${r.period}-${r.shop_id}`}
                  dataSource={MOCK_SUMMARY_ROWS}
                  columns={[
                    { title: '日期', dataIndex: 'period', width: 110 },
                    { title: '店铺', dataIndex: 'shop_name' },
                    { title: 'GMV', dataIndex: 'gmv', align: 'right', render: (v) => <span className="num-mono">¥{v}</span> },
                    { title: '退款', dataIndex: 'refund_amount', align: 'right', render: (v) => <span className="num-mono">¥{v}</span> },
                    { title: '净销售额', dataIndex: 'net_sales', align: 'right', render: (v) => <strong className="num-mono">¥{v}</strong> },
                    { title: '订单数', dataIndex: 'order_count', align: 'right' },
                    { title: '销量', dataIndex: 'units_sold', align: 'right' },
                  ]}
                />
              ) : (
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(r) => `${r.sku_code}-${r.platform}`}
                  dataSource={MOCK_SKU_RANKING}
                  columns={[
                    { title: 'SKU', dataIndex: 'sku_code', width: 150, render: (v) => <span className="num-mono">{v}</span> },
                    { title: '商品', dataIndex: 'product_name' },
                    { title: '净销售额', dataIndex: 'net_sales', align: 'right', render: (v) => <strong className="num-mono">¥{v}</strong> },
                    { title: '销量', dataIndex: 'units_sold', align: 'right' },
                  ]}
                />
              )}
            </Space>
          )}

          {route === 'management' && (
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Title level={4} style={{ margin: 0 }}>{selectedBatch.batch_no}</Title>
                  <Text type="secondary">{selectedBatch.file_name} · {selectedBatch.template_name_snapshot}</Text>
                </div>
                <Button
                  danger
                  icon={<RollbackOutlined />}
                  disabled={!selectedBatch.can_rollback}
                  onClick={() => message.warning(`原型：精确回滚 ${selectedBatch.batch_no}`)}
                >
                  {selectedBatch.can_rollback ? '精确回滚本批次' : '不可直接回滚'}
                </Button>
              </div>
              {selectedBatch.blocking_batches.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  message={`回滚冲突保护：较新批次 ${selectedBatch.blocking_batches.join(', ')} 已覆盖更新过本批次的部分订单行，请先回滚较新批次。`}
                />
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>总行数</Text>
                  <div className="num-mono" style={{ fontSize: 20, fontWeight: 700 }}>{selectedBatch.total_rows}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>新增行数</Text>
                  <div className="num-mono" style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{selectedBatch.inserted_rows}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Upsert 更新行数</Text>
                  <div className="num-mono" style={{ fontSize: 20, fontWeight: 700, color: '#2563eb' }}>{selectedBatch.updated_rows}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>校验错行</Text>
                  <div className="num-mono" style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{selectedBatch.error_rows}</div>
                </div>
              </div>
            </Space>
          )}
        </main>
      </div>
    </div>
  );
}
