import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { DownloadOutlined, FileExcelOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { ApiClientError, phase1Api } from '../api/client';
import {
  DATA_SOURCE_META,
  NORMALIZED_STATUS_META,
  PLATFORM_META,
  TIME_BASIS_OPTIONS,
  type DataSource,
  type NormalizedStatus,
  type OrderLine,
  type OrderLinesFilter,
  type Platform,
  type TimeBasis,
} from '../contracts/phase1';

const { RangePicker } = DatePicker;
const { Text } = Typography;

export function OrderLinesPage() {
  const [timeBasis, setTimeBasis] = useState<TimeBasis>('order_time');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [shopId, setShopId] = useState<number | undefined>(undefined);
  const [dataSource, setDataSource] = useState<DataSource | undefined>(undefined);
  const [normalizedStatus, setNormalizedStatus] = useState<NormalizedStatus | undefined>(undefined);
  const [batchId, setBatchId] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);
  const [inspectRow, setInspectRow] = useState<OrderLine | null>(null);

  const filters: OrderLinesFilter = {
    time_basis: timeBasis,
    date_from: dateRange?.[0]?.format('YYYY-MM-DD'),
    date_to: dateRange?.[1]?.format('YYYY-MM-DD'),
    platform: platforms.length > 0 ? platforms : undefined,
    shop_id: shopId,
    data_source: dataSource,
    normalized_status: normalizedStatus,
    batch_id: batchId,
    keyword: keyword.trim() || undefined,
    page,
    page_size: pageSize,
  };

  const ordersQuery = useQuery({
    queryKey: ['order-lines', filters],
    queryFn: () => phase1Api.listOrderLines(filters),
  });

  const shopsQuery = useQuery({
    queryKey: ['shops'],
    queryFn: () => phase1Api.listShops(),
  });

  const batchesQuery = useQuery({
    queryKey: ['batches', 'filter-options'],
    queryFn: () => phase1Api.listBatches({ page: 1, page_size: 100 }),
  });

  const handleReset = () => {
    setTimeBasis('order_time');
    setDateRange(null);
    setPlatforms([]);
    setShopId(undefined);
    setDataSource(undefined);
    setNormalizedStatus(undefined);
    setBatchId(undefined);
    setKeyword('');
    setPage(1);
  };

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(format);
    try {
      const filename = await phase1Api.exportOrderLines(filters, format);
      message.success(`已导出标准化明细：${filename}`);
    } catch (err) {
      message.error(err instanceof ApiClientError ? err.message : '导出失败');
    } finally {
      setExporting(null);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card variant="borderless" style={{ borderRadius: 10 }}>
        <Space wrap size={[10, 10]} style={{ width: '100%' }}>
          <Select
            aria-label="统计时间基准"
            value={timeBasis}
            onChange={(val) => {
              setTimeBasis(val);
              setPage(1);
            }}
            style={{ width: 120 }}
            options={TIME_BASIS_OPTIONS}
          />
          <RangePicker
            value={dateRange}
            onChange={(vals) => {
              setDateRange(vals);
              setPage(1);
            }}
            placeholder={['开始日期', '结束日期']}
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            placeholder="销售平台"
            style={{ minWidth: 150 }}
            value={platforms}
            onChange={(val) => {
              setPlatforms(val);
              setPage(1);
            }}
            options={Object.entries(PLATFORM_META).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="店铺"
            style={{ width: 180 }}
            value={shopId}
            onChange={(val) => {
              setShopId(val);
              setPage(1);
            }}
            options={(shopsQuery.data?.items ?? []).map((s) => ({
              value: s.id,
              label: s.shop_name,
            }))}
          />
          <Select
            allowClear
            placeholder="数据来源"
            style={{ width: 130 }}
            value={dataSource}
            onChange={(val) => {
              setDataSource(val);
              setPage(1);
            }}
            options={Object.entries(DATA_SOURCE_META).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <Select
            allowClear
            placeholder="标准状态"
            style={{ width: 140 }}
            value={normalizedStatus}
            onChange={(val) => {
              setNormalizedStatus(val);
              setPage(1);
            }}
            options={Object.entries(NORMALIZED_STATUS_META).map(([k, v]) => ({
              value: k,
              label: v.label,
            }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="导入批次"
            style={{ width: 200 }}
            value={batchId}
            onChange={(val) => {
              setBatchId(val);
              setPage(1);
            }}
            options={(batchesQuery.data?.items ?? []).map((b) => ({
              value: b.id,
              label: `${b.batch_no} (${b.file_name})`,
            }))}
          />
          <Input.Search
            placeholder="订单号 / SKU / 商品ID / 商品名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={() => setPage(1)}
            style={{ width: 250 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            重置
          </Button>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            loading={exporting === 'xlsx'}
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
      </Card>

      <Card variant="borderless" style={{ borderRadius: 10 }}>
        <Table<OrderLine>
          size="small"
          rowKey="id"
          loading={ordersQuery.isLoading}
          dataSource={ordersQuery.data?.items ?? []}
          scroll={{ x: 1320 }}
          pagination={{
            current: page,
            pageSize,
            total: ordersQuery.data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100, 200],
            showTotal: (t) => `共 ${t} 条标准化订单商品明细`,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            },
          }}
          columns={[
            {
              title: '平台 / 店铺',
              width: 190,
              render: (_, r) => (
                <div>
                  <Space size={4}>
                    <Tag color={PLATFORM_META[r.platform].color}>
                      {PLATFORM_META[r.platform].label}
                    </Tag>
                    <Tag color={DATA_SOURCE_META[r.data_source].color} style={{ fontSize: 11 }}>
                      {DATA_SOURCE_META[r.data_source].label}
                    </Tag>
                  </Space>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{r.shop_name}</div>
                </div>
              ),
            },
            {
              title: '平台订单号 / 行键',
              width: 205,
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
              width: 160,
              render: (_, r) => (
                <span className="num-mono" style={{ fontSize: 12 }}>
                  {(timeBasis === 'order_time' ? r.order_time : r.pay_time) ?? '-'}
                </span>
              ),
            },
            {
              title: '商品名称 / SKU',
              width: 270,
              render: (_, r) => (
                <div>
                  <div style={{ fontSize: 13 }}>{r.product_name}</div>
                  <Space size={4} wrap>
                    <Text type="secondary" className="num-mono" style={{ fontSize: 11 }}>
                      {r.sku_code ?? r.product_id ?? '-'}
                    </Text>
                    {r.sku_spec && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        ({r.sku_spec})
                      </Text>
                    )}
                    {r.is_gift && <Tag color="purple">外机/赠品</Tag>}
                  </Space>
                </div>
              ),
            },
            {
              title: '数量',
              dataIndex: 'quantity',
              width: 65,
              align: 'right',
              render: (v: number) => <span className="num-mono">{v}</span>,
            },
            {
              title: '实付/应收',
              width: 125,
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
              title: '退款额',
              dataIndex: 'refund_amount',
              width: 95,
              align: 'right',
              render: (v: string) => (
                <span
                  className="num-mono"
                  style={{ color: Number(v) > 0 ? '#dc2626' : '#64748b' }}
                >
                  ¥{v}
                </span>
              ),
            },
            {
              title: '标准状态',
              width: 165,
              render: (_, r) => (
                <div>
                  <Badge
                    status={NORMALIZED_STATUS_META[r.normalized_status].badge}
                    text={NORMALIZED_STATUS_META[r.normalized_status].label}
                  />
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    原始: {r.raw_order_status}
                    {!r.is_valid_for_gmv && (
                      <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>
                        非GMV
                      </Tag>
                    )}
                  </div>
                </div>
              ),
            },
            {
              title: '原始扩展',
              width: 90,
              fixed: 'right',
              render: (_, r) => (
                <Button type="link" size="small" onClick={() => setInspectRow(r)}>
                  查看详情
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title="订单商品明细与原始扩展字段 (raw_extra)"
        open={Boolean(inspectRow)}
        onClose={() => setInspectRow(null)}
        width={540}
      >
        {inspectRow && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions title="标准化字段" column={1} bordered size="small">
              <Descriptions.Item label="平台订单号">
                <span className="num-mono">{inspectRow.platform_order_id}</span>
              </Descriptions.Item>
              <Descriptions.Item label="行唯一键 (line_key)">
                <span className="num-mono">{inspectRow.line_key}</span>
              </Descriptions.Item>
              <Descriptions.Item label="下单 / 付款 / 完成时间">
                <div className="num-mono" style={{ fontSize: 12 }}>
                  下单：{inspectRow.order_time}
                  <br />
                  付款：{inspectRow.pay_time ?? '-'}
                  <br />
                  完成：{inspectRow.finish_time ?? '-'}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="金额明细">
                <span className="num-mono">
                  单价 ¥{inspectRow.unit_price ?? '-'} / 实付 ¥{inspectRow.paid_amount} / 优惠 ¥
                  {inspectRow.discount_amount} / 运费 ¥{inspectRow.shipping_fee} / 退款 ¥
                  {inspectRow.refund_amount}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="省 / 市">
                {[inspectRow.province, inspectRow.city].filter(Boolean).join(' ') || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="首次 / 最近批次 ID">
                <span className="num-mono">
                  #{inspectRow.first_batch_id} / #{inspectRow.last_batch_id}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <Descriptions title="原始未映射扩展列 (raw_extra · 已脱敏)" column={1} bordered size="small">
              {Object.keys(inspectRow.raw_extra ?? {}).length === 0 ? (
                <Descriptions.Item label="说明">无未映射原始列</Descriptions.Item>
              ) : (
                Object.entries(inspectRow.raw_extra).map(([k, v]) => (
                  <Descriptions.Item key={k} label={k}>
                    {v === null || v === undefined ? '-' : String(v)}
                  </Descriptions.Item>
                ))
              )}
            </Descriptions>
          </Space>
        )}
      </Drawer>
    </Space>
  );
}
