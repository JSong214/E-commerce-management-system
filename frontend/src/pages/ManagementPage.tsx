import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, phase1Api } from '../api/client';
import { v2Api } from '../api/v2Client';
import {
  DATA_SOURCE_META,
  NORMALIZED_STATUS_META,
  PLATFORM_META,
  type BatchStatus,
  type ColumnMapping,
  type DataSource,
  type ImportBatch,
  type MappingTemplate,
  type NormalizedStatus,
  type Platform,
  type Shop,
  type StatusMapping,
} from '../contracts/phase1';
import { SOURCE_ROLE_META, type SalesRule, type SourceRole } from '../contracts/v2';

const { Text } = Typography;

export function ManagementPage() {
  const queryClient = useQueryClient();

  // Batches state
  const [batchPage, setBatchPage] = useState(1);
  const [batchSource, setBatchSource] = useState<DataSource | undefined>(undefined);
  const [batchStatus, setBatchStatus] = useState<BatchStatus | undefined>(undefined);
  const [rollbackConflictBanner, setRollbackConflictBanner] = useState<string | null>(null);

  // Template modal state
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MappingTemplate | null>(null);
  const [templateForm] = Form.useForm();

  // Shop modal state
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [shopForm] = Form.useForm();

  // Status mapping modal state
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<StatusMapping | null>(null);
  const [statusForm] = Form.useForm();

  // V2 Sales rule edit modal state
  const [editingRule, setEditingRule] = useState<SalesRule | null>(null);
  const [ruleForm] = Form.useForm();

  const salesRulesQuery = useQuery({
    queryKey: ['sales-rules'],
    queryFn: () => v2Api.listSalesRules(),
  });

  const batchesQuery = useQuery({
    queryKey: ['batches', batchPage, batchSource, batchStatus],
    queryFn: () =>
      phase1Api.listBatches({
        page: batchPage,
        page_size: 20,
        data_source: batchSource,
        status: batchStatus,
      }),
  });

  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: () => phase1Api.listTemplates(),
  });

  const shopsQuery = useQuery({
    queryKey: ['shops'],
    queryFn: () => phase1Api.listShops(),
  });

  const statusesQuery = useQuery({
    queryKey: ['status-mappings'],
    queryFn: () => phase1Api.listStatusMappings(),
  });

  const rollbackMutation = useMutation({
    mutationFn: (batchId: number) => phase1Api.rollbackBatch(batchId),
    onSuccess: (res) => {
      setRollbackConflictBanner(null);
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['order-lines'] });
      queryClient.invalidateQueries({ queryKey: ['effective-sales'] });
      queryClient.invalidateQueries({ queryKey: ['model-review'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      message.success(
        `精确回滚完成：删除新增 ${res.deleted_rows} 行，还原更新 ${res.restored_rows} 行（已同步重算有效销售）`,
      );
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.code === 'ROLLBACK_CONFLICT') {
        const blockers = Array.isArray(err.details?.blocking_batches)
          ? (err.details?.blocking_batches as string[]).join('、')
          : '';
        const text = blockers
          ? `${err.message}（阻塞批次：${blockers}）`
          : err.message;
        setRollbackConflictBanner(text);
        message.error(text);
        return;
      }
      message.error(err instanceof Error ? err.message : '回滚失败');
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const values = await templateForm.validateFields();
      let parsedMapping: ColumnMapping;
      try {
        parsedMapping = JSON.parse(values.column_mapping_json) as ColumnMapping;
      } catch {
        throw new Error('字段映射 JSON 格式不合法，请检查引号与逗号');
      }
      const fingerprint = (values.header_fingerprint_text as string)
        .split(/[,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        code: values.code,
        name: values.name,
        data_source: values.data_source as DataSource,
        header_fingerprint: fingerprint,
        column_mapping: parsedMapping,
        rules: {
          prorate_order_amount: Boolean(values.prorate_order_amount),
          prorate_weight_field: 'unit_price' as const,
        },
        default_platform: (values.default_platform as Platform | undefined) ?? null,
      };
      if (editingTemplate) {
        return phase1Api.updateTemplate(editingTemplate.id, payload);
      }
      return phase1Api.createTemplate(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setTemplateModalOpen(false);
      setEditingTemplate(null);
      message.success('模板已保存');
    },
    onError: (err) => {
      message.error(err instanceof Error ? err.message : '保存模板失败');
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => phase1Api.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      message.success('已删除自定义模板');
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '删除模板失败');
    },
  });

  const saveShopMutation = useMutation({
    mutationFn: async () => {
      const values = await shopForm.validateFields();
      const payload = {
        shop_name: values.shop_name,
        platform: values.platform as Platform,
        default_data_source: (values.default_data_source as DataSource | undefined) ?? null,
        is_active: values.is_active ?? true,
      };
      if (editingShop) {
        return phase1Api.updateShop(editingShop.id, payload);
      }
      return phase1Api.createShop(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shops'] });
      setShopModalOpen(false);
      setEditingShop(null);
      message.success('店铺配置已保存');
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '保存店铺失败');
    },
  });

  const saveStatusMutation = useMutation({
    mutationFn: async () => {
      const values = await statusForm.validateFields();
      const payload = {
        data_source: values.data_source as DataSource | '*',
        raw_status: values.raw_status,
        normalized_status: values.normalized_status as NormalizedStatus,
        is_valid_for_gmv: Boolean(values.is_valid_for_gmv),
      };
      if (editingStatus) {
        return phase1Api.updateStatusMapping(editingStatus.id, payload);
      }
      return phase1Api.createStatusMapping(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-mappings'] });
      setStatusModalOpen(false);
      setEditingStatus(null);
      message.success('状态映射已保存');
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '保存状态映射失败');
    },
  });

  const deleteStatusMutation = useMutation({
    mutationFn: (id: number) => phase1Api.deleteStatusMapping(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-mappings'] });
      message.success('已删除状态映射');
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '删除失败');
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({
      ruleKey,
      enabled,
      config_json,
    }: {
      ruleKey: string;
      enabled: boolean;
      config_json: Record<string, unknown>;
    }) => v2Api.updateSalesRule(ruleKey, { enabled, config_json }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-rules'] });
      setEditingRule(null);
      message.success('销售业务规则已保存（新导入与重算将生效）');
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '保存规则失败');
    },
  });

  const openTemplateModal = (mode: 'create' | 'edit' | 'clone', source?: MappingTemplate) => {
    if (mode === 'edit' && source) {
      setEditingTemplate(source);
      templateForm.setFieldsValue({
        code: source.code,
        name: source.name,
        data_source: source.data_source,
        default_platform: source.default_platform ?? undefined,
        prorate_order_amount: Boolean(source.rules?.prorate_order_amount),
        header_fingerprint_text: source.header_fingerprint.join(', '),
        column_mapping_json: JSON.stringify(source.column_mapping, null, 2),
      });
    } else if (mode === 'clone' && source) {
      setEditingTemplate(null);
      templateForm.setFieldsValue({
        code: `${source.code}_copy`,
        name: `${source.name}（副本）`,
        data_source: source.data_source,
        default_platform: source.default_platform ?? undefined,
        prorate_order_amount: Boolean(source.rules?.prorate_order_amount),
        header_fingerprint_text: source.header_fingerprint.join(', '),
        column_mapping_json: JSON.stringify(source.column_mapping, null, 2),
      });
    } else {
      setEditingTemplate(null);
      templateForm.resetFields();
      templateForm.setFieldsValue({
        data_source: 'custom',
        prorate_order_amount: false,
        header_fingerprint_text: '',
        column_mapping_json: JSON.stringify(
          {
            platform_order_id: '订单号',
            order_time: '下单时间',
            product_name: '商品名称',
            quantity: '数量',
            paid_amount: '实付金额',
            raw_order_status: '订单状态',
          },
          null,
          2,
        ),
      });
    }
    setTemplateModalOpen(true);
  };

  const confirmRollback = (batch: ImportBatch) => {
    Modal.confirm({
      title: `确认精确回滚批次 ${batch.batch_no}？`,
      content: (
        <div>
          <p>
            文件：<strong>{batch.file_name}</strong>
          </p>
          <p>
            将删除本批次新增的 <strong>{batch.inserted_rows}</strong> 条订单行，并将本批次 Upsert
            更新的 <strong>{batch.updated_rows}</strong> 条订单行精确还原回导入前的状态。
          </p>
        </div>
      ),
      okText: '确认精确回滚',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => rollbackMutation.mutateAsync(batch.id),
    });
  };

  return (
    <Card variant="borderless" style={{ borderRadius: 10 }}>
      <Tabs
        items={[
          {
            key: 'batches',
            label: '导入批次历史（精确回滚）',
            children: (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                {rollbackConflictBanner && (
                  <Alert
                    type="error"
                    showIcon
                    closable
                    onClose={() => setRollbackConflictBanner(null)}
                    message={rollbackConflictBanner}
                  />
                )}
                <Space wrap>
                  <Select
                    allowClear
                    placeholder="按数据来源筛选"
                    style={{ width: 150 }}
                    value={batchSource}
                    onChange={(v) => {
                      setBatchSource(v);
                      setBatchPage(1);
                    }}
                    options={Object.entries(DATA_SOURCE_META).map(([k, v]) => ({
                      value: k,
                      label: v.label,
                    }))}
                  />
                  <Select
                    allowClear
                    placeholder="按批次状态筛选"
                    style={{ width: 140 }}
                    value={batchStatus}
                    onChange={(v) => {
                      setBatchStatus(v);
                      setBatchPage(1);
                    }}
                    options={[
                      { value: 'committed', label: '已入库' },
                      { value: 'rolled_back', label: '已回滚' },
                    ]}
                  />
                </Space>

                <Table<ImportBatch>
                  size="small"
                  rowKey="id"
                  loading={batchesQuery.isLoading}
                  dataSource={batchesQuery.data?.items ?? []}
                  pagination={{
                    current: batchPage,
                    pageSize: 20,
                    total: batchesQuery.data?.total ?? 0,
                    onChange: setBatchPage,
                  }}
                  scroll={{ x: 1080 }}
                  columns={[
                    {
                      title: '批次号',
                      dataIndex: 'batch_no',
                      width: 190,
                      render: (v: string) => <span className="num-mono">{v}</span>,
                    },
                    { title: '文件名', dataIndex: 'file_name', width: 220 },
                    {
                      title: '数据来源 / 角色',
                      dataIndex: 'data_source',
                      width: 175,
                      render: (s: DataSource, b) => (
                        <Space size={4} wrap>
                          <Tag color={DATA_SOURCE_META[s]?.color}>
                            {DATA_SOURCE_META[s]?.label ?? s}
                          </Tag>
                          {b.source_role && (
                            <Tag color={SOURCE_ROLE_META[b.source_role as SourceRole]?.color}>
                              {SOURCE_ROLE_META[b.source_role as SourceRole]?.label}
                            </Tag>
                          )}
                        </Space>
                      ),
                    },
                    { title: '使用模板', dataIndex: 'template_name_snapshot', width: 170 },
                    {
                      title: 'L1 总/增/改/补全/错',
                      width: 175,
                      render: (_, b) => (
                        <span className="num-mono">
                          {b.total_rows}/{b.inserted_rows}/{b.updated_rows}/{b.enriched_rows ?? 0}/
                          <span style={{ color: b.error_rows > 0 ? '#dc2626' : '#64748b' }}>
                            {b.error_rows}
                          </span>
                        </span>
                      ),
                    },
                    {
                      title: 'L2 有效/排除/待确认',
                      width: 145,
                      render: (_, b) => (
                        <span className="num-mono">
                          {b.effective_rows ?? 0} / {b.excluded_rows ?? 0} /{' '}
                          <span
                            style={{
                              color: (b.pending_model_rows ?? 0) > 0 ? '#d97706' : '#64748b',
                            }}
                          >
                            {b.pending_model_rows ?? 0}
                          </span>
                        </span>
                      ),
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      width: 90,
                      render: (st: BatchStatus) =>
                        st === 'committed' ? <Tag color="green">已入库</Tag> : <Tag>已回滚</Tag>,
                    },
                    {
                      title: '导入时间',
                      dataIndex: 'created_at',
                      width: 160,
                      render: (v: string) => <span className="num-mono">{v}</span>,
                    },
                    {
                      title: '操作',
                      width: 195,
                      fixed: 'right',
                      render: (_, b) => (
                        <Space size={6}>
                          {b.error_rows > 0 && (
                            <Button
                              size="small"
                              icon={<DownloadOutlined />}
                              onClick={() => phase1Api.downloadBatchErrors(b.id, b.batch_no)}
                            >
                              错行
                            </Button>
                          )}
                          {b.status === 'rolled_back' ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              已回滚
                            </Text>
                          ) : b.can_rollback ? (
                            <Button
                              danger
                              size="small"
                              icon={<RollbackOutlined />}
                              loading={rollbackMutation.isPending}
                              onClick={() => confirmRollback(b)}
                            >
                              精确回滚
                            </Button>
                          ) : (
                            <Tooltip
                              title={`存在较新批次更新了相同订单行，请先回滚：${b.blocking_batches.join('、')}`}
                            >
                              <Button size="small" disabled icon={<RollbackOutlined />}>
                                需先回滚新批
                              </Button>
                            </Tooltip>
                          )}
                        </Space>
                      ),
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'sales-rules',
            label: '销售业务规则（可配置开关）',
            children: (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  message="这里控制 Layer 2 有效销售明细的业务清洗规则（默认对齐历史自动化脚本口径：400 元门槛、淘宝百亿补贴与 <1000 提示、京东整机合并取应付金额、3C 零实收取已付、补发排除、ERP 仅补空）。"
                />
                <Table<SalesRule>
                  size="small"
                  rowKey="rule_key"
                  loading={salesRulesQuery.isLoading}
                  pagination={false}
                  dataSource={salesRulesQuery.data?.items ?? []}
                  columns={[
                    {
                      title: '规则名称',
                      width: 220,
                      render: (_, r) => (
                        <Space direction="vertical" size={0}>
                          <Text strong>{r.rule_name}</Text>
                          <Text type="secondary" className="num-mono" style={{ fontSize: 11 }}>
                            {r.rule_key}
                          </Text>
                        </Space>
                      ),
                    },
                    {
                      title: '分组',
                      dataIndex: 'rule_group',
                      width: 115,
                      render: (g: string) => <Tag>{g}</Tag>,
                    },
                    { title: '规则说明', dataIndex: 'description' },
                    {
                      title: '当前参数',
                      width: 240,
                      render: (_, r) => (
                        <Text code style={{ fontSize: 11 }}>
                          {JSON.stringify(r.config_json)}
                        </Text>
                      ),
                    },
                    {
                      title: '启用状态',
                      width: 90,
                      render: (_, r) => (
                        <Switch
                          aria-label={`开关-${r.rule_key}`}
                          checked={r.enabled}
                          loading={updateRuleMutation.isPending}
                          onChange={(checked) =>
                            updateRuleMutation.mutate({
                              ruleKey: r.rule_key,
                              enabled: checked,
                              config_json: r.config_json,
                            })
                          }
                        />
                      ),
                    },
                    {
                      title: '参数配置',
                      width: 95,
                      render: (_, r) => (
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setEditingRule(r);
                            ruleForm.setFieldsValue({
                              enabled: r.enabled,
                              config_json_text: JSON.stringify(r.config_json, null, 2),
                            });
                          }}
                        >
                          参数
                        </Button>
                      ),
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'templates',
            label: '映射模板管理',
            children: (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary">
                    内置模板对应 6 大平台实测表头（只读保护）；可随时复制为自定义模板并微调字段映射。
                  </Text>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => openTemplateModal('create')}
                  >
                    新建自定义模板
                  </Button>
                </div>
                <Table<MappingTemplate>
                  size="small"
                  rowKey="id"
                  loading={templatesQuery.isLoading}
                  pagination={false}
                  dataSource={templatesQuery.data?.items ?? []}
                  columns={[
                    { title: '模板名称', dataIndex: 'name' },
                    {
                      title: '编码',
                      dataIndex: 'code',
                      width: 180,
                      render: (v: string) => <span className="num-mono">{v}</span>,
                    },
                    {
                      title: '来源',
                      dataIndex: 'data_source',
                      width: 110,
                      render: (s: DataSource) => (
                        <Tag color={DATA_SOURCE_META[s].color}>{DATA_SOURCE_META[s].label}</Tag>
                      ),
                    },
                    {
                      title: '清洗规则',
                      width: 120,
                      render: (_, t) =>
                        t.rules?.prorate_order_amount ? (
                          <Tag color="blue">整单分摊</Tag>
                        ) : (
                          <Tag>行级实付</Tag>
                        ),
                    },
                    {
                      title: '类型',
                      width: 95,
                      render: (_, t) => (t.is_builtin ? <Tag>系统内置</Tag> : <Tag color="purple">自定义</Tag>),
                    },
                    {
                      title: '操作',
                      width: 170,
                      render: (_, t) =>
                        t.is_builtin ? (
                          <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => openTemplateModal('clone', t)}
                          >
                            复制为自定义
                          </Button>
                        ) : (
                          <Space size={6}>
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openTemplateModal('edit', t)}
                            >
                              编辑
                            </Button>
                            <Popconfirm
                              title={`确认删除自定义模板「${t.name}」？`}
                              onConfirm={() => deleteTemplateMutation.mutate(t.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />}>
                                删除
                              </Button>
                            </Popconfirm>
                          </Space>
                        ),
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'shops-and-statuses',
            label: '店铺-平台归属与状态字典',
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} xl={11}>
                  <Card
                    size="small"
                    title="店铺-平台归属表"
                    extra={
                      <Button
                        size="small"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          setEditingShop(null);
                          shopForm.resetFields();
                          shopForm.setFieldsValue({ is_active: true });
                          setShopModalOpen(true);
                        }}
                      >
                        新增店铺
                      </Button>
                    }
                  >
                    <Table<Shop>
                      size="small"
                      rowKey="id"
                      loading={shopsQuery.isLoading}
                      pagination={{ pageSize: 10 }}
                      dataSource={shopsQuery.data?.items ?? []}
                      columns={[
                        { title: '店铺名称', dataIndex: 'shop_name' },
                        {
                          title: '归属平台',
                          dataIndex: 'platform',
                          width: 85,
                          render: (p: Platform) => (
                            <Tag color={PLATFORM_META[p].color}>{PLATFORM_META[p].label}</Tag>
                          ),
                        },
                        {
                          title: '状态',
                          dataIndex: 'is_active',
                          width: 75,
                          render: (v: boolean) => (v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
                        },
                        {
                          title: '操作',
                          width: 70,
                          render: (_, s) => (
                            <Button
                              type="link"
                              size="small"
                              onClick={() => {
                                setEditingShop(s);
                                shopForm.setFieldsValue(s);
                                setShopModalOpen(true);
                              }}
                            >
                              编辑
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </Card>
                </Col>

                <Col xs={24} xl={13}>
                  <Card
                    size="small"
                    title="平台状态归一化字典"
                    extra={
                      <Button
                        size="small"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          setEditingStatus(null);
                          statusForm.resetFields();
                          statusForm.setFieldsValue({ data_source: '*', is_valid_for_gmv: true });
                          setStatusModalOpen(true);
                        }}
                      >
                        新增映射
                      </Button>
                    }
                  >
                    <Table<StatusMapping>
                      size="small"
                      rowKey="id"
                      loading={statusesQuery.isLoading}
                      pagination={{ pageSize: 10 }}
                      dataSource={statusesQuery.data?.items ?? []}
                      columns={[
                        { title: '来源', dataIndex: 'data_source', width: 85 },
                        { title: '原始状态', dataIndex: 'raw_status' },
                        {
                          title: '标准状态',
                          dataIndex: 'normalized_status',
                          width: 115,
                          render: (st: NormalizedStatus) => (
                            <Tag color={NORMALIZED_STATUS_META[st].color}>
                              {NORMALIZED_STATUS_META[st].label}
                            </Tag>
                          ),
                        },
                        {
                          title: '计入GMV',
                          dataIndex: 'is_valid_for_gmv',
                          width: 80,
                          render: (v: boolean) => (v ? <Tag color="green">是</Tag> : <Tag color="red">否</Tag>),
                        },
                        {
                          title: '操作',
                          width: 105,
                          render: (_, m) => (
                            <Space size={4}>
                              <Button
                                type="link"
                                size="small"
                                onClick={() => {
                                  setEditingStatus(m);
                                  statusForm.setFieldsValue(m);
                                  setStatusModalOpen(true);
                                }}
                              >
                                编辑
                              </Button>
                              <Popconfirm
                                title="确认删除此状态映射？"
                                onConfirm={() => deleteStatusMutation.mutate(m.id)}
                              >
                                <Button type="link" size="small" danger>
                                  删除
                                </Button>
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />

      {/* Template Create / Clone / Edit Modal */}
      <Modal
        title={editingTemplate ? '编辑自定义模板' : '新建 / 复制自定义模板'}
        open={templateModalOpen}
        width={640}
        onCancel={() => setTemplateModalOpen(false)}
        onOk={() => saveTemplateMutation.mutate()}
        confirmLoading={saveTemplateMutation.isPending}
      >
        <Form form={templateForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="code" label="模板编码" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="data_source" label="数据来源" rules={[{ required: true }]}>
                <Select
                  options={Object.entries(DATA_SOURCE_META).map(([k, v]) => ({ value: k, label: v.label }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="default_platform" label="默认销售平台">
                <Select
                  allowClear
                  options={Object.entries(PLATFORM_META).map(([k, v]) => ({ value: k, label: v.label }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="prorate_order_amount" label="开启整单实付分摊" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="header_fingerprint_text" label="表头指纹列（逗号分隔）">
            <Input placeholder="例如 订单号, 京东价, 商家应收" />
          </Form.Item>
          <Form.Item name="column_mapping_json" label="字段映射 JSON（标准字段 -> 原始表头）" rules={[{ required: true }]}>
            <Input.TextArea rows={8} className="num-mono" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Shop Modal */}
      <Modal
        title={editingShop ? '编辑店铺' : '新增店铺'}
        open={shopModalOpen}
        onCancel={() => setShopModalOpen(false)}
        onOk={() => saveShopMutation.mutate()}
        confirmLoading={saveShopMutation.isPending}
      >
        <Form form={shopForm} layout="vertical">
          <Form.Item name="shop_name" label="店铺名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="platform" label="归属销售平台" rules={[{ required: true }]}>
            <Select
              options={Object.entries(PLATFORM_META).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </Form.Item>
          <Form.Item name="default_data_source" label="常用导出渠道（可选）">
            <Select
              allowClear
              options={Object.entries(DATA_SOURCE_META).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </Form.Item>
          <Form.Item name="is_active" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Status Mapping Modal */}
      <Modal
        title={editingStatus ? '编辑状态映射' : '新增状态映射'}
        open={statusModalOpen}
        onCancel={() => setStatusModalOpen(false)}
        onOk={() => saveStatusMutation.mutate()}
        confirmLoading={saveStatusMutation.isPending}
      >
        <Form form={statusForm} layout="vertical">
          <Form.Item name="data_source" label="适用来源（* 表示全局通用）" rules={[{ required: true }]}>
            <Select
              options={[
                { value: '*', label: '*（全局通用）' },
                ...Object.entries(DATA_SOURCE_META).map(([k, v]) => ({ value: k, label: v.label })),
              ]}
            />
          </Form.Item>
          <Form.Item name="raw_status" label="平台原始订单状态" rules={[{ required: true }]}>
            <Input placeholder="例如 (删除)暂停、等待确认收货" />
          </Form.Item>
          <Form.Item name="normalized_status" label="归一化标准状态" rules={[{ required: true }]}>
            <Select
              options={Object.entries(NORMALIZED_STATUS_META).map(([k, v]) => ({
                value: k,
                label: v.label,
              }))}
            />
          </Form.Item>
          <Form.Item name="is_valid_for_gmv" label="计入有效 GMV / 订单数 / 销量" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Sales Rule Edit Modal */}
      <Modal
        title={editingRule ? `编辑规则参数：${editingRule.rule_name}` : '编辑规则参数'}
        open={Boolean(editingRule)}
        onCancel={() => setEditingRule(null)}
        onOk={async () => {
          if (!editingRule) return;
          const values = await ruleForm.validateFields();
          try {
            const parsed = JSON.parse(values.config_json_text) as Record<string, unknown>;
            updateRuleMutation.mutate({
              ruleKey: editingRule.rule_key,
              enabled: Boolean(values.enabled),
              config_json: parsed,
            });
          } catch {
            message.error('参数 JSON 格式不合法，请检查后重试');
          }
        }}
        confirmLoading={updateRuleMutation.isPending}
        width={560}
      >
        <Form form={ruleForm} layout="vertical">
          <Form.Item name="enabled" label="启用此规则" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="config_json_text"
            label="规则配置 JSON"
            rules={[{ required: true, message: '请输入合法 JSON' }]}
          >
            <Input.TextArea rows={7} className="num-mono" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
