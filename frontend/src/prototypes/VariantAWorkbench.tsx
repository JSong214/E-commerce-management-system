import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Input,
  Layout,
  Menu,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CloudUploadOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  InboxOutlined,
  RollbackOutlined,
  SettingOutlined,
  TableOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import {
  DATA_SOURCE_META,
  NORMALIZED_STATUS_META,
  PLATFORM_META,
  TIME_BASIS_OPTIONS,
  type DuplicateStrategy,
  type OrderLine,
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
  MOCK_STATUS_MAPPINGS,
  MOCK_SUMMARY_ROWS,
  MOCK_TEMPLATES,
  MOCK_VALIDATE_RESPONSE,
} from '../mocks/phase1MockData';

const { Sider, Header, Content } = Layout;
const { Title, Text } = Typography;

export type AppRouteKey = 'import' | 'orders' | 'reports' | 'management';

interface VariantProps {
  route: AppRouteKey;
  onNavigate: (next: AppRouteKey) => void;
}

const ROUTE_TITLES: Record<AppRouteKey, string> = {
  import: '数据导入与清洗校验向导',
  orders: '标准化销售明细查询与导出',
  reports: '多维汇总报表与导出',
  management: '导入批次、映射模板与店铺管理',
};

/**
 * Variant A: Classic Left-Rail Enterprise Workbench
 * Slim dark-slate left navigation rail + structured Ant Design Steps wizard + standard card layout.
 */
export function VariantAWorkbench({ route, onNavigate }: VariantProps) {
  const [importStep, setImportStep] = useState(0);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('upsert');
  const [prorateEnabled, setProrateEnabled] = useState(true);
  const [boundUnknownShop, setBoundUnknownShop] = useState<Platform | undefined>(undefined);
  const [timeBasis, setTimeBasis] = useState<TimeBasis>('order_time');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [inspectRow, setInspectRow] = useState<OrderLine | null>(null);
  const [includeDetailSheet, setIncludeDetailSheet] = useState(true);
  const [reportTab, setReportTab] = useState<'summary' | 'sku'>('summary');

  const filteredOrders = MOCK_ORDER_LINES.filter((item) => {
    if (platformFilter !== 'all' && item.platform !== platformFilter) return false;
    if (
      keyword.trim() &&
      !item.platform_order_id.includes(keyword.trim()) &&
      !item.product_name.includes(keyword.trim()) &&
      !(item.sku_code ?? '').includes(keyword.trim())
    ) {
      return false;
    }
    return true;
  });

  return (
    <Layout style={{ minHeight: '100vh', background: '#f4f6f9' }}>
      <Sider
        width={220}
        style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }}
      >
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(148,163,184,0.16)' }}>
          <Space align="center" size={10}>
            <DatabaseOutlined style={{ fontSize: 22, color: '#38bdf8' }} />
            <div>
              <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
                SJH-DATA
              </div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>电商销售数据管理平台</div>
            </div>
          </Space>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[route]}
          style={{ background: '#0f172a', marginTop: 8 }}
          onClick={({ key }) => onNavigate(key as AppRouteKey)}
          items={[
            { key: 'import', icon: <CloudUploadOutlined />, label: '数据导入向导' },
            { key: 'orders', icon: <TableOutlined />, label: '明细查询与导出' },
            { key: 'reports', icon: <BarChartOutlined />, label: '汇总报表导出' },
            { key: 'management', icon: <SettingOutlined />, label: '批次与配置管理' },
          ]}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#ffffff',
            padding: '0 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 58,
          }}
        >
          <Space size={12}>
            <Title level={5} style={{ margin: 0 }}>
              {ROUTE_TITLES[route]}
            </Title>
            <Tag color="blue">方案 A · 极简工作台</Tag>
          </Space>
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              数据源：淘宝 / 天猫 / 抖音 / 京东 / 拼多多 / 聚水潭
            </Text>
          </Space>
        </Header>

        <Content style={{ padding: '20px 24px 80px', maxWidth: 1480, width: '100%', margin: '0 auto' }}>
          {route === 'import' && (
            <Card variant="borderless" style={{ borderRadius: 10 }}>
              <Steps
                current={importStep}
                onChange={setImportStep}
                style={{ marginBottom: 24 }}
                items={[
                  { title: '1. 上传文件', description: '自动识别编码与模板' },
                  { title: '2. 列映射与规则', description: '支持京东分摊与另存模板' },
                  { title: '3. 预校验与绑定', description: '错行下载 + 新店铺归属' },
                  { title: '4. 确认入库', description: 'Upsert 覆盖或跳过' },
                ]}
              />

              {importStep === 0 && (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Upload.Dragger
                    beforeUpload={() => {
                      message.success('已加载脱敏样例：JD_空调旗舰店_202611_脱敏样例.csv');
                      setImportStep(1);
                      return false;
                    }}
                    showUploadList={false}
                  >
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">点击或拖拽各平台导出的 Excel / CSV 文件到此区域</p>
                    <p className="ant-upload-hint">
                      自动探测 GBK/UTF-8 编码、匹配 7 套内置平台表头指纹，并自动丢弃买家姓名/手机/详细地址等 PII 字段
                    </p>
                  </Upload.Dragger>
                  <Alert
                    type="info"
                    showIcon
                    message={`演示样例已就绪：${MOCK_PARSE_PREVIEW.file_name}（${MOCK_PARSE_PREVIEW.file_encoding}，共 ${MOCK_PARSE_PREVIEW.total_rows} 行，匹配模板「${MOCK_PARSE_PREVIEW.matched_template?.name}」98%）`}
                    action={
                      <Button type="primary" size="small" onClick={() => setImportStep(1)}>
                        进入列映射
                      </Button>
                    }
                  />
                </Space>
              )}

              {importStep === 1 && (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Row gutter={16} align="middle">
                    <Col span={8}>
                      <Text strong>匹配模板：</Text>
                      <Select
                        style={{ width: '100%', marginTop: 4 }}
                        defaultValue={1}
                        options={MOCK_TEMPLATES.map((t) => ({ value: t.id, label: t.name }))}
                      />
                    </Col>
                    <Col span={8}>
                      <Text strong>默认归属店铺（无店铺列时必填）：</Text>
                      <Select
                        style={{ width: '100%', marginTop: 4 }}
                        defaultValue={1}
                        options={MOCK_SHOPS.map((s) => ({
                          value: s.id,
                          label: `${s.shop_name} (${PLATFORM_META[s.platform].label})`,
                        }))}
                      />
                    </Col>
                    <Col span={8}>
                      <Space direction="vertical" size={4}>
                        <Text strong>京东整单「商家应收」按京东价分摊</Text>
                        <Switch
                          checked={prorateEnabled}
                          onChange={setProrateEnabled}
                          checkedChildren="已开启"
                          unCheckedChildren="已关闭"
                        />
                      </Space>
                    </Col>
                  </Row>

                  <Alert
                    type="warning"
                    showIcon
                    message={`已自动剥离 ${MOCK_PARSE_PREVIEW.pii_columns_detected.length} 个隐私列（${MOCK_PARSE_PREVIEW.pii_columns_detected.join('、')}），不入库且不写入 raw_extra`}
                  />

                  <Table
                    size="small"
                    pagination={false}
                    rowKey="canonical"
                    dataSource={Object.entries(MOCK_TEMPLATES[0].column_mapping).map(([canonical, raw]) => ({
                      canonical,
                      raw: Array.isArray(raw) ? raw.join(' / ') : raw,
                      note:
                        canonical === 'paid_amount'
                          ? '清洗中文尾注 + 按「京东价×数量」整单分摊'
                          : canonical === 'sku_code'
                            ? '允许为空（自动回退商品ID生成行键）'
                            : '标准映射',
                    }))}
                    columns={[
                      { title: '系统标准字段', dataIndex: 'canonical', width: 200 },
                      {
                        title: '原始表头列',
                        dataIndex: 'raw',
                        width: 220,
                        render: (v: string) => <Tag color="geekblue">{v}</Tag>,
                      },
                      { title: '清洗说明', dataIndex: 'note' },
                    ]}
                  />

                  <Space>
                    <Button onClick={() => setImportStep(0)}>上一步</Button>
                    <Button onClick={() => message.info('原型模式：可另存为自定义模板')}>
                      另存为自定义模板
                    </Button>
                    <Button type="primary" onClick={() => setImportStep(2)}>
                      运行预校验
                    </Button>
                  </Space>
                </Space>
              )}

              {importStep === 2 && (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Row gutter={12}>
                    <Col span={4}>
                      <Statistic title="总行数" value={MOCK_VALIDATE_RESPONSE.summary.total_rows} />
                    </Col>
                    <Col span={4}>
                      <Statistic
                        title="校验通过"
                        value={MOCK_VALIDATE_RESPONSE.summary.valid_rows}
                        valueStyle={{ color: '#16a34a' }}
                      />
                    </Col>
                    <Col span={4}>
                      <Statistic
                        title="错误行"
                        value={MOCK_VALIDATE_RESPONSE.summary.error_rows}
                        valueStyle={{ color: '#dc2626' }}
                      />
                    </Col>
                    <Col span={4}>
                      <Statistic
                        title="预计新增 / 更新"
                        value={`${MOCK_VALIDATE_RESPONSE.summary.estimated_inserts} / ${MOCK_VALIDATE_RESPONSE.summary.estimated_updates}`}
                      />
                    </Col>
                    <Col span={4}>
                      <Statistic
                        title="整单分摊订单"
                        value={MOCK_VALIDATE_RESPONSE.summary.prorated_orders}
                        valueStyle={{ color: '#2563eb' }}
                      />
                    </Col>
                  </Row>

                  <Alert
                    type={boundUnknownShop ? 'success' : 'error'}
                    showIcon
                    message={
                      boundUnknownShop
                        ? `新店铺「${MOCK_VALIDATE_RESPONSE.unknown_shops[0]}」已绑定至 ${PLATFORM_META[boundUnknownShop].label}`
                        : `发现 1 个未绑定平台的新店铺：${MOCK_VALIDATE_RESPONSE.unknown_shops[0]}（入库前必须完成平台归属）`
                    }
                    action={
                      <Select
                        size="small"
                        placeholder="选择归属平台"
                        style={{ width: 140 }}
                        value={boundUnknownShop}
                        onChange={(val) => {
                          setBoundUnknownShop(val);
                          message.success('已绑定店铺归属平台');
                        }}
                        options={Object.entries(PLATFORM_META).map(([k, v]) => ({
                          value: k,
                          label: v.label,
                        }))}
                      />
                    }
                  />

                  <Card
                    size="small"
                    title="校验错误行预览（可导出修正后重导）"
                    extra={
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={() => message.success('已触发错误行 Excel 下载（脱敏）')}
                      >
                        下载错误行 Excel
                      </Button>
                    }
                  >
                    <Table
                      size="small"
                      pagination={false}
                      rowKey={(r) => `${r.row_number}-${r.field_name}`}
                      dataSource={MOCK_VALIDATE_RESPONSE.errors_preview}
                      columns={[
                        { title: '行号', dataIndex: 'row_number', width: 80 },
                        { title: '字段', dataIndex: 'field_name', width: 150 },
                        { title: '原始值', dataIndex: 'raw_value', width: 140, render: (v) => v || '(空)' },
                        { title: '错误原因', dataIndex: 'error_message' },
                      ]}
                    />
                  </Card>

                  <Card size="small" title="清洗与分摊提示（Warnings）">
                    {MOCK_VALIDATE_RESPONSE.warnings_preview.map((w) => (
                      <div key={w.row_number} style={{ marginBottom: 4, fontSize: 13 }}>
                        <Tag color="blue">第 {w.row_number} 行</Tag> {w.message}
                      </div>
                    ))}
                  </Card>

                  <Space>
                    <Button onClick={() => setImportStep(1)}>返回调整映射</Button>
                    <Button
                      type="primary"
                      disabled={!boundUnknownShop}
                      onClick={() => setImportStep(3)}
                    >
                      下一步：确认入库策略
                    </Button>
                  </Space>
                </Space>
              )}

              {importStep === 3 && (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Radio.Group
                    value={duplicateStrategy}
                    onChange={(e) => setDuplicateStrategy(e.target.value)}
                  >
                    <Space direction="vertical">
                      <Radio value="upsert">
                        <strong>覆盖更新（Upsert · 推荐）</strong>：按 (平台 + 订单号 + 行键) 更新已有记录并记录回滚快照
                      </Radio>
                      <Radio value="skip">
                        <strong>跳过重复（Skip）</strong>：已存在订单行保持不变，仅写入新行
                      </Radio>
                    </Space>
                  </Radio.Group>
                  <Space>
                    <Button onClick={() => setImportStep(2)}>上一步</Button>
                    <Button
                      type="primary"
                      onClick={() => {
                        message.success('批次 IMP-20261124-0016 已提交入库（新增 1180 / 更新 64 / 跳过错误 4）');
                        onNavigate('orders');
                      }}
                    >
                      跳过 4 条错误行并正式入库
                    </Button>
                  </Space>
                </Space>
              )}
            </Card>
          )}

          {route === 'orders' && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card variant="borderless" style={{ borderRadius: 10 }}>
                <Space wrap size={12}>
                  <Select
                    aria-label="统计时间基准"
                    value={timeBasis}
                    onChange={setTimeBasis}
                    style={{ width: 130 }}
                    options={TIME_BASIS_OPTIONS}
                  />
                  <Select
                    value={platformFilter}
                    onChange={setPlatformFilter}
                    style={{ width: 130 }}
                    options={[
                      { value: 'all', label: '全部平台' },
                      ...Object.entries(PLATFORM_META).map(([k, v]) => ({ value: k, label: v.label })),
                    ]}
                  />
                  <Input.Search
                    placeholder="搜索订单号 / SKU / 商品名"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    style={{ width: 260 }}
                    allowClear
                  />
                  <Button
                    type="primary"
                    icon={<FileExcelOutlined />}
                    onClick={() => message.success('已导出标准化明细 Excel（订单号强制文本格式）')}
                  >
                    导出 Excel
                  </Button>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={() => message.success('已导出 UTF-8-BOM CSV')}
                  >
                    导出 CSV
                  </Button>
                </Space>
              </Card>

              <Card variant="borderless" style={{ borderRadius: 10 }}>
                <Table
                  size="small"
                  rowKey="id"
                  scroll={{ x: 1180 }}
                  dataSource={filteredOrders}
                  columns={[
                    {
                      title: '平台 / 店铺',
                      width: 190,
                      render: (_, r) => (
                        <div>
                          <Tag color={PLATFORM_META[r.platform].color}>{PLATFORM_META[r.platform].label}</Tag>
                          <div style={{ fontSize: 12, color: '#475569' }}>{r.shop_name}</div>
                        </div>
                      ),
                    },
                    {
                      title: '平台订单号 / 行键',
                      width: 200,
                      render: (_, r) => (
                        <div className="num-mono" style={{ fontSize: 12 }}>
                          <div>{r.platform_order_id}</div>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {r.line_key}
                          </Text>
                        </div>
                      ),
                    },
                    {
                      title: timeBasis === 'order_time' ? '下单时间' : '付款时间',
                      width: 155,
                      render: (_, r) => (
                        <span className="num-mono" style={{ fontSize: 12 }}>
                          {(timeBasis === 'order_time' ? r.order_time : r.pay_time) ?? '-'}
                        </span>
                      ),
                    },
                    {
                      title: '商品名称 / SKU',
                      width: 260,
                      render: (_, r) => (
                        <div>
                          <div style={{ fontSize: 13 }}>{r.product_name}</div>
                          <Space size={4}>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {r.sku_code ?? r.product_id ?? '-'}
                            </Text>
                            {r.is_gift && <Tag color="purple">外机/赠品</Tag>}
                          </Space>
                        </div>
                      ),
                    },
                    { title: '数量', dataIndex: 'quantity', width: 65, align: 'right' },
                    {
                      title: '实付/应收',
                      width: 120,
                      align: 'right',
                      render: (_, r) => (
                        <div className="num-mono">
                          <strong>¥{r.paid_amount}</strong>
                          {r.is_amount_prorated && (
                            <div>
                              <Tag color="blue" style={{ marginRight: 0, fontSize: 10 }}>
                                整单分摊
                              </Tag>
                            </div>
                          )}
                        </div>
                      ),
                    },
                    {
                      title: '标准状态',
                      width: 140,
                      render: (_, r) => (
                        <div>
                          <Badge
                            status={
                              NORMALIZED_STATUS_META[r.normalized_status].color as
                                | 'default'
                                | 'processing'
                                | 'success'
                                | 'error'
                            }
                            text={NORMALIZED_STATUS_META[r.normalized_status].label}
                          />
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            原始: {r.raw_order_status} {!r.is_valid_for_gmv && '(不计GMV)'}
                          </div>
                        </div>
                      ),
                    },
                    {
                      title: '原始扩展',
                      width: 85,
                      fixed: 'right',
                      render: (_, r) => (
                        <Button type="link" size="small" onClick={() => setInspectRow(r)}>
                          查看
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            </Space>
          )}

          {route === 'reports' && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card variant="borderless" style={{ borderRadius: 10 }}>
                <Space wrap size={16} style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space wrap>
                    <Radio.Group
                      value={timeBasis}
                      onChange={(e) => setTimeBasis(e.target.value)}
                      optionType="button"
                      options={TIME_BASIS_OPTIONS}
                    />
                    <Select
                      defaultValue="day"
                      style={{ width: 110 }}
                      options={[
                        { value: 'day', label: '按日汇总' },
                        { value: 'week', label: '按周汇总' },
                        { value: 'month', label: '按月汇总' },
                      ]}
                    />
                  </Space>
                  <Space>
                    <Switch
                      checked={includeDetailSheet}
                      onChange={setIncludeDetailSheet}
                      checkedChildren="含明细 Sheet"
                      unCheckedChildren="仅汇总 Sheet"
                    />
                    <Button
                      type="primary"
                      icon={<FileExcelOutlined />}
                      onClick={() =>
                        message.success(
                          `已导出汇总报表 Excel（${includeDetailSheet ? '汇总 + 标准化明细双 Sheet' : '仅汇总 Sheet'}）`,
                        )
                      }
                    >
                      导出报表 Excel
                    </Button>
                  </Space>
                </Space>
              </Card>

              <Row gutter={14}>
                <Col span={5}>
                  <Card variant="borderless" style={{ borderRadius: 10 }}>
                    <Statistic title="GMV（有效成交）" value={MOCK_REPORT_KPI.gmv} prefix="¥" />
                  </Card>
                </Col>
                <Col span={5}>
                  <Card variant="borderless" style={{ borderRadius: 10 }}>
                    <Statistic
                      title="净销售额（Net Sales）"
                      value={MOCK_REPORT_KPI.net_sales}
                      prefix="¥"
                      valueStyle={{ color: '#0284c7' }}
                    />
                  </Card>
                </Col>
                <Col span={5}>
                  <Card variant="borderless" style={{ borderRadius: 10 }}>
                    <Statistic
                      title="退款金额"
                      value={MOCK_REPORT_KPI.refund_amount}
                      prefix="¥"
                      valueStyle={{ color: '#dc2626' }}
                    />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card variant="borderless" style={{ borderRadius: 10 }}>
                    <Statistic title="有效订单数（去重）" value={MOCK_REPORT_KPI.order_count} />
                  </Card>
                </Col>
                <Col span={5}>
                  <Card variant="borderless" style={{ borderRadius: 10 }}>
                    <Statistic title="销量（件）" value={MOCK_REPORT_KPI.units_sold} />
                  </Card>
                </Col>
              </Row>

              <Card variant="borderless" style={{ borderRadius: 10 }}>
                <Tabs
                  activeKey={reportTab}
                  onChange={(k) => setReportTab(k as 'summary' | 'sku')}
                  items={[
                    {
                      key: 'summary',
                      label: '日期 × 平台 / 店铺汇总',
                      children: (
                        <Table
                          size="small"
                          pagination={false}
                          rowKey={(r) => `${r.period}-${r.shop_id}`}
                          dataSource={MOCK_SUMMARY_ROWS}
                          columns={[
                            { title: '周期', dataIndex: 'period', width: 120 },
                            {
                              title: '平台',
                              dataIndex: 'platform',
                              width: 90,
                              render: (p: Platform) => <Tag color={PLATFORM_META[p].color}>{PLATFORM_META[p].label}</Tag>,
                            },
                            { title: '店铺', dataIndex: 'shop_name' },
                            { title: 'GMV', dataIndex: 'gmv', align: 'right', render: (v) => <span className="num-mono">¥{v}</span> },
                            { title: '退款额', dataIndex: 'refund_amount', align: 'right', render: (v) => <span className="num-mono">¥{v}</span> },
                            { title: '净销售额', dataIndex: 'net_sales', align: 'right', render: (v) => <strong className="num-mono">¥{v}</strong> },
                            { title: '订单数', dataIndex: 'order_count', align: 'right' },
                            { title: '销量', dataIndex: 'units_sold', align: 'right' },
                          ]}
                        />
                      ),
                    },
                    {
                      key: 'sku',
                      label: '商品 / SKU 排行汇总',
                      children: (
                        <Table
                          size="small"
                          pagination={false}
                          rowKey={(r) => `${r.sku_code}-${r.platform}`}
                          dataSource={MOCK_SKU_RANKING}
                          columns={[
                            { title: 'SKU编码', dataIndex: 'sku_code', width: 150, render: (v) => <span className="num-mono">{v}</span> },
                            { title: '商品名称', dataIndex: 'product_name' },
                            {
                              title: '平台',
                              dataIndex: 'platform',
                              width: 85,
                              render: (p: Platform) => <Tag color={PLATFORM_META[p].color}>{PLATFORM_META[p].label}</Tag>,
                            },
                            { title: '净销售额', dataIndex: 'net_sales', align: 'right', render: (v) => <strong className="num-mono">¥{v}</strong> },
                            { title: '销量', dataIndex: 'units_sold', align: 'right' },
                            { title: '订单数', dataIndex: 'order_count', align: 'right' },
                          ]}
                        />
                      ),
                    },
                  ]}
                />
              </Card>
            </Space>
          )}

          {route === 'management' && (
            <Card variant="borderless" style={{ borderRadius: 10 }}>
              <Tabs
                items={[
                  {
                    key: 'batches',
                    label: '导入批次历史（精确回滚）',
                    children: (
                      <Table
                        size="small"
                        rowKey="id"
                        pagination={false}
                        dataSource={MOCK_BATCHES}
                        columns={[
                          { title: '批次号', dataIndex: 'batch_no', width: 170, render: (v) => <span className="num-mono">{v}</span> },
                          { title: '文件名', dataIndex: 'file_name' },
                          {
                            title: '来源',
                            dataIndex: 'data_source',
                            width: 110,
                            render: (s: keyof typeof DATA_SOURCE_META) => (
                              <Tag color={DATA_SOURCE_META[s].color}>{DATA_SOURCE_META[s].label}</Tag>
                            ),
                          },
                          {
                            title: '新增 / 更新 / 错行',
                            width: 150,
                            render: (_, b) => (
                              <span className="num-mono">
                                {b.inserted_rows} / {b.updated_rows} /{' '}
                                <span style={{ color: b.error_rows > 0 ? '#dc2626' : '#64748b' }}>
                                  {b.error_rows}
                                </span>
                              </span>
                            ),
                          },
                          {
                            title: '状态',
                            dataIndex: 'status',
                            width: 100,
                            render: (st: string) =>
                              st === 'committed' ? <Tag color="green">已入库</Tag> : <Tag>已回滚</Tag>,
                          },
                          {
                            title: '操作',
                            width: 150,
                            render: (_, b) =>
                              b.status === 'rolled_back' ? (
                                <Text type="secondary">已于 {b.rolled_back_at?.slice(11)} 回滚</Text>
                              ) : b.can_rollback ? (
                                <Button
                                  danger
                                  size="small"
                                  icon={<RollbackOutlined />}
                                  onClick={() => message.warning(`原型：将精确回滚批次 ${b.batch_no}`)}
                                >
                                  精确回滚
                                </Button>
                              ) : (
                                <Tooltip title={`被较新批次阻塞：${b.blocking_batches.join(', ')}`}>
                                  <Button size="small" disabled icon={<RollbackOutlined />}>
                                    需先回滚新批
                                  </Button>
                                </Tooltip>
                              ),
                          },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'templates',
                    label: '映射模板（内置 6 大平台）',
                    children: (
                      <Table
                        size="small"
                        rowKey="id"
                        pagination={false}
                        dataSource={MOCK_TEMPLATES}
                        columns={[
                          { title: '模板名称', dataIndex: 'name' },
                          { title: '编码', dataIndex: 'code', render: (v) => <span className="num-mono">{v}</span> },
                          {
                            title: '分摊规则',
                            render: (_, t) =>
                              t.rules.prorate_order_amount ? <Tag color="blue">开启整单分摊</Tag> : <Tag>行级实付</Tag>,
                          },
                          { title: '类型', render: (_, t) => (t.is_builtin ? <Tag>系统内置</Tag> : <Tag color="purple">自定义</Tag>) },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'shops',
                    label: '店铺-平台归属与状态字典',
                    children: (
                      <Row gutter={16}>
                        <Col span={12}>
                          <Table
                            size="small"
                            rowKey="id"
                            pagination={false}
                            title={() => <strong>店铺-平台归属表</strong>}
                            dataSource={MOCK_SHOPS}
                            columns={[
                              { title: '店铺名称', dataIndex: 'shop_name' },
                              {
                                title: '归属平台',
                                dataIndex: 'platform',
                                render: (p: Platform) => <Tag color={PLATFORM_META[p].color}>{PLATFORM_META[p].label}</Tag>,
                              },
                            ]}
                          />
                        </Col>
                        <Col span={12}>
                          <Table
                            size="small"
                            rowKey="id"
                            pagination={false}
                            title={() => <strong>平台状态归一化字典</strong>}
                            dataSource={MOCK_STATUS_MAPPINGS}
                            columns={[
                              { title: '来源', dataIndex: 'data_source', width: 90 },
                              { title: '原始状态', dataIndex: 'raw_status' },
                              {
                                title: '计入 GMV',
                                dataIndex: 'is_valid_for_gmv',
                                width: 90,
                                render: (v: boolean) => (v ? <Tag color="green">是</Tag> : <Tag color="red">否</Tag>),
                              },
                            ]}
                          />
                        </Col>
                      </Row>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </Content>
      </Layout>

      <Drawer
        title={`订单行原始扩展字段 (raw_extra)`}
        open={Boolean(inspectRow)}
        onClose={() => setInspectRow(null)}
        width={480}
      >
        {inspectRow && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="平台订单号">{inspectRow.platform_order_id}</Descriptions.Item>
            <Descriptions.Item label="行唯一键">{inspectRow.line_key}</Descriptions.Item>
            <Descriptions.Item label="实付/应收">¥{inspectRow.paid_amount}</Descriptions.Item>
            {Object.entries(inspectRow.raw_extra).map(([k, v]) => (
              <Descriptions.Item key={k} label={k}>
                {String(v)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Drawer>
    </Layout>
  );
}
