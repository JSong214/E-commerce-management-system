import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { DownloadOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { ApiClientError } from '../api/client';
import { v2Api } from '../api/v2Client';
import { PLATFORM_META, type OrderLine, type Platform } from '../contracts/phase1';
import {
  AMOUNT_SOURCE_LABELS,
  EFFECTIVE_TIME_BASIS_OPTIONS,
  ELIGIBILITY_STATUS_META,
  EXCLUSION_REASON_LABELS,
  MODEL_MATCH_STATUS_META,
  SOURCE_ROLE_META,
  type EffectiveSalesFilter,
  type EffectiveSalesRecord,
  type EffectiveTimeBasis,
  type EligibilityStatus,
  type ModelMatchStatus,
  type SourceRole,
} from '../contracts/v2';

const { RangePicker } = DatePicker;
const { Text } = Typography;

export function EffectiveSalesPage() {
  const navigate = useNavigate();

  const [timeBasis, setTimeBasis] = useState<EffectiveTimeBasis>('business_time');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [platform, setPlatform] = useState<Platform | undefined>(undefined);
  const [shopId, setShopId] = useState<number | undefined>(undefined);
  const [brand, setBrand] = useState<string | undefined>(undefined);
  const [eligibilityStatus, setEligibilityStatus] = useState<EligibilityStatus | 'all'>('valid');
  const [modelMatchStatus, setModelMatchStatus] = useState<ModelMatchStatus | 'pending' | 'all'>(
    'all',
  );
  const [sourceRole, setSourceRole] = useState<SourceRole | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);

  const [detailId, setDetailId] = useState<number | null>(null);

  const filters: EffectiveSalesFilter = useMemo(
    () => ({
      time_basis: timeBasis,
      start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
      end_date: dateRange?.[1]?.format('YYYY-MM-DD'),
      platform,
      shop_id: shopId,
      brand,
      eligibility_status: eligibilityStatus,
      model_match_status: modelMatchStatus,
      source_role: sourceRole,
      keyword: keyword.trim() || undefined,
      page,
      page_size: pageSize,
    }),
    [
      timeBasis,
      dateRange,
      platform,
      shopId,
      brand,
      eligibilityStatus,
      modelMatchStatus,
      sourceRole,
      keyword,
      page,
      pageSize,
    ],
  );

  const shopsQuery = useQuery({
    queryKey: ['v2-shops-all'],
    queryFn: () => v2Api.listShops(),
  });

  const categoriesQuery = useQuery({
    queryKey: ['v2-categories'],
    queryFn: () => v2Api.listCategories(),
  });

  const salesQuery = useQuery({
    queryKey: ['effective-sales', filters],
    queryFn: () => v2Api.listEffectiveSales(filters),
  });

  const detailQuery = useQuery({
    queryKey: ['effective-sales-detail', detailId],
    queryFn: () => v2Api.getEffectiveSale(detailId!),
    enabled: detailId !== null,
  });

  const brandOptions = useMemo(
    () => Array.from(new Set((categoriesQuery.data?.items ?? []).map((c) => c.brand))),
    [categoriesQuery.data?.items],
  );

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(format);
    try {
      const filename = await v2Api.exportEffectiveSales(filters, format);
      message.success(`已导出 ${filename}`);
    } catch (err) {
      message.error(err instanceof ApiClientError ? err.message : '导出失败');
    } finally {
      setExporting(null);
    }
  };

  const kpi = salesQuery.data?.kpi;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Top KPI Strip */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="有效销售条数" value={kpi?.valid_records ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card size="small">
            <Statistic title="有效销量（整机/件）" value={kpi?.valid_sales_quantity ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card size="small">
            <Statistic
              title="有效销售额"
              prefix="¥"
              value={kpi?.valid_sales_amount ?? '0.00'}
              valueStyle={{ color: '#0369a1' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card size="small">
            <Statistic
              title="已排除 / 待核对"
              value={kpi?.excluded_records ?? 0}
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  / 待核对 {kpi?.needs_review_records ?? 0}
                </Text>
              }
            />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card
            size="small"
            hoverable
            onClick={() => navigate('/model-review')}
            style={{
              borderColor: (kpi?.pending_model_records ?? 0) > 0 ? '#faad14' : undefined,
            }}
          >
            <Statistic
              title="待确认型号（点击处理）"
              value={kpi?.pending_model_records ?? 0}
              valueStyle={{
                color: (kpi?.pending_model_records ?? 0) > 0 ? '#d48806' : '#3f8600',
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters & Eligibility Switch */}
      <Card size="small">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Segmented
              value={eligibilityStatus}
              onChange={(v) => {
                setEligibilityStatus(v as EligibilityStatus | 'all');
                setPage(1);
              }}
              options={[
                { label: `有效销售 (${kpi?.valid_records ?? 0})`, value: 'valid' },
                { label: `排除清单 (${kpi?.excluded_records ?? 0})`, value: 'excluded' },
                { label: `待核对 (${kpi?.needs_review_records ?? 0})`, value: 'needs_review' },
                { label: `全部 (${kpi?.total_records ?? 0})`, value: 'all' },
              ]}
            />
            <Space wrap>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => salesQuery.refetch()}
                loading={salesQuery.isFetching}
              >
                刷新
              </Button>
              <Button
                icon={<DownloadOutlined />}
                loading={exporting === 'xlsx'}
                type="primary"
                onClick={() => handleExport('xlsx')}
              >
                导出 Excel
              </Button>
              <Button
                icon={<DownloadOutlined />}
                loading={exporting === 'csv'}
                onClick={() => handleExport('csv')}
              >
                导出 CSV
              </Button>
            </Space>
          </Space>

          <Space wrap>
            <Select
              style={{ width: 150 }}
              value={timeBasis}
              onChange={(v) => {
                setTimeBasis(v);
                setPage(1);
              }}
              options={EFFECTIVE_TIME_BASIS_OPTIONS}
            />
            <RangePicker
              value={dateRange}
              onChange={(vals) => {
                setDateRange(vals);
                setPage(1);
              }}
            />
            <Select
              allowClear
              placeholder="平台"
              style={{ width: 115 }}
              value={platform}
              onChange={(v) => {
                setPlatform(v);
                setPage(1);
              }}
              options={(Object.keys(PLATFORM_META) as Platform[]).map((p) => ({
                value: p,
                label: PLATFORM_META[p].label,
              }))}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="店铺"
              style={{ width: 190 }}
              value={shopId}
              onChange={(v) => {
                setShopId(v);
                setPage(1);
              }}
              options={(shopsQuery.data?.items ?? []).map((s) => ({
                value: s.id,
                label: s.shop_name,
              }))}
            />
            <Select
              allowClear
              placeholder="品牌"
              style={{ width: 110 }}
              value={brand}
              onChange={(v) => {
                setBrand(v);
                setPage(1);
              }}
              options={brandOptions.map((b) => ({ value: b, label: b }))}
            />
            <Select
              style={{ width: 140 }}
              value={modelMatchStatus}
              onChange={(v) => {
                setModelMatchStatus(v);
                setPage(1);
              }}
              options={[
                { value: 'all', label: '全部型号状态' },
                { value: 'pending', label: '待确认 (冲突+未命中)' },
                { value: 'matched', label: '自动命中' },
                { value: 'manual_confirmed', label: '人工已确认' },
                { value: 'ambiguous', label: '一对多冲突' },
                { value: 'unmatched', label: '未命中型号' },
              ]}
            />
            <Select
              allowClear
              placeholder="来源角色"
              style={{ width: 145 }}
              value={sourceRole}
              onChange={(v) => {
                setSourceRole(v);
                setPage(1);
              }}
              options={(Object.keys(SOURCE_ROLE_META) as SourceRole[]).map((r) => ({
                value: r,
                label: SOURCE_ROLE_META[r].label,
              }))}
            />
            <Input.Search
              allowClear
              placeholder="搜订单号/标准型号/商品"
              style={{ width: 220 }}
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
            />
          </Space>
        </Space>
      </Card>

      {/* Main Effective Sales Table */}
      <Card size="small">
        <Table<EffectiveSalesRecord>
          rowKey="id"
          size="small"
          loading={salesQuery.isLoading}
          dataSource={salesQuery.data?.items ?? []}
          scroll={{ x: 1440 }}
          pagination={{
            current: page,
            pageSize,
            total: salesQuery.data?.total ?? 0,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showTotal: (t) => `共 ${t} 条记录`,
          }}
          columns={[
            {
              title: '业务时间',
              dataIndex: 'business_time',
              width: 155,
              render: (v: string) => v?.replace('T', ' ').slice(0, 19),
            },
            {
              title: '业务订单号',
              dataIndex: 'business_order_id',
              width: 195,
              render: (v: string, row) => (
                <Space direction="vertical" size={0}>
                  <Text code copyable={{ text: v }}>
                    {v}
                  </Text>
                  {row.source_order_line_ids.length > 1 && (
                    <Tag color="blue" style={{ fontSize: 11, marginTop: 2 }}>
                      整机合并 ({row.source_order_line_ids.length} 原始行)
                    </Tag>
                  )}
                </Space>
              ),
            },
            {
              title: '店铺 / 平台',
              dataIndex: 'shop_name',
              width: 185,
              render: (name: string, row) => (
                <Space direction="vertical" size={2}>
                  <Text>{name}</Text>
                  <Space size={4}>
                    <Tag color={PLATFORM_META[row.platform]?.color}>
                      {PLATFORM_META[row.platform]?.label ?? row.platform}
                    </Tag>
                    <Tag color={SOURCE_ROLE_META[row.source_role]?.color}>
                      {SOURCE_ROLE_META[row.source_role]?.label ?? row.source_role}
                    </Tag>
                  </Space>
                </Space>
              ),
            },
            {
              title: '标准型号 & 品牌',
              dataIndex: 'standard_model',
              width: 240,
              render: (model: string | null, row) => (
                <Space direction="vertical" size={2}>
                  <Space size={4} wrap>
                    <Tag color={MODEL_MATCH_STATUS_META[row.model_match_status]?.color}>
                      {MODEL_MATCH_STATUS_META[row.model_match_status]?.label}
                    </Tag>
                    {row.brand && <Tag>{row.brand}</Tag>}
                    {model ? (
                      <Text strong>{model}</Text>
                    ) : (
                      <Text type="secondary">{row.raw_product_summary || '未匹配'}</Text>
                    )}
                  </Space>
                </Space>
              ),
            },
            {
              title: '销量',
              dataIndex: 'sales_quantity',
              width: 65,
              align: 'right',
            },
            {
              title: '销售额 / 口径',
              dataIndex: 'sales_amount',
              width: 155,
              align: 'right',
              render: (amt: string, row) => (
                <Space direction="vertical" size={0} align="end">
                  <Text strong>¥{amt}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {AMOUNT_SOURCE_LABELS[row.amount_source] ?? row.amount_source}
                  </Text>
                </Space>
              ),
            },
            {
              title: '有效性 / 原因',
              dataIndex: 'eligibility_status',
              width: 165,
              render: (st: EligibilityStatus, row) => (
                <Space direction="vertical" size={2}>
                  <Tag color={ELIGIBILITY_STATUS_META[st]?.color}>
                    {ELIGIBILITY_STATUS_META[st]?.label ?? st}
                  </Tag>
                  {row.exclusion_reason && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {EXCLUSION_REASON_LABELS[row.exclusion_reason] ?? row.exclusion_reason}
                    </Text>
                  )}
                </Space>
              ),
            },
            {
              title: '省市 / ERP补全',
              width: 135,
              render: (_, row) => (
                <Space direction="vertical" size={2}>
                  <Text style={{ fontSize: 12 }}>
                    {[row.province, row.city].filter(Boolean).join(' / ') || '-'}
                  </Text>
                  {row.erp_enriched && (
                    <Tag color="cyan" style={{ fontSize: 11 }}>
                      ERP已补全
                    </Tag>
                  )}
                </Space>
              ),
            },
            {
              title: '备注提示',
              dataIndex: 'notices',
              width: 160,
              render: (notices?: string[] | null) =>
                notices && notices.length > 0 ? (
                  <Tooltip title={notices.join('；')}>
                    <Tag color="gold">{notices[0]}</Tag>
                  </Tooltip>
                ) : (
                  '-'
                ),
            },
            {
              title: '追溯',
              width: 85,
              fixed: 'right',
              render: (_, row) => (
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => setDetailId(row.id)}
                >
                  详情
                </Button>
              ),
            },
          ]}
        />
      </Card>

      {/* Traceability Drawer (Layer 2 -> Layer 1) */}
      <Drawer
        title={`有效销售追溯详情 #${detailId ?? ''}`}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        width={820}
        loading={detailQuery.isLoading}
      >
        {detailQuery.data && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="业务订单号">
                <Text code copyable>
                  {detailQuery.data.business_order_id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="记录键 (record_key)">
                <Text code>{detailQuery.data.record_key}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="店铺 / 平台">
                {detailQuery.data.shop_name} (
                {PLATFORM_META[detailQuery.data.platform]?.label ?? detailQuery.data.platform})
              </Descriptions.Item>
              <Descriptions.Item label="来源角色">
                <Tag color={SOURCE_ROLE_META[detailQuery.data.source_role]?.color}>
                  {SOURCE_ROLE_META[detailQuery.data.source_role]?.label}
                </Tag>
                {detailQuery.data.erp_enriched && <Tag color="cyan">ERP已补全</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="标准型号">
                {detailQuery.data.standard_model || '未匹配'}{' '}
                <Tag color={MODEL_MATCH_STATUS_META[detailQuery.data.model_match_status]?.color}>
                  {MODEL_MATCH_STATUS_META[detailQuery.data.model_match_status]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="品牌 / 品类 / 板块">
                {[
                  detailQuery.data.business_segment,
                  detailQuery.data.category,
                  detailQuery.data.brand,
                ]
                  .filter(Boolean)
                  .join(' / ') || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="有效销量">
                {detailQuery.data.sales_quantity}
              </Descriptions.Item>
              <Descriptions.Item label="销售额 & 口径">
                <Text strong>¥{detailQuery.data.sales_amount}</Text>（
                {AMOUNT_SOURCE_LABELS[detailQuery.data.amount_source] ??
                  detailQuery.data.amount_source}
                ）
              </Descriptions.Item>
              <Descriptions.Item label="有效性">
                <Tag color={ELIGIBILITY_STATUS_META[detailQuery.data.eligibility_status]?.color}>
                  {ELIGIBILITY_STATUS_META[detailQuery.data.eligibility_status]?.label}
                </Tag>
                {detailQuery.data.exclusion_reason &&
                  ` · ${EXCLUSION_REASON_LABELS[detailQuery.data.exclusion_reason] ?? detailQuery.data.exclusion_reason}`}
              </Descriptions.Item>
              <Descriptions.Item label="省市">
                {[detailQuery.data.province, detailQuery.data.city].filter(Boolean).join(' / ') ||
                  '-'}
              </Descriptions.Item>
              <Descriptions.Item label="业务时间 / 下单 / 付款" span={2}>
                业务: {detailQuery.data.business_time} | 下单: {detailQuery.data.order_time} | 付款:{' '}
                {detailQuery.data.pay_time || '-'}
              </Descriptions.Item>
            </Descriptions>

            {detailQuery.data.notices && detailQuery.data.notices.length > 0 && (
              <Alert
                type="info"
                showIcon
                message="业务提示备注"
                description={detailQuery.data.notices.join('；')}
              />
            )}

            <Card
              size="small"
              title={`关联原始订单行 Layer 1 (${detailQuery.data.source_order_lines.length} 行)`}
            >
              <Table<OrderLine>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detailQuery.data.source_order_lines}
                scroll={{ x: 740 }}
                columns={[
                  { title: '行ID', dataIndex: 'id', width: 65 },
                  { title: '商品名称', dataIndex: 'product_name', ellipsis: true },
                  { title: '数量', dataIndex: 'quantity', width: 60 },
                  {
                    title: '实付/商家应收',
                    dataIndex: 'paid_amount',
                    width: 110,
                    render: (v: string) => `¥${v}`,
                  },
                  {
                    title: '应付金额(K)',
                    dataIndex: 'payable_amount',
                    width: 105,
                    render: (v?: string | null) => (v ? `¥${v}` : '-'),
                  },
                  {
                    title: '原始状态 / ERP状态',
                    width: 150,
                    render: (_, l) => (
                      <Space direction="vertical" size={0}>
                        <Text style={{ fontSize: 12 }}>{l.raw_order_status}</Text>
                        {l.erp_raw_status && (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            ERP: {l.erp_raw_status}
                          </Text>
                        )}
                      </Space>
                    ),
                  },
                  {
                    title: 'ERP补全字段',
                    dataIndex: 'erp_enriched_fields',
                    width: 130,
                    render: (fields?: string[] | null) =>
                      fields && fields.length > 0 ? fields.join(', ') : '-',
                  },
                ]}
              />
            </Card>
          </Space>
        )}
      </Drawer>
    </Space>
  );
}
