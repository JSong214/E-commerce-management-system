import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Radio,
  Result,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  InboxOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ApiClientError, phase1Api } from '../api/client';
import {
  CANONICAL_FIELDS,
  DATA_SOURCE_META,
  NORMALIZED_STATUS_META,
  PLATFORM_META,
  type ColumnMapping,
  type DataSource,
  type DuplicateStrategy,
  type MappableField,
  type MappingTemplate,
  type MappingTemplateRules,
  type NormalizedStatus,
  type ParsePreviewResponse,
  type Platform,
  type ValidateResponse,
  type ImportCommitResponse,
} from '../contracts/phase1';
import {
  EXCLUSION_REASON_LABELS,
  SOURCE_ROLE_META,
  type SourceRole,
} from '../contracts/v2';

const { Text } = Typography;

function normalizeMappingToSingle(mapping: ColumnMapping): Partial<Record<MappableField, string>> {
  const result: Partial<Record<MappableField, string>> = {};
  for (const [k, v] of Object.entries(mapping)) {
    if (Array.isArray(v)) {
      if (v[0]) result[k as MappableField] = v[0];
    } else if (v) {
      result[k as MappableField] = v;
    }
  }
  return result;
}

function resolveMappingForHeaders(
  templateMapping: ColumnMapping,
  headers: string[],
): Partial<Record<MappableField, string>> {
  const headerSet = new Set(headers);
  const resolved: Partial<Record<MappableField, string>> = {};
  for (const [k, raw] of Object.entries(templateMapping)) {
    if (Array.isArray(raw)) {
      const matched = raw.find((h) => headerSet.has(h)) ?? raw[0];
      if (matched) resolved[k as MappableField] = matched;
    } else if (raw) {
      resolved[k as MappableField] = raw;
    }
  }
  return resolved;
}

function buildCompactMapping(
  singleMap: Partial<Record<MappableField, string>>,
  baseTemplate?: MappingTemplate,
): { mapping: ColumnMapping; removedBaseField: boolean } {
  const mapping: ColumnMapping = {};
  for (const [k, v] of Object.entries(singleMap)) {
    const trimmed = v?.trim();
    if (trimmed) {
      mapping[k as MappableField] = trimmed;
    }
  }
  let removedBaseField = false;
  if (baseTemplate) {
    for (const key of Object.keys(baseTemplate.column_mapping) as MappableField[]) {
      if (!mapping[key]) {
        removedBaseField = true;
        break;
      }
    }
  }
  return { mapping, removedBaseField };
}

export function ImportWizardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsePreviewResponse | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>('jd');
  const [sourceRole, setSourceRole] = useState<SourceRole>('direct_sales');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [columnMap, setColumnMap] = useState<Partial<Record<MappableField, string>>>({});
  const [rules, setRules] = useState<MappingTemplateRules>({ prorate_order_amount: false });
  const [defaultShopId, setDefaultShopId] = useState<number | null>(null);

  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [unknownShopBindings, setUnknownShopBindings] = useState<Record<string, Platform>>({});
  const [unknownStatusBindings, setUnknownStatusBindings] = useState<
    Record<string, { normalized_status?: NormalizedStatus; is_valid_for_gmv: boolean }>
  >({});
  const [allowUnknownStatuses, setAllowUnknownStatuses] = useState(false);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('upsert');
  const [skipErrorRows, setSkipErrorRows] = useState(true);
  const [commitResult, setCommitResult] = useState<ImportCommitResponse | null>(null);

  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateForm] = Form.useForm();
  const [quickShopOpen, setQuickShopOpen] = useState(false);
  const [quickShopForm] = Form.useForm();

  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: () => phase1Api.listTemplates(),
  });

  const shopsQuery = useQuery({
    queryKey: ['shops'],
    queryFn: () => phase1Api.listShops(),
  });

  const templates = templatesQuery.data?.items ?? [];
  const activeShops = (shopsQuery.data?.items ?? []).filter((s) =>
    s.shop_status ? s.shop_status !== 'inactive' : s.is_active,
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  const applyTemplateToState = (template: MappingTemplate, headers: string[]) => {
    setSelectedTemplateId(template.id);
    setDataSource(template.data_source);
    setColumnMap(
      headers.length > 0
        ? resolveMappingForHeaders(template.column_mapping, headers)
        : normalizeMappingToSingle(template.column_mapping),
    );
    setRules({
      ...template.rules,
      prorate_order_amount: Boolean(template.rules?.prorate_order_amount),
    });
  };

  const parseMutation = useMutation({
    mutationFn: ({ file, sheetName }: { file: File; sheetName?: string }) =>
      phase1Api.parsePreview(file, sheetName),
    onSuccess: (data, variables) => {
      setUploadedFile(variables.file);
      setPreview(data);
      setValidation(null);
      setCommitResult(null);
      setSourceRole(data.recommended_source_role ?? 'direct_sales');

      if (data.matched_template) {
        const matchedFull = templates.find((t) => t.id === data.matched_template?.id);
        if (matchedFull) {
          applyTemplateToState(matchedFull, data.headers);
        } else {
          setSelectedTemplateId(data.matched_template.id);
          setDataSource(data.matched_template.data_source);
        }
      } else {
        setSelectedTemplateId(null);
      }
      message.success(`文件「${data.file_name}」解析完成（共 ${data.total_rows} 行）`);
      setStep(1);
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '文件解析失败');
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error('尚未上传文件');
      const { mapping, removedBaseField } = buildCompactMapping(columnMap, selectedTemplate);
      return phase1Api.validateImport({
        staged_file_id: preview.staged_file_id,
        sheet_name: preview.selected_sheet,
        data_source: dataSource,
        source_role: sourceRole,
        template_id: removedBaseField ? null : selectedTemplateId,
        column_mapping: mapping,
        rules,
        default_shop_id: defaultShopId,
      });
    },
    onSuccess: (data) => {
      setValidation(data);
      const initialBindings: Record<string, Platform> = {};
      for (const shopName of data.unknown_shops) {
        if (unknownShopBindings[shopName]) {
          initialBindings[shopName] = unknownShopBindings[shopName];
        }
      }
      setUnknownShopBindings(initialBindings);
      const initialStatuses: Record<
        string,
        { normalized_status?: NormalizedStatus; is_valid_for_gmv: boolean }
      > = {};
      for (const rawStatus of data.unknown_statuses) {
        initialStatuses[rawStatus] = unknownStatusBindings[rawStatus] ?? {
          normalized_status: undefined,
          is_valid_for_gmv: true,
        };
      }
      setUnknownStatusBindings(initialStatuses);
      setAllowUnknownStatuses(false);
      setStep(2);
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '预校验失败');
    },
  });

  const batchBindStatusesMutation = useMutation({
    mutationFn: async () => {
      if (!validation) return;
      const items = validation.unknown_statuses.map((raw_status) => {
        const cfg = unknownStatusBindings[raw_status];
        return {
          data_source: dataSource,
          raw_status,
          normalized_status: cfg?.normalized_status as NormalizedStatus,
          is_valid_for_gmv: cfg?.is_valid_for_gmv ?? true,
        };
      });
      if (items.some((item) => !item.normalized_status)) {
        throw new Error('请先为所有未配置状态选择归一化标准状态');
      }
      await phase1Api.batchUpsertStatusMappings(items);
    },
    onSuccess: async () => {
      message.success('状态归一化规则已保存，正在重新校验...');
      await queryClient.invalidateQueries({ queryKey: ['status-mappings'] });
      validateMutation.mutate();
    },
    onError: (err) => {
      message.error(err instanceof Error ? err.message : '保存状态规则失败');
    },
  });

  const batchBindMutation = useMutation({
    mutationFn: async () => {
      if (!validation) return;
      const items = validation.unknown_shops.map((shop_name) => ({
        shop_name,
        platform: unknownShopBindings[shop_name],
      }));
      if (items.some((i) => !i.platform)) {
        throw new Error('请先为所有未绑定店铺选择归属平台');
      }
      await phase1Api.batchBindShops(items);
    },
    onSuccess: async () => {
      message.success('新店铺归属绑定成功，正在重新校验...');
      await queryClient.invalidateQueries({ queryKey: ['shops'] });
      validateMutation.mutate();
    },
    onError: (err) => {
      message.error(err instanceof Error ? err.message : '店铺绑定失败');
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => {
      if (!validation) throw new Error('尚未完成预校验');
      return phase1Api.commitImport({
        validation_id: validation.validation_id,
        duplicate_strategy: duplicateStrategy,
        skip_error_rows: skipErrorRows,
      });
    },
    onSuccess: (data) => {
      setCommitResult(data);
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['order-lines'] });
      queryClient.invalidateQueries({ queryKey: ['effective-sales'] });
      queryClient.invalidateQueries({ queryKey: ['model-review'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      message.success(`批次 ${data.batch_no} 已成功入库`);
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '提交入库失败');
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const values = await saveTemplateForm.validateFields();
      const { mapping } = buildCompactMapping(columnMap);
      return phase1Api.createTemplate({
        code: values.code,
        name: values.name,
        data_source: dataSource,
        header_fingerprint: preview?.headers.slice(0, 8) ?? [],
        column_mapping: mapping,
        rules,
        default_platform: values.default_platform ?? null,
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setSelectedTemplateId(created.id);
      setSaveTemplateOpen(false);
      saveTemplateForm.resetFields();
      message.success(`已保存自定义模板「${created.name}」`);
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '保存模板失败');
    },
  });

  const quickCreateShopMutation = useMutation({
    mutationFn: async () => {
      const values = await quickShopForm.validateFields();
      return phase1Api.createShop({
        shop_name: values.shop_name,
        platform: values.platform,
        default_data_source: dataSource,
        is_active: true,
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['shops'] });
      setDefaultShopId(created.id);
      setQuickShopOpen(false);
      quickShopForm.resetFields();
      message.success(`已新建店铺「${created.shop_name}」并设为默认店铺`);
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '新建店铺失败');
    },
  });

  const resetWizard = () => {
    setStep(0);
    setUploadedFile(null);
    setPreview(null);
    setValidation(null);
    setCommitResult(null);
    setUnknownShopBindings({});
    setUnknownStatusBindings({});
    setAllowUnknownStatuses(false);
  };

  const needsDefaultShop = !columnMap.shop_name || Boolean(preview?.matched_template?.needs_default_shop);
  const allUnknownShopsSelected =
    (validation?.unknown_shops.length ?? 0) > 0 &&
    validation!.unknown_shops.every((name) => Boolean(unknownShopBindings[name]));
  const allUnknownStatusesSelected =
    (validation?.unknown_statuses.length ?? 0) > 0 &&
    validation!.unknown_statuses.every((name) => Boolean(unknownStatusBindings[name]?.normalized_status));
  const statusGateBlocked = (validation?.unknown_statuses.length ?? 0) > 0 && !allowUnknownStatuses;

  const headerOptions = useMemo(
    () => (preview?.headers ?? []).map((h) => ({ value: h, label: h })),
    [preview],
  );

  return (
    <Card variant="borderless" style={{ borderRadius: 10 }}>
      <Steps
        current={step}
        style={{ marginBottom: 24 }}
        items={[
          { title: '1. 上传文件', description: '自动识别编码与表头指纹' },
          { title: '2. 列映射与规则', description: '核对字段映射与京东分摊' },
          { title: '3. 预校验与绑定', description: '错行下载 + 新店铺平台归属' },
          { title: '4. 确认入库', description: 'Upsert 覆盖或跳过重复' },
        ]}
      />

      {step === 0 && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Upload.Dragger
            accept=".xlsx,.xls,.csv"
            maxCount={1}
            showUploadList={false}
            disabled={parseMutation.isPending}
            beforeUpload={(file) => {
              parseMutation.mutate({ file });
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              {parseMutation.isPending
                ? '正在解析文件编码与表头指纹...'
                : '点击或拖拽电商平台导出的 Excel / CSV 文件到此区域'}
            </p>
            <p className="ant-upload-hint">
              支持淘宝 / 天猫 / 抖音 / 京东 / 拼多多 / 聚水潭导出表（自动探测 GBK/UTF-8 编码，自动剥离买家姓名、手机号、详细地址等 PII 列）
            </p>
          </Upload.Dragger>

          {preview && (
            <Alert
              type="info"
              showIcon
              message={`已暂存文件：${preview.file_name}（编码：${preview.file_encoding}，共 ${preview.total_rows} 行）`}
              action={
                <Button type="primary" size="small" onClick={() => setStep(1)}>
                  继续列映射
                </Button>
              }
            />
          )}
        </Space>
      )}

      {step === 1 && preview && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={
              <Space wrap size={12}>
                <span>
                  文件：<strong>{preview.file_name}</strong>
                </span>
                <span>编码：{preview.file_encoding}</span>
                <span>总行数：{preview.total_rows}</span>
                {preview.matched_template && (
                  <Tag color="blue">
                    自动匹配：{preview.matched_template.name}（
                    {Math.round(preview.matched_template.match_score * 100)}%）
                  </Tag>
                )}
              </Space>
            }
            action={
              preview.sheets.length > 1 && uploadedFile ? (
                <Select
                  size="small"
                  style={{ width: 160 }}
                  value={preview.selected_sheet}
                  onChange={(sheetName) =>
                    parseMutation.mutate({ file: uploadedFile, sheetName })
                  }
                  options={preview.sheets.map((s) => ({ value: s, label: `工作表: ${s}` }))}
                />
              ) : undefined
            }
          />

          {preview.pii_columns_detected.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`已自动剥离 ${preview.pii_columns_detected.length} 个买家隐私字段（${preview.pii_columns_detected.join('、')}），不会入库也不会写入 raw_extra`}
            />
          )}

          <Row gutter={[16, 12]} align="bottom">
            <Col xs={24} md={6}>
              <Text strong>数据来源（Data Source）</Text>
              <Select
                aria-label="数据来源"
                style={{ width: '100%', marginTop: 4 }}
                value={dataSource}
                onChange={setDataSource}
                options={Object.entries(DATA_SOURCE_META).map(([k, v]) => ({
                  value: k,
                  label: v.label,
                }))}
              />
            </Col>
            <Col xs={24} md={8}>
              <Text strong>映射模板（Mapping Template）</Text>
              <Select
                aria-label="映射模板"
                style={{ width: '100%', marginTop: 4 }}
                allowClear
                placeholder="选择模板或手动配置"
                value={selectedTemplateId ?? undefined}
                onChange={(id) => {
                  if (!id) {
                    setSelectedTemplateId(null);
                    return;
                  }
                  const target = templates.find((t) => t.id === id);
                  if (target) applyTemplateToState(target, preview.headers);
                }}
                options={templates.map((t) => ({
                  value: t.id,
                  label: `${t.name}${t.is_builtin ? ' [内置]' : ' [自定义]'}`,
                }))}
              />
            </Col>
            <Col xs={24} md={7}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong>
                  默认归属店铺{needsDefaultShop ? '（当前文件无店铺列或全为空，必填）' : '（可选兜底）'}
                </Text>
                <Button
                  type="link"
                  size="small"
                  icon={<PlusOutlined />}
                  style={{ padding: 0 }}
                  onClick={() => setQuickShopOpen(true)}
                >
                  新建店铺
                </Button>
              </div>
              <Select
                aria-label="默认归属店铺"
                style={{ width: '100%', marginTop: 4 }}
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="请选择归属店铺"
                value={defaultShopId ?? undefined}
                onChange={(val) => setDefaultShopId(val ?? null)}
                options={activeShops.map((s) => ({
                  value: s.id,
                  label: `${s.shop_name} (${PLATFORM_META[s.platform]?.label ?? s.platform}${
                    s.shop_status === 'dormant' ? ' · 休眠' : ''
                  })`,
                }))}
              />
            </Col>
            <Col xs={24} md={3}>
              <Space direction="vertical" size={4}>
                <Text strong style={{ fontSize: 12 }}>
                  整单实付分摊
                </Text>
                <Switch
                  aria-label="整单实付分摊"
                  checked={Boolean(rules.prorate_order_amount)}
                  onChange={(checked) =>
                    setRules((prev) => ({
                      ...prev,
                      prorate_order_amount: checked,
                      prorate_weight_field: 'unit_price',
                    }))
                  }
                  checkedChildren="京东分摊"
                  unCheckedChildren="行级金额"
                />
              </Space>
            </Col>
          </Row>

          <Card size="small" style={{ background: '#f8fafc' }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space wrap>
                <Text strong>来源角色（Source Role）：</Text>
                <Radio.Group
                  aria-label="来源角色"
                  value={sourceRole}
                  onChange={(e) => setSourceRole(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  size="small"
                  options={(Object.keys(SOURCE_ROLE_META) as SourceRole[]).map((r) => ({
                    value: r,
                    label: SOURCE_ROLE_META[r].label,
                  }))}
                />
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {SOURCE_ROLE_META[sourceRole].desc}
              </Text>
            </Space>
          </Card>

          <Table
            size="small"
            rowKey="key"
            pagination={false}
            scroll={{ y: 380 }}
            dataSource={CANONICAL_FIELDS}
            columns={[
              {
                title: '系统标准字段',
                width: 220,
                render: (_, f) => (
                  <Space size={6}>
                    <Text strong={f.required}>{f.label}</Text>
                    <Text type="secondary" className="num-mono" style={{ fontSize: 11 }}>
                      {f.key}
                    </Text>
                    {f.required && <Tag color="red">必填</Tag>}
                  </Space>
                ),
              },
              {
                title: '原始表头列映射',
                width: 260,
                render: (_, f) => (
                  <Select
                    size="small"
                    allowClear
                    showSearch
                    placeholder="未映射（留空或存入 raw_extra）"
                    style={{ width: '100%' }}
                    value={columnMap[f.key]}
                    onChange={(val) =>
                      setColumnMap((prev) => {
                        const next = { ...prev };
                        if (val) next[f.key] = val;
                        else delete next[f.key];
                        return next;
                      })
                    }
                    options={headerOptions}
                  />
                ),
              },
              {
                title: '样例首行值',
                width: 220,
                render: (_, f) => {
                  const rawCol = columnMap[f.key];
                  const val = rawCol ? preview.sample_rows[0]?.[rawCol] : undefined;
                  return (
                    <Text type="secondary" ellipsis style={{ maxWidth: 200 }} title={val ?? ''}>
                      {val ?? '-'}
                    </Text>
                  );
                },
              },
              { title: '口径与清洗说明', dataIndex: 'hint' },
            ]}
          />

          <Space wrap>
            <Button onClick={() => setStep(0)}>重新上传</Button>
            <Button
              icon={<SaveOutlined />}
              onClick={() => {
                saveTemplateForm.setFieldsValue({
                  code: `custom_${dataSource}_${Date.now().toString().slice(-4)}`,
                  name: `${DATA_SOURCE_META[dataSource].label}自定义模板`,
                });
                setSaveTemplateOpen(true);
              }}
            >
              另存为自定义模板
            </Button>
            <Button
              type="primary"
              loading={validateMutation.isPending}
              onClick={() => validateMutation.mutate()}
            >
              执行预校验
            </Button>
          </Space>
        </Space>
      )}

      {step === 2 && validation && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={12}>
            <Col xs={12} md={4}>
              <Statistic title="总行数" value={validation.summary.total_rows} />
            </Col>
            <Col xs={12} md={4}>
              <Statistic
                title="校验通过"
                value={validation.summary.valid_rows}
                valueStyle={{ color: '#16a34a' }}
              />
            </Col>
            <Col xs={12} md={4}>
              <Statistic
                title="错误行"
                value={validation.summary.error_rows}
                valueStyle={{ color: validation.summary.error_rows > 0 ? '#dc2626' : '#475569' }}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="预计新增 / 更新"
                value={`${validation.summary.estimated_inserts} / ${validation.summary.estimated_updates}`}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="整单分摊订单数"
                value={validation.summary.prorated_orders}
                valueStyle={{ color: '#0284c7' }}
              />
            </Col>
          </Row>

          {validation.v2_summary && (
            <Card
              size="small"
              title={
                <Space>
                  <span>V2 有效销售与型号匹配预估</span>
                  {validation.source_role && (
                    <Tag color={SOURCE_ROLE_META[validation.source_role].color}>
                      {SOURCE_ROLE_META[validation.source_role].label}
                    </Tag>
                  )}
                </Space>
              }
              style={{ background: '#f8fafc' }}
            >
              <Row gutter={[12, 12]}>
                <Col xs={12} md={4}>
                  <Statistic
                    title="预计有效销售"
                    value={validation.v2_summary.estimated_effective_valid}
                    valueStyle={{ color: '#0369a1' }}
                  />
                </Col>
                <Col xs={12} md={4}>
                  <Statistic
                    title="预计排除 / 待核对"
                    value={`${validation.v2_summary.estimated_excluded} / ${validation.v2_summary.estimated_needs_review}`}
                  />
                </Col>
                <Col xs={12} md={4}>
                  <Statistic
                    title="京东整机合并"
                    value={validation.v2_summary.jd_merged_orders}
                  />
                </Col>
                <Col xs={12} md={4}>
                  <Statistic
                    title="ERP 补全条数"
                    value={validation.v2_summary.estimated_erp_enriched}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Space direction="vertical" size={4}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      型号匹配预估（不阻断入库）
                    </Text>
                    <Space wrap>
                      <Tag color="success">自动命中 {validation.v2_summary.model_matched}</Tag>
                      <Tag color="warning">一对多冲突 {validation.v2_summary.model_ambiguous}</Tag>
                      <Tag color="error">未命中 {validation.v2_summary.model_unmatched}</Tag>
                    </Space>
                  </Space>
                </Col>
              </Row>
              {Object.keys(validation.v2_summary.exclusion_breakdown ?? {}).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                    排除原因分布：
                  </Text>
                  <Space wrap size={[6, 6]}>
                    {Object.entries(validation.v2_summary.exclusion_breakdown).map(([k, v]) => (
                      <Tag key={k}>
                        {EXCLUSION_REASON_LABELS[k] ?? k}: {v}
                      </Tag>
                    ))}
                  </Space>
                </div>
              )}
            </Card>
          )}

          {validation.inactive_shops && validation.inactive_shops.length > 0 && (
            <Alert
              type="error"
              showIcon
              message={`检测到 ${validation.inactive_shops.length} 个「未启用」店铺（${validation.inactive_shops.join('、')}），请先前往基础主数据中心将其状态改为「启用」或「休眠」后再导入`}
            />
          )}

          {validation.unknown_shops.length > 0 && (
            <Alert
              type="error"
              showIcon
              message={`发现 ${validation.unknown_shops.length} 个未绑定销售平台的新店铺（必须全部绑定后才可提交入库）`}
              description={
                <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 8 }}>
                  {validation.unknown_shops.map((shopName) => (
                    <Space key={shopName} wrap>
                      <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>
                        {shopName}
                      </Tag>
                      <Select
                        aria-label={`绑定店铺-${shopName}`}
                        size="small"
                        placeholder="选择归属销售平台"
                        style={{ width: 160 }}
                        value={unknownShopBindings[shopName]}
                        onChange={(platform) =>
                          setUnknownShopBindings((prev) => ({ ...prev, [shopName]: platform }))
                        }
                        options={Object.entries(PLATFORM_META).map(([k, v]) => ({
                          value: k,
                          label: v.label,
                        }))}
                      />
                    </Space>
                  ))}
                  <Button
                    type="primary"
                    size="small"
                    disabled={!allUnknownShopsSelected}
                    loading={batchBindMutation.isPending}
                    onClick={() => batchBindMutation.mutate()}
                  >
                    一键绑定并重新校验
                  </Button>
                </Space>
              }
            />
          )}

          {validation.unknown_statuses.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`检测到 ${validation.unknown_statuses.length} 个未配置归一化规则的原始订单状态（建议配置后重验，防止误算 GMV）`}
              description={
                <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 8 }}>
                  {validation.unknown_statuses.map((rawStatus) => {
                    const cfg = unknownStatusBindings[rawStatus] ?? {
                      normalized_status: undefined,
                      is_valid_for_gmv: true,
                    };
                    return (
                      <Space key={rawStatus} wrap align="center">
                        <Tag color="orange" style={{ fontSize: 13, padding: '2px 8px' }}>
                          {rawStatus}
                        </Tag>
                        <Select
                          aria-label={`配置状态-${rawStatus}`}
                          size="small"
                          placeholder="选择标准订单状态"
                          style={{ width: 165 }}
                          value={cfg.normalized_status}
                          onChange={(normalized_status) =>
                            setUnknownStatusBindings((prev) => ({
                              ...prev,
                              [rawStatus]: {
                                normalized_status,
                                is_valid_for_gmv: normalized_status !== 'pending_pay',
                              },
                            }))
                          }
                          options={Object.entries(NORMALIZED_STATUS_META).map(([k, v]) => ({
                            value: k,
                            label: v.label,
                          }))}
                        />
                        <Switch
                          aria-label={`计入GMV-${rawStatus}`}
                          size="small"
                          checked={cfg.is_valid_for_gmv}
                          checkedChildren="计入GMV"
                          unCheckedChildren="剔除GMV"
                          onChange={(checked) =>
                            setUnknownStatusBindings((prev) => ({
                              ...prev,
                              [rawStatus]: {
                                ...(prev[rawStatus] ?? { is_valid_for_gmv: checked }),
                                is_valid_for_gmv: checked,
                              },
                            }))
                          }
                        />
                      </Space>
                    );
                  })}
                  <Space wrap>
                    <Button
                      type="primary"
                      size="small"
                      disabled={!allUnknownStatusesSelected}
                      loading={batchBindStatusesMutation.isPending}
                      onClick={() => batchBindStatusesMutation.mutate()}
                    >
                      一键保存状态规则并重新校验
                    </Button>
                    <Checkbox
                      checked={allowUnknownStatuses}
                      onChange={(e) => setAllowUnknownStatuses(e.target.checked)}
                    >
                      忽略未配置状态，暂按付款时间兜底归类继续入库
                    </Checkbox>
                  </Space>
                </Space>
              }
            />
          )}

          <Tabs
            items={[
              {
                key: 'errors',
                label: `校验错误行 (${validation.summary.error_rows})`,
                children: (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {validation.summary.error_rows > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text type="secondary">
                          下方展示前 {validation.errors_preview.length} 条错误；下载 Excel 可获取全部脱敏错误行。
                        </Text>
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={async () => {
                            try {
                              await phase1Api.downloadValidationErrors(validation.validation_id);
                              message.success('错误行 Excel 已开始下载');
                            } catch (err) {
                              message.error(err instanceof Error ? err.message : '下载失败');
                            }
                          }}
                        >
                          下载错误行 Excel
                        </Button>
                      </div>
                    )}
                    <Table
                      size="small"
                      pagination={false}
                      locale={{ emptyText: '无校验错误行，全部数据合法' }}
                      rowKey={(r) => `${r.row_number}-${r.field_name}-${r.error_code}`}
                      dataSource={validation.errors_preview}
                      columns={[
                        { title: '行号', dataIndex: 'row_number', width: 80 },
                        { title: '字段', dataIndex: 'field_name', width: 150 },
                        {
                          title: '原始值',
                          dataIndex: 'raw_value',
                          width: 160,
                          render: (v) => v ?? '(空)',
                        },
                        { title: '错误码', dataIndex: 'error_code', width: 160 },
                        { title: '错误原因', dataIndex: 'error_message' },
                      ]}
                    />
                  </Space>
                ),
              },
              {
                key: 'warnings',
                label: `清洗与分摊提示 (${validation.summary.warning_rows})`,
                children: (
                  <Table
                    size="small"
                    pagination={false}
                    locale={{ emptyText: '无清洗警告' }}
                    rowKey={(r) => `${r.row_number}-${r.field_name}-${r.message}`}
                    dataSource={validation.warnings_preview}
                    columns={[
                      { title: '行号', dataIndex: 'row_number', width: 80 },
                      { title: '字段', dataIndex: 'field_name', width: 150 },
                      { title: '提示信息', dataIndex: 'message' },
                    ]}
                  />
                ),
              },
              ...(validation.ambiguous_model_preview &&
              validation.ambiguous_model_preview.length > 0
                ? [
                    {
                      key: 'ambiguous-models',
                      label: `待确认型号预览 (${validation.ambiguous_model_preview.length})`,
                      children: (
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          <Alert
                            type="info"
                            showIcon
                            message="这些记录存在一对多渠道 ID 冲突，不会阻断当前批次提交；入库后可前往「待确认型号」页面批量点选并一键沉淀映射规则。"
                          />
                          <Table
                            size="small"
                            pagination={false}
                            rowKey={(r) => `${r.row_number}-${r.platform_order_id}-${r.external_id ?? ''}`}
                            dataSource={validation.ambiguous_model_preview}
                            columns={[
                              { title: '行号', dataIndex: 'row_number', width: 70 },
                              { title: '订单号', dataIndex: 'platform_order_id', width: 170 },
                              { title: '渠道ID', width: 170, render: (_, r) => `${r.channel_type ?? '-'}: ${r.external_id ?? '-'}` },
                              { title: '商品名称', dataIndex: 'raw_product_name', ellipsis: true },
                              {
                                title: '候选标准型号',
                                render: (_, r) => (
                                  <Space wrap size={[4, 4]}>
                                    {r.candidates.map((c) => (
                                      <Tag key={c.model_id} color="warning">
                                        {c.brand} · {c.standard_model}
                                      </Tag>
                                    ))}
                                  </Space>
                                ),
                              },
                            ]}
                          />
                        </Space>
                      ),
                    },
                  ]
                : []),
              {
                key: 'cleaned',
                label: `清洗后样例预览 (${validation.cleaned_sample_rows.length})`,
                children: (
                  <Table
                    size="small"
                    pagination={false}
                    scroll={{ x: 960 }}
                    rowKey={(r) => `${r.platform_order_id ?? ''}-${r.line_key ?? ''}-${r.product_name ?? ''}`}
                    dataSource={validation.cleaned_sample_rows}
                    columns={[
                      { title: '平台订单号', dataIndex: 'platform_order_id', width: 170, render: (v) => <span className="num-mono">{v}</span> },
                      { title: '行键', dataIndex: 'line_key', width: 150, render: (v) => <span className="num-mono">{v}</span> },
                      { title: '店铺', dataIndex: 'shop_name', width: 140 },
                      { title: '商品名称', dataIndex: 'product_name', width: 220 },
                      { title: '数量', dataIndex: 'quantity', width: 65, align: 'right' },
                      {
                        title: '实付/应收',
                        width: 120,
                        align: 'right',
                        render: (_, r) => (
                          <Space size={4}>
                            <strong className="num-mono">¥{r.paid_amount}</strong>
                            {r.is_amount_prorated && <Tag color="blue">分摊</Tag>}
                          </Space>
                        ),
                      },
                      {
                        title: '退款金额',
                        width: 105,
                        align: 'right',
                        render: (_, r) => (
                          <span className="num-mono" style={{ color: Number(r.refund_amount ?? 0) > 0 ? '#dc2626' : '#64748b' }}>
                            ¥{r.refund_amount ?? '0.00'}
                          </span>
                        ),
                      },
                      {
                        title: '标准状态',
                        width: 155,
                        render: (_, r) =>
                          r.normalized_status ? (
                            <Space size={4}>
                              <Tag color={NORMALIZED_STATUS_META[r.normalized_status].color}>
                                {NORMALIZED_STATUS_META[r.normalized_status].label}
                              </Tag>
                              {r.is_valid_for_gmv === false && <Tag>不计GMV</Tag>}
                            </Space>
                          ) : (
                            '-'
                          ),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />

          <Space>
            <Button onClick={() => setStep(1)}>返回调整映射</Button>
            <Button
              type="primary"
              disabled={
                validation.unknown_shops.length > 0 ||
                (validation.inactive_shops?.length ?? 0) > 0 ||
                statusGateBlocked ||
                validation.summary.valid_rows === 0
              }
              onClick={() => setStep(3)}
            >
              下一步：确认入库策略
            </Button>
          </Space>
        </Space>
      )}

      {step === 3 && validation && !commitResult && (
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="文件名">{preview?.file_name}</Descriptions.Item>
            <Descriptions.Item label="数据来源">{DATA_SOURCE_META[dataSource].label}</Descriptions.Item>
            <Descriptions.Item label="校验通过行数">{validation.summary.valid_rows}</Descriptions.Item>
            <Descriptions.Item label="错误行数">{validation.summary.error_rows}</Descriptions.Item>
            <Descriptions.Item label="预计新增行数">{validation.summary.estimated_inserts}</Descriptions.Item>
            <Descriptions.Item label="预计更新行数">{validation.summary.estimated_updates}</Descriptions.Item>
          </Descriptions>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              重复订单处理策略（按 平台 + 平台订单号 + 行唯一键 识别）：
            </Text>
            <Radio.Group
              value={duplicateStrategy}
              onChange={(e) => setDuplicateStrategy(e.target.value)}
            >
              <Space direction="vertical">
                <Radio value="upsert">
                  <strong>覆盖更新（Upsert · 默认推荐）</strong>：更新已有订单行的最新状态与退款金额，并保存修改前快照支持一键精确回滚
                </Radio>
                <Radio value="skip">
                  <strong>跳过重复（Skip）</strong>：已存在的订单行保持不变，仅写入全新订单行
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          {validation.summary.error_rows > 0 && (
            <Checkbox
              checked={skipErrorRows}
              onChange={(e) => setSkipErrorRows(e.target.checked)}
            >
              跳过 {validation.summary.error_rows} 条校验错误行，仅将 {validation.summary.valid_rows} 条合法行写入数据库（错误行将留存在批次历史中随时可下载）
            </Checkbox>
          )}

          <Space>
            <Button onClick={() => setStep(2)}>返回预校验报告</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={commitMutation.isPending}
              disabled={validation.summary.error_rows > 0 && !skipErrorRows}
              onClick={() => commitMutation.mutate()}
            >
              确认正式入库
            </Button>
          </Space>
        </Space>
      )}

      {commitResult && (
        <Result
          status="success"
          title={`导入批次 ${commitResult.batch_no} 已入库完成`}
          subTitle={
            `Layer 1 原始行：总计 ${commitResult.total_rows}（新增 ${commitResult.inserted_rows}、更新 ${commitResult.updated_rows}、ERP补全 ${commitResult.enriched_rows ?? 0}、跳过 ${commitResult.skipped_rows}、错误 ${commitResult.error_rows}）` +
            (commitResult.effective_rows !== undefined
              ? ` ｜ Layer 2 有效销售：有效 ${commitResult.effective_rows} 条、排除 ${commitResult.excluded_rows ?? 0} 条、待确认型号 ${commitResult.pending_model_rows ?? 0} 条`
              : '')
          }
          extra={[
            <Button key="effective" type="primary" onClick={() => navigate('/effective-sales')}>
              查看有效销售明细
            </Button>,
            ...(commitResult.pending_model_rows && commitResult.pending_model_rows > 0
              ? [
                  <Button
                    key="review"
                    type="primary"
                    ghost
                    onClick={() => navigate('/model-review')}
                  >
                    处理待确认型号 ({commitResult.pending_model_rows})
                  </Button>,
                ]
              : []),
            <Button key="orders" onClick={() => navigate('/orders')}>
              查看原始订单行 (L1)
            </Button>,
            <Button key="batches" onClick={() => navigate('/management')}>
              管理导入批次
            </Button>,
            <Button key="again" onClick={resetWizard}>
              继续导入新文件
            </Button>,
          ]}
        />
      )}

      {/* Save Custom Template Modal */}
      <Modal
        title="另存为自定义映射模板"
        open={saveTemplateOpen}
        onCancel={() => setSaveTemplateOpen(false)}
        onOk={() => saveTemplateMutation.mutate()}
        confirmLoading={saveTemplateMutation.isPending}
      >
        <Form form={saveTemplateForm} layout="vertical">
          <Form.Item
            name="code"
            label="模板编码（唯一标识）"
            rules={[{ required: true, message: '请输入模板编码' }]}
          >
            <Input placeholder="例如 custom_jd_2026" />
          </Form.Item>
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="例如 京东家电专营店自定义模板" />
          </Form.Item>
          <Form.Item name="default_platform" label="默认销售平台（可选）">
            <Select
              allowClear
              options={Object.entries(PLATFORM_META).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Quick Create Shop Modal */}
      <Modal
        title="快速新建店铺并绑定平台"
        open={quickShopOpen}
        onCancel={() => setQuickShopOpen(false)}
        onOk={() => quickCreateShopMutation.mutate()}
        confirmLoading={quickCreateShopMutation.isPending}
      >
        <Form form={quickShopForm} layout="vertical">
          <Form.Item
            name="shop_name"
            label="店铺名称"
            rules={[{ required: true, message: '请输入店铺名称' }]}
          >
            <Input placeholder="例如 品牌官方旗舰店-京东" />
          </Form.Item>
          <Form.Item
            name="platform"
            label="归属销售平台"
            rules={[{ required: true, message: '请选择归属销售平台' }]}
          >
            <Select
              options={Object.entries(PLATFORM_META).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
