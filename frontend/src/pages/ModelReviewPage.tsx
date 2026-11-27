import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { CheckCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../api/client';
import { v2Api } from '../api/v2Client';
import { PLATFORM_META, type Platform } from '../contracts/phase1';
import {
  CHANNEL_TYPE_META,
  MODEL_MATCH_STATUS_META,
  type ChannelType,
  type PendingModelFilter,
  type PendingModelGroup,
} from '../contracts/v2';

const { Text } = Typography;

export function ModelReviewPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<'all' | 'ambiguous' | 'unmatched'>('all');
  const [platform, setPlatform] = useState<Platform | undefined>(undefined);
  const [shopId, setShopId] = useState<number | undefined>(undefined);
  const [eligibilityStatus, setEligibilityStatus] = useState<'all' | 'valid'>('all');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  // Confirm modal state
  const [activeGroup, setActiveGroup] = useState<PendingModelGroup | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>(undefined);
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [ruleScope, setRuleScope] = useState<'shop' | 'global'>('shop');
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickModelForm] = Form.useForm();

  const filters: PendingModelFilter = useMemo(
    () => ({
      status: statusFilter,
      platform,
      shop_id: shopId,
      eligibility_status: eligibilityStatus,
      keyword: keyword.trim() || undefined,
      page,
      page_size: 30,
    }),
    [statusFilter, platform, shopId, eligibilityStatus, keyword, page],
  );

  const pendingQuery = useQuery({
    queryKey: ['model-review', filters],
    queryFn: () => v2Api.listPendingModels(filters),
  });

  const shopsQuery = useQuery({
    queryKey: ['v2-shops-all'],
    queryFn: () => v2Api.listShops(),
  });

  const allModelsQuery = useQuery({
    queryKey: ['v2-models-picker'],
    queryFn: () => v2Api.listModels({ page: 1, page_size: 200 }),
  });

  const resolveMutation = useMutation({
    mutationFn: () => {
      if (!activeGroup || !selectedModelId) {
        throw new Error('请选择目标标准型号');
      }
      const canSaveRule = Boolean(activeGroup.channel_type && activeGroup.external_id);
      return v2Api.resolveModels({
        group_filter: {
          data_source: activeGroup.data_source,
          shop_id: activeGroup.shop_id,
          channel_type: activeGroup.channel_type ?? null,
          external_id: activeGroup.external_id ?? null,
          secondary_external_id: activeGroup.secondary_external_id || '',
          raw_product_summary: activeGroup.raw_product_summary ?? null,
        },
        model_id: selectedModelId,
        save_as_mapping_rule: canSaveRule && saveAsRule,
        rule_scope: canSaveRule && saveAsRule ? ruleScope : undefined,
      });
    },
    onSuccess: (res) => {
      setActiveGroup(null);
      setSelectedModelId(undefined);
      queryClient.invalidateQueries({ queryKey: ['model-review'] });
      queryClient.invalidateQueries({ queryKey: ['effective-sales'] });
      queryClient.invalidateQueries({ queryKey: ['v2-models'] });
      queryClient.invalidateQueries({ queryKey: ['v2-channel-conflicts'] });
      const ruleText = res.saved_mapping_id
        ? `，已沉淀映射规则 #${res.saved_mapping_id}（额外回溯 ${res.retroactively_resolved_records} 条）`
        : '';
      message.success(`确认成功：已更新 ${res.resolved_effective_records} 条销售记录${ruleText}`);
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '确认型号失败');
    },
  });

  const quickCreateModelMutation = useMutation({
    mutationFn: (values: {
      standard_model: string;
      business_segment: string;
      category: string;
      brand: string;
      is_3c_full_name?: boolean;
    }) => v2Api.createModel(values),
    onSuccess: (created) => {
      setQuickCreateOpen(false);
      quickModelForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['v2-models-picker'] });
      queryClient.invalidateQueries({ queryKey: ['v2-models'] });
      setSelectedModelId(created.id);
      message.success(`已创建并选中标准型号「${created.standard_model}」`);
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '新增型号失败');
    },
  });

  const openResolveModal = (group: PendingModelGroup, preselectedModelId?: number) => {
    setActiveGroup(group);
    setSelectedModelId(preselectedModelId ?? group.candidates[0]?.model_id);
    const hasChannelKey = Boolean(group.channel_type && group.external_id);
    setSaveAsRule(hasChannelKey);
    setRuleScope(group.model_match_status === 'ambiguous' ? 'shop' : 'global');
  };

  const canSaveRuleForActive = Boolean(activeGroup?.channel_type && activeGroup?.external_id);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="待确认分组数" value={pendingQuery.data?.total_groups ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="待确认销售总条数"
              value={pendingQuery.data?.total_pending_records ?? 0}
              valueStyle={{
                color: (pendingQuery.data?.total_pending_records ?? 0) > 0 ? '#d48806' : '#3f8600',
              }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="一对多冲突 (ambiguous)"
              value={pendingQuery.data?.ambiguous_records ?? 0}
              valueStyle={{ color: '#d48806' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="未命中型号 (unmatched)"
              value={pendingQuery.data?.unmatched_records ?? 0}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        message="待确认记录已按「来源 + 店铺 + 渠道ID + 原始商品摘要」自动聚合。点选一次即可批量确认整组订单，勾选「一键沉淀为映射规则」后，系统会写入产品主数据并自动回溯匹配同类待确认记录。"
      />

      <Card size="small">
        <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
          <Space wrap>
            <Select
              style={{ width: 150 }}
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
              options={[
                { value: 'all', label: '全部待确认状态' },
                { value: 'ambiguous', label: '仅一对多冲突' },
                { value: 'unmatched', label: '仅未命中型号' },
              ]}
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
              style={{ width: 140 }}
              value={eligibilityStatus}
              onChange={(v) => {
                setEligibilityStatus(v);
                setPage(1);
              }}
              options={[
                { value: 'all', label: '包含排除与有效' },
                { value: 'valid', label: '仅看有效销售' },
              ]}
            />
            <Input.Search
              allowClear
              placeholder="搜外部 ID / 商品名 / 型号提示"
              style={{ width: 240 }}
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
            />
          </Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => pendingQuery.refetch()}
            loading={pendingQuery.isFetching}
          >
            刷新队列
          </Button>
        </Space>

        <Table<PendingModelGroup>
          rowKey="group_key"
          size="small"
          loading={pendingQuery.isLoading}
          dataSource={pendingQuery.data?.groups ?? []}
          scroll={{ x: 1200 }}
          locale={{ emptyText: '太棒了！当前没有待确认型号的销售记录' }}
          pagination={{
            current: page,
            pageSize: 30,
            total: pendingQuery.data?.total_groups ?? 0,
            onChange: setPage,
            showTotal: (t) => `共 ${t} 组`,
          }}
          columns={[
            {
              title: '待确认类型',
              dataIndex: 'model_match_status',
              width: 115,
              render: (st: 'ambiguous' | 'unmatched') => (
                <Tag color={MODEL_MATCH_STATUS_META[st].color}>
                  {MODEL_MATCH_STATUS_META[st].label}
                </Tag>
              ),
            },
            {
              title: '店铺 / 平台',
              dataIndex: 'shop_name',
              width: 175,
              render: (name: string, row) => (
                <Space direction="vertical" size={2}>
                  <Text strong>{name}</Text>
                  <Tag color={PLATFORM_META[row.platform]?.color}>
                    {PLATFORM_META[row.platform]?.label ?? row.platform}
                  </Tag>
                </Space>
              ),
            },
            {
              title: '渠道 ID / 原始标识',
              width: 220,
              render: (_, row) => (
                <Space direction="vertical" size={2}>
                  {row.channel_type ? (
                    <Tag color={CHANNEL_TYPE_META[row.channel_type as ChannelType]?.color}>
                      {CHANNEL_TYPE_META[row.channel_type as ChannelType]?.label ?? row.channel_type}
                    </Tag>
                  ) : (
                    <Tag>无渠道 ID</Tag>
                  )}
                  {row.external_id && <Text code>{row.external_id}</Text>}
                  {row.raw_model_hint && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      提示: {row.raw_model_hint}
                    </Text>
                  )}
                </Space>
              ),
            },
            {
              title: '原始商品摘要',
              dataIndex: 'raw_product_summary',
              ellipsis: true,
              render: (v?: string | null) => v || '-',
            },
            {
              title: '候选型号（点击快选）',
              dataIndex: 'candidates',
              width: 250,
              render: (
                candidates: { model_id: number; standard_model: string; brand: string }[],
                row,
              ) =>
                candidates.length > 0 ? (
                  <Space wrap size={[4, 4]}>
                    {candidates.map((c) => (
                      <Tag
                        key={c.model_id}
                        color="blue"
                        style={{ cursor: 'pointer' }}
                        onClick={() => openResolveModal(row, c.model_id)}
                      >
                        {c.brand} · {c.standard_model}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary">需手动指定型号</Text>
                ),
            },
            {
              title: '影响条数',
              width: 105,
              align: 'right',
              render: (_, row) => (
                <Space direction="vertical" size={0} align="end">
                  <Text strong>{row.affected_record_count} 条</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    有效 {row.valid_record_count} 条
                  </Text>
                </Space>
              ),
            },
            {
              title: '涉及销售额',
              dataIndex: 'total_sales_amount',
              width: 115,
              align: 'right',
              render: (v: string) => `¥${v}`,
            },
            {
              title: '操作',
              width: 110,
              fixed: 'right',
              render: (_, row) => (
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => openResolveModal(row)}
                >
                  确认型号
                </Button>
              ),
            },
          ]}
        />
      </Card>

      {/* Resolve Modal */}
      <Modal
        title="批量确认标准型号"
        open={Boolean(activeGroup)}
        onCancel={() => setActiveGroup(null)}
        onOk={() => resolveMutation.mutate()}
        okText="确认并应用"
        okButtonProps={{ disabled: !selectedModelId }}
        confirmLoading={resolveMutation.isPending}
        width={620}
      >
        {activeGroup && (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Alert
              type={activeGroup.model_match_status === 'ambiguous' ? 'warning' : 'info'}
              showIcon
              message={`店铺「${activeGroup.shop_name}」· 影响 ${activeGroup.affected_record_count} 条记录（其中有效 ${activeGroup.valid_record_count} 条，金额 ¥${activeGroup.total_sales_amount}）`}
              description={`商品摘要：${activeGroup.raw_product_summary || '-'}${
                activeGroup.external_id ? ` | ${activeGroup.channel_type}: ${activeGroup.external_id}` : ''
              }`}
            />

            {activeGroup.candidates.length > 0 && (
              <div>
                <Text strong style={{ display: 'block', marginBottom: 6 }}>
                  系统候选型号（点击快速选择）：
                </Text>
                <Space wrap>
                  {activeGroup.candidates.map((c) => (
                    <Button
                      key={c.model_id}
                      size="small"
                      type={selectedModelId === c.model_id ? 'primary' : 'default'}
                      onClick={() => setSelectedModelId(c.model_id)}
                    >
                      {c.brand} · {c.standard_model} ({c.category})
                    </Button>
                  ))}
                </Space>
              </div>
            )}

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <Text strong>目标标准型号：</Text>
                <Button
                  size="small"
                  type="link"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    quickModelForm.setFieldsValue({
                      standard_model: activeGroup.raw_product_summary || '',
                      business_segment: '3C',
                      category: '手机',
                      brand: '苹果',
                      is_3c_full_name: true,
                    });
                    setQuickCreateOpen(true);
                  }}
                >
                  找不到？快速新建标准型号
                </Button>
              </div>
              <Select
                showSearch
                style={{ width: '100%' }}
                placeholder="搜索并选择标准型号"
                optionFilterProp="label"
                value={selectedModelId}
                onChange={setSelectedModelId}
                options={(allModelsQuery.data?.items ?? [])
                  .filter((m) => m.is_active)
                  .map((m) => ({
                    value: m.id,
                    label: `${m.brand} | ${m.category} | ${m.standard_model}`,
                  }))}
              />
            </div>

            <Card size="small" style={{ background: '#f8fafc' }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Checkbox
                  checked={canSaveRuleForActive && saveAsRule}
                  disabled={!canSaveRuleForActive}
                  onChange={(e) => setSaveAsRule(e.target.checked)}
                >
                  <Text strong>一键沉淀为映射规则</Text>
                  <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                    {canSaveRuleForActive
                      ? `保存 ${activeGroup.channel_type}=${activeGroup.external_id} 映射，并自动回溯解决同类待确认记录`
                      : '当前分组无渠道外部 ID，仅执行本次手动确认'}
                  </Text>
                </Checkbox>
                {canSaveRuleForActive && saveAsRule && (
                  <Radio.Group
                    value={ruleScope}
                    onChange={(e) => setRuleScope(e.target.value)}
                  >
                    <Radio value="shop">
                      仅限「{activeGroup.shop_name}」生效（推荐用于一对多冲突消歧）
                    </Radio>
                    <Radio value="global">全局生效（推荐用于首次出现的新外部 ID）</Radio>
                  </Radio.Group>
                )}
              </Space>
            </Card>
          </Space>
        )}
      </Modal>

      {/* Quick Create Model Modal */}
      <Modal
        title="快速新建标准型号"
        open={quickCreateOpen}
        onCancel={() => setQuickCreateOpen(false)}
        onOk={() => quickModelForm.submit()}
        confirmLoading={quickCreateModelMutation.isPending}
      >
        <Form
          form={quickModelForm}
          layout="vertical"
          onFinish={(v) => quickCreateModelMutation.mutate(v)}
        >
          <Form.Item name="standard_model" label="标准型号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="business_segment" label="业务板块" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="品类" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="brand" label="品牌" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Space>
  );
}
