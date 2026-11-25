import { useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { ApiClientError, phase1Api } from '../api/client';
import {
  NORMALIZED_STATUS_META,
  PLATFORM_META,
  TIME_BASIS_OPTIONS,
  type NormalizedStatus,
  type Platform,
  type ReportGranularity,
  type ReportGroupBy,
  type SkuRankingFilter,
  type SkuRankingRow,
  type SkuSortBy,
  type SummaryReportFilter,
  type SummaryReportRow,
  type TimeBasis,
} from '../contracts/phase1';

const { RangePicker } = DatePicker;

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'summary' | 'sku_ranking'>('summary');
  const [timeBasis, setTimeBasis] = useState<TimeBasis>('order_time');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [shopId, setShopId] = useState<number | undefined>(undefined);
  const [normalizedStatus, setNormalizedStatus] = useState<NormalizedStatus | undefined>(undefined);

  const [granularity, setGranularity] = useState<ReportGranularity>('day');
  const [groupBy, setGroupBy] = useState<ReportGroupBy>('shop');
  const [skuSortBy, setSkuSortBy] = useState<SkuSortBy>('net_sales');
  const [skuPage, setSkuPage] = useState(1);
  const [includeDetailSheet, setIncludeDetailSheet] = useState(true);
  const [exporting, setExporting] = useState(false);

  const summaryFilters: SummaryReportFilter = {
    time_basis: timeBasis,
    date_from: dateRange?.[0]?.format('YYYY-MM-DD'),
    date_to: dateRange?.[1]?.format('YYYY-MM-DD'),
    platform: platforms.length > 0 ? platforms : undefined,
    shop_id: shopId,
    normalized_status: normalizedStatus,
    granularity,
    group_by: groupBy,
  };

  const skuFilters: SkuRankingFilter = {
    time_basis: timeBasis,
    date_from: dateRange?.[0]?.format('YYYY-MM-DD'),
    date_to: dateRange?.[1]?.format('YYYY-MM-DD'),
    platform: platforms.length > 0 ? platforms : undefined,
    shop_id: shopId,
    normalized_status: normalizedStatus,
    sort_by: skuSortBy,
    page: skuPage,
    page_size: 50,
  };

  const shopsQuery = useQuery({
    queryKey: ['shops'],
    queryFn: () => phase1Api.listShops(),
  });

  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', summaryFilters],
    queryFn: () => phase1Api.getSummaryReport(summaryFilters),
    enabled: activeTab === 'summary',
  });

  const skuQuery = useQuery({
    queryKey: ['reports', 'sku-ranking', skuFilters],
    queryFn: () => phase1Api.getSkuRanking(skuFilters),
    enabled: activeTab === 'sku_ranking',
  });

  const activeKpi =
    activeTab === 'summary' ? summaryQuery.data?.kpi : skuQuery.data?.kpi;

  const handleExport = async () => {
    setExporting(true);
    try {
      const filename = await phase1Api.exportReport(
        activeTab,
        includeDetailSheet,
        activeTab === 'summary' ? summaryFilters : skuFilters,
      );
      message.success(
        `已导出报表：${filename}（${includeDetailSheet ? '含汇总 + 标准化明细双 Sheet' : '仅汇总 Sheet'}）`,
      );
    } catch (err) {
      message.error(err instanceof ApiClientError ? err.message : '导出报表失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card variant="borderless" style={{ borderRadius: 10 }}>
        <Space wrap size={[12, 12]} style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap size={[10, 10]}>
            <Radio.Group
              aria-label="统计时间基准"
              value={timeBasis}
              onChange={(e) => {
                setTimeBasis(e.target.value);
                setSkuPage(1);
              }}
              optionType="button"
              options={TIME_BASIS_OPTIONS}
            />
            <RangePicker
              value={dateRange}
              onChange={(vals) => {
                setDateRange(vals);
                setSkuPage(1);
              }}
              placeholder={['开始日期', '结束日期']}
            />
            <Select
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              placeholder="销售平台"
              style={{ minWidth: 140 }}
              value={platforms}
              onChange={(val) => {
                setPlatforms(val);
                setSkuPage(1);
              }}
              options={Object.entries(PLATFORM_META).map(([k, v]) => ({ value: k, label: v.label }))}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="店铺"
              style={{ width: 170 }}
              value={shopId}
              onChange={(val) => {
                setShopId(val);
                setSkuPage(1);
              }}
              options={(shopsQuery.data?.items ?? []).map((s) => ({
                value: s.id,
                label: s.shop_name,
              }))}
            />
            <Select
              allowClear
              placeholder="标准状态"
              style={{ width: 135 }}
              value={normalizedStatus}
              onChange={(val) => {
                setNormalizedStatus(val);
                setSkuPage(1);
              }}
              options={Object.entries(NORMALIZED_STATUS_META).map(([k, v]) => ({
                value: k,
                label: v.label,
              }))}
            />
          </Space>

          <Space wrap>
            <Switch
              aria-label="导出附带标准化明细"
              checked={includeDetailSheet}
              onChange={setIncludeDetailSheet}
              checkedChildren="含明细 Sheet"
              unCheckedChildren="仅汇总 Sheet"
            />
            <Button
              type="primary"
              icon={<FileExcelOutlined />}
              loading={exporting}
              onClick={handleExport}
            >
              导出报表 Excel
            </Button>
          </Space>
        </Space>
      </Card>

      <Row gutter={[14, 14]}>
        <Col xs={12} md={5}>
          <Card variant="borderless" style={{ borderRadius: 10 }}>
            <Statistic
              title="GMV（有效成交总额）"
              value={activeKpi?.gmv ?? '0.00'}
              prefix="¥"
              valueStyle={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card variant="borderless" style={{ borderRadius: 10 }}>
            <Statistic
              title="净销售额（Net Sales）"
              value={activeKpi?.net_sales ?? '0.00'}
              prefix="¥"
              valueStyle={{ color: '#0284c7', fontVariantNumeric: 'tabular-nums' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card variant="borderless" style={{ borderRadius: 10 }}>
            <Statistic
              title="退款金额"
              value={activeKpi?.refund_amount ?? '0.00'}
              prefix="¥"
              valueStyle={{ color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card variant="borderless" style={{ borderRadius: 10 }}>
            <Statistic
              title="有效订单数（去重）"
              value={activeKpi?.order_count ?? 0}
              valueStyle={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </Card>
        </Col>
        <Col xs={24} md={5}>
          <Card variant="borderless" style={{ borderRadius: 10 }}>
            <Statistic
              title="销量（Units Sold）"
              value={activeKpi?.units_sold ?? 0}
              valueStyle={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </Card>
        </Col>
      </Row>

      <Card variant="borderless" style={{ borderRadius: 10 }}>
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as 'summary' | 'sku_ranking')}
          tabBarExtraContent={
            activeTab === 'summary' ? (
              <Space>
                <Select
                  size="small"
                  value={granularity}
                  onChange={setGranularity}
                  style={{ width: 105 }}
                  options={[
                    { value: 'day', label: '按日汇总' },
                    { value: 'week', label: '按周汇总' },
                    { value: 'month', label: '按月汇总' },
                  ]}
                />
                <Select
                  size="small"
                  value={groupBy}
                  onChange={setGroupBy}
                  style={{ width: 115 }}
                  options={[
                    { value: 'shop', label: '按店铺分组' },
                    { value: 'platform', label: '按平台分组' },
                    { value: 'none', label: '不分组总计' },
                  ]}
                />
              </Space>
            ) : (
              <Select
                size="small"
                value={skuSortBy}
                onChange={(val) => {
                  setSkuSortBy(val);
                  setSkuPage(1);
                }}
                style={{ width: 135 }}
                options={[
                  { value: 'net_sales', label: '按净销售额降序' },
                  { value: 'gmv', label: '按 GMV 降序' },
                  { value: 'units_sold', label: '按销量降序' },
                  { value: 'order_count', label: '按订单数降序' },
                ]}
              />
            )
          }
          items={[
            {
              key: 'summary',
              label: '日期 × 平台 / 店铺汇总',
              children: (
                <Table<SummaryReportRow>
                  size="small"
                  loading={summaryQuery.isLoading}
                  pagination={{ pageSize: 30 }}
                  rowKey={(r) => `${r.period}-${r.platform ?? 'all'}-${r.shop_id ?? 'none'}`}
                  dataSource={summaryQuery.data?.rows ?? []}
                  columns={[
                    {
                      title: '周期',
                      dataIndex: 'period',
                      width: 120,
                      render: (v: string) => <span className="num-mono">{v}</span>,
                    },
                    ...(groupBy !== 'none'
                      ? [
                          {
                            title: '销售平台',
                            dataIndex: 'platform',
                            width: 95,
                            render: (p: Platform | null) =>
                              p ? (
                                <Tag color={PLATFORM_META[p].color}>{PLATFORM_META[p].label}</Tag>
                              ) : (
                                '-'
                              ),
                          },
                        ]
                      : []),
                    ...(groupBy === 'shop'
                      ? [{ title: '店铺名称', dataIndex: 'shop_name', render: (v: string | null) => v ?? '-' }]
                      : []),
                    {
                      title: 'GMV',
                      dataIndex: 'gmv',
                      align: 'right' as const,
                      render: (v: string) => <span className="num-mono">¥{v}</span>,
                    },
                    {
                      title: '退款金额',
                      dataIndex: 'refund_amount',
                      align: 'right' as const,
                      render: (v: string) => (
                        <span className="num-mono" style={{ color: Number(v) > 0 ? '#dc2626' : '#64748b' }}>
                          ¥{v}
                        </span>
                      ),
                    },
                    {
                      title: '净销售额',
                      dataIndex: 'net_sales',
                      align: 'right' as const,
                      render: (v: string) => <strong className="num-mono">¥{v}</strong>,
                    },
                    {
                      title: '有效订单数',
                      dataIndex: 'order_count',
                      align: 'right' as const,
                      render: (v: number) => <span className="num-mono">{v}</span>,
                    },
                    {
                      title: '销量',
                      dataIndex: 'units_sold',
                      align: 'right' as const,
                      render: (v: number) => <span className="num-mono">{v}</span>,
                    },
                  ]}
                />
              ),
            },
            {
              key: 'sku_ranking',
              label: '商品 / SKU 排行汇总',
              children: (
                <Table<SkuRankingRow>
                  size="small"
                  loading={skuQuery.isLoading}
                  rowKey={(r) => `${r.platform}-${r.sku_code ?? ''}-${r.product_id ?? ''}-${r.product_name}`}
                  dataSource={skuQuery.data?.items ?? []}
                  pagination={{
                    current: skuPage,
                    pageSize: 50,
                    total: skuQuery.data?.total ?? 0,
                    onChange: setSkuPage,
                  }}
                  columns={[
                    {
                      title: 'SKU 编码',
                      dataIndex: 'sku_code',
                      width: 155,
                      render: (v: string | null) => <span className="num-mono">{v ?? '-'}</span>,
                    },
                    {
                      title: '商品 ID',
                      dataIndex: 'product_id',
                      width: 155,
                      render: (v: string | null) => <span className="num-mono">{v ?? '-'}</span>,
                    },
                    { title: '商品名称', dataIndex: 'product_name' },
                    {
                      title: '平台',
                      dataIndex: 'platform',
                      width: 85,
                      render: (p: Platform) => (
                        <Tag color={PLATFORM_META[p].color}>{PLATFORM_META[p].label}</Tag>
                      ),
                    },
                    {
                      title: 'GMV',
                      dataIndex: 'gmv',
                      align: 'right',
                      render: (v: string) => <span className="num-mono">¥{v}</span>,
                    },
                    {
                      title: '退款金额',
                      dataIndex: 'refund_amount',
                      align: 'right',
                      render: (v: string) => <span className="num-mono">¥{v}</span>,
                    },
                    {
                      title: '净销售额',
                      dataIndex: 'net_sales',
                      align: 'right',
                      render: (v: string) => <strong className="num-mono">¥{v}</strong>,
                    },
                    {
                      title: '有效订单数',
                      dataIndex: 'order_count',
                      align: 'right',
                      render: (v: number) => <span className="num-mono">{v}</span>,
                    },
                    {
                      title: '销量',
                      dataIndex: 'units_sold',
                      align: 'right',
                      render: (v: number) => <span className="num-mono">{v}</span>,
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
