import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
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
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  TagsOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../api/client';
import { v2Api } from '../api/v2Client';
import {
  DATA_SOURCE_META,
  PLATFORM_META,
  type DataSource,
  type Platform,
  type Shop,
  type ShopInput,
} from '../contracts/phase1';
import {
  CHANNEL_TYPE_META,
  OPERATOR_TYPE_META,
  SALES_MODE_META,
  SHOP_STATUS_META,
  type ChannelType,
  type OperatorType,
  type ProductCategory,
  type ProductChannelMapping,
  type ProductModel,
  type ProductsExcelImportResult,
  type ProductUnitComponent,
  type SalesMode,
  type ShopsExcelImportResult,
  type ShopStatus,
} from '../contracts/v2';

const { Text } = Typography;

export function MasterDataPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('shops');

  // ---- Shop filters & modals ----
  const [shopPlatform, setShopPlatform] = useState<Platform | undefined>(undefined);
  const [shopOperator, setShopOperator] = useState<OperatorType | undefined>(undefined);
  const [shopMode, setShopMode] = useState<SalesMode | undefined>(undefined);
  const [shopStatus, setShopStatus] = useState<ShopStatus | undefined>(undefined);
  const [shopKeyword, setShopKeyword] = useState('');
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [shopForm] = Form.useForm();
  const [aliasShop, setAliasShop] = useState<Shop | null>(null);
  const [aliasForm] = Form.useForm();
  const [shopsImportResult, setShopsImportResult] = useState<ShopsExcelImportResult | null>(null);

  // ---- Product models filters & modals ----
  const [modelSegment, setModelSegment] = useState<string | undefined>(undefined);
  const [modelCategory, setModelCategory] = useState<string | undefined>(undefined);
  const [modelBrand, setModelBrand] = useState<string | undefined>(undefined);
  const [modelKeyword, setModelKeyword] = useState('');
  const [onlyWithComponents, setOnlyWithComponents] = useState(false);
  const [onlyAmbiguousModels, setOnlyAmbiguousModels] = useState(false);
  const [modelPage, setModelPage] = useState(1);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ProductModel | null>(null);
  const [modelForm] = Form.useForm();
  const [productsImportResult, setProductsImportResult] =
    useState<ProductsExcelImportResult | null>(null);

  // Component modal
  const [componentTargetModel, setComponentTargetModel] = useState<ProductModel | null>(null);
  const [editingComponent, setEditingComponent] = useState<ProductUnitComponent | null>(null);
  const [componentForm] = Form.useForm();

  // Channel mapping modal
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ProductChannelMapping | null>(null);
  const [mappingForm] = Form.useForm();

  // Conflict filters
  const [conflictChannel, setConflictChannel] = useState<ChannelType | undefined>(undefined);
  const [conflictKeyword, setConflictKeyword] = useState('');

  // Category modal
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [categoryForm] = Form.useForm();

  // ---- Queries ----
  const shopsQuery = useQuery({
    queryKey: ['v2-shops', shopPlatform, shopOperator, shopMode, shopStatus, shopKeyword],
    queryFn: () =>
      v2Api.listShops({
        platform: shopPlatform,
        operator_type: shopOperator,
        sales_mode: shopMode,
        shop_status: shopStatus,
        keyword: shopKeyword.trim() || undefined,
      }),
  });

  const allShopsQuery = useQuery({
    queryKey: ['v2-shops-all'],
    queryFn: () => v2Api.listShops(),
  });

  const categoriesQuery = useQuery({
    queryKey: ['v2-categories'],
    queryFn: () => v2Api.listCategories(),
  });

  const modelsQuery = useQuery({
    queryKey: [
      'v2-models',
      modelSegment,
      modelCategory,
      modelBrand,
      modelKeyword,
      onlyWithComponents,
      onlyAmbiguousModels,
      modelPage,
    ],
    queryFn: () =>
      v2Api.listModels({
        business_segment: modelSegment,
        category: modelCategory,
        brand: modelBrand,
        keyword: modelKeyword.trim() || undefined,
        only_with_components: onlyWithComponents || undefined,
        only_ambiguous: onlyAmbiguousModels || undefined,
        page: modelPage,
        page_size: 30,
      }),
  });

  const conflictsQuery = useQuery({
    queryKey: ['v2-channel-conflicts', conflictChannel, conflictKeyword],
    queryFn: () =>
      v2Api.listChannelMappings({
        channel_type: conflictChannel,
        only_ambiguous: true,
        keyword: conflictKeyword.trim() || undefined,
        page: 1,
        page_size: 100,
      }),
  });

  const categories = categoriesQuery.data?.items ?? [];
  const segmentOptions = useMemo(
    () => Array.from(new Set(categories.map((c) => c.business_segment))),
    [categories],
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(categories.map((c) => c.category))),
    [categories],
  );
  const brandOptions = useMemo(
    () => Array.from(new Set(categories.map((c) => c.brand))),
    [categories],
  );

  const invalidateMasterData = () => {
    queryClient.invalidateQueries({ queryKey: ['v2-shops'] });
    queryClient.invalidateQueries({ queryKey: ['v2-shops-all'] });
    queryClient.invalidateQueries({ queryKey: ['shops'] });
    queryClient.invalidateQueries({ queryKey: ['v2-categories'] });
    queryClient.invalidateQueries({ queryKey: ['v2-models'] });
    queryClient.invalidateQueries({ queryKey: ['v2-channel-conflicts'] });
  };

  // ---- Shop Mutations ----
  const importShopsMutation = useMutation({
    mutationFn: (file: File) => v2Api.importShopsExcel(file),
    onSuccess: (res) => {
      setShopsImportResult(res);
      invalidateMasterData();
      message.success(`店铺主数据导入完成：新增 ${res.inserted}，更新 ${res.updated}`);
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '导入店铺 Excel 失败');
    },
  });

  const saveShopMutation = useMutation({
    mutationFn: (values: ShopInput) =>
      editingShop ? v2Api.updateShop(editingShop.id, values) : v2Api.createShop(values),
    onSuccess: () => {
      setShopModalOpen(false);
      invalidateMasterData();
      message.success(editingShop ? '店铺已更新' : '店铺已新增');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '保存店铺失败'),
  });

  const deleteShopMutation = useMutation({
    mutationFn: (id: number) => v2Api.deleteShop(id),
    onSuccess: () => {
      invalidateMasterData();
      message.success('店铺已删除');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '删除店铺失败'),
  });

  const createAliasMutation = useMutation({
    mutationFn: ({
      shopId,
      alias_name,
      source_hint,
    }: {
      shopId: number;
      alias_name: string;
      source_hint?: DataSource | '*' | null;
    }) => v2Api.createShopAlias(shopId, { alias_name, source_hint }),
    onSuccess: () => {
      aliasForm.resetFields();
      invalidateMasterData();
      message.success('店铺别名已添加');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '添加别名失败'),
  });

  const deleteAliasMutation = useMutation({
    mutationFn: (aliasId: number) => v2Api.deleteShopAlias(aliasId),
    onSuccess: () => {
      invalidateMasterData();
      message.success('店铺别名已移除');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '移除别名失败'),
  });

  // ---- Product Mutations ----
  const importProductsMutation = useMutation({
    mutationFn: (file: File) => v2Api.importProductsExcel(file),
    onSuccess: (res) => {
      setProductsImportResult(res);
      invalidateMasterData();
      message.success(
        `产品主数据导入完成：型号 +${res.models.inserted}，内外机 +${res.components.inserted}，ID映射 +${res.channel_mappings.inserted}`,
      );
    },
    onError: (err) => {
      message.error(err instanceof ApiClientError ? err.message : '导入产品 Excel 失败');
    },
  });

  const saveModelMutation = useMutation({
    mutationFn: (values: {
      standard_model: string;
      business_segment: string;
      category: string;
      brand: string;
      is_3c_full_name?: boolean;
      is_active?: boolean;
      notes?: string;
    }) => (editingModel ? v2Api.updateModel(editingModel.id, values) : v2Api.createModel(values)),
    onSuccess: () => {
      setModelModalOpen(false);
      invalidateMasterData();
      message.success(editingModel ? '标准型号已更新' : '标准型号已新增');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '保存型号失败'),
  });

  const deleteModelMutation = useMutation({
    mutationFn: (id: number) => v2Api.deleteModel(id),
    onSuccess: () => {
      invalidateMasterData();
      message.success('标准型号已删除');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '删除型号失败'),
  });

  const saveComponentMutation = useMutation({
    mutationFn: (values: {
      component_model: string;
      unit_type: 'indoor' | 'outdoor';
      mapping_value?: string;
    }) => {
      const payload = { ...values, mapping_value: values.mapping_value?.trim() || null };
      if (editingComponent) return v2Api.updateComponent(editingComponent.id, payload);
      return v2Api.createComponent(componentTargetModel!.id, payload);
    },
    onSuccess: () => {
      setComponentTargetModel(null);
      setEditingComponent(null);
      invalidateMasterData();
      message.success('内外机组件已保存');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '保存组件失败'),
  });

  const deleteComponentMutation = useMutation({
    mutationFn: (id: number) => v2Api.deleteComponent(id),
    onSuccess: () => {
      invalidateMasterData();
      message.success('内外机组件已删除');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '删除组件失败'),
  });

  const saveMappingMutation = useMutation({
    mutationFn: (values: {
      model_id: number;
      channel_type: ChannelType;
      external_id: string;
      secondary_external_id?: string;
      shop_scope_id?: number;
      is_active?: boolean;
    }) => {
      const payload = {
        ...values,
        secondary_external_id: values.secondary_external_id?.trim() || '',
        shop_scope_id: values.shop_scope_id ?? 0,
        match_source: editingMapping?.match_source ?? ('manual' as const),
      };
      return editingMapping
        ? v2Api.updateChannelMapping(editingMapping.id, payload)
        : v2Api.createChannelMapping(payload);
    },
    onSuccess: () => {
      setMappingModalOpen(false);
      setEditingMapping(null);
      invalidateMasterData();
      message.success('渠道 ID 映射已保存');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '保存映射失败'),
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (id: number) => v2Api.deleteChannelMapping(id),
    onSuccess: () => {
      invalidateMasterData();
      message.success('渠道 ID 映射已删除');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '删除映射失败'),
  });

  const saveCategoryMutation = useMutation({
    mutationFn: (values: {
      business_segment: string;
      category: string;
      brand: string;
      report_brand?: string;
    }) => {
      const payload = { ...values, report_brand: values.report_brand?.trim() || null };
      return editingCategory
        ? v2Api.updateCategory(editingCategory.id, payload)
        : v2Api.createCategory(payload);
    },
    onSuccess: () => {
      setCategoryModalOpen(false);
      invalidateMasterData();
      message.success('产品分类已保存');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '保存分类失败'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => v2Api.deleteCategory(id),
    onSuccess: () => {
      invalidateMasterData();
      message.success('产品分类已删除');
    },
    onError: (err) => message.error(err instanceof ApiClientError ? err.message : '删除分类失败'),
  });

  const shopSummary = shopsQuery.data?.summary;
  const modelSummary = modelsQuery.data?.summary;
  const currentAliasShop = useMemo(() => {
    if (!aliasShop) return null;
    return (allShopsQuery.data?.items ?? []).find((s) => s.id === aliasShop.id) ?? aliasShop;
  }, [aliasShop, allShopsQuery.data?.items]);

  const openShopModal = (shop?: Shop) => {
    setEditingShop(shop ?? null);
    shopForm.resetFields();
    if (shop) {
      shopForm.setFieldsValue({
        shop_name: shop.shop_name,
        platform: shop.platform,
        operator_type: shop.operator_type ?? 'self_operated',
        entity_name: shop.entity_name ?? '',
        sales_mode: shop.sales_mode ?? undefined,
        shop_status: shop.shop_status ?? (shop.is_active ? 'active' : 'inactive'),
        default_data_source: shop.default_data_source ?? undefined,
        erp_sales_enabled: Boolean(shop.erp_sales_enabled),
        zero_received_use_paid: Boolean(shop.zero_received_use_paid),
        preserve_full_product_name: Boolean(shop.preserve_full_product_name),
        notes: shop.notes ?? '',
      });
    } else {
      shopForm.setFieldsValue({
        platform: 'pdd',
        operator_type: 'self_operated',
        shop_status: 'active',
        erp_sales_enabled: false,
        zero_received_use_paid: false,
        preserve_full_product_name: false,
      });
    }
    setShopModalOpen(true);
  };

  const openModelModal = (model?: ProductModel) => {
    setEditingModel(model ?? null);
    modelForm.resetFields();
    if (model) {
      modelForm.setFieldsValue({
        standard_model: model.standard_model,
        business_segment: model.business_segment,
        category: model.category,
        brand: model.brand,
        is_3c_full_name: model.is_3c_full_name,
        is_active: model.is_active,
        notes: model.notes ?? '',
      });
    } else {
      modelForm.setFieldsValue({
        business_segment: '家电',
        is_3c_full_name: false,
        is_active: true,
      });
    }
    setModelModalOpen(true);
  };

  const openMappingModal = (defaults?: {
    mapping?: ProductChannelMapping;
    model_id?: number;
    channel_type?: ChannelType;
    external_id?: string;
  }) => {
    setEditingMapping(defaults?.mapping ?? null);
    mappingForm.resetFields();
    if (defaults?.mapping) {
      mappingForm.setFieldsValue({
        model_id: defaults.mapping.model_id,
        channel_type: defaults.mapping.channel_type,
        external_id: defaults.mapping.external_id,
        secondary_external_id: defaults.mapping.secondary_external_id,
        shop_scope_id: defaults.mapping.shop_scope_id || undefined,
        is_active: defaults.mapping.is_active,
      });
    } else {
      mappingForm.setFieldsValue({
        model_id: defaults?.model_id,
        channel_type: defaults?.channel_type ?? 'pdd_sku_id',
        external_id: defaults?.external_id ?? '',
        secondary_external_id: '',
        shop_scope_id: undefined,
        is_active: true,
      });
    }
    setMappingModalOpen(true);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Top KPI Summary Strip */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic
              title="店铺总数"
              value={shopSummary?.total ?? 0}
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  启用 {shopSummary?.active ?? 0} / 休眠 {shopSummary?.dormant ?? 0}
                </Text>
              }
            />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="ERP独立入销店铺" value={shopSummary?.erp_sales_enabled ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="标准型号数" value={modelSummary?.total_models ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="内外机组件" value={modelSummary?.total_components ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="渠道ID映射" value={modelSummary?.total_channel_mappings ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card
            size="small"
            hoverable
            onClick={() => setActiveTab('conflicts')}
            style={{
              borderColor: (modelSummary?.ambiguous_id_groups ?? 0) > 0 ? '#faad14' : undefined,
            }}
          >
            <Statistic
              title="一对多冲突ID组"
              value={modelSummary?.ambiguous_id_groups ?? 0}
              valueStyle={{
                color: (modelSummary?.ambiguous_id_groups ?? 0) > 0 ? '#d48806' : '#3f8600',
              }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'shops',
              label: `店铺主数据 (${shopSummary?.total ?? 0})`,
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space wrap>
                      <Select
                        allowClear
                        placeholder="平台"
                        style={{ width: 120 }}
                        value={shopPlatform}
                        onChange={setShopPlatform}
                        options={(Object.keys(PLATFORM_META) as Platform[]).map((p) => ({
                          value: p,
                          label: PLATFORM_META[p].label,
                        }))}
                      />
                      <Select
                        allowClear
                        placeholder="运营方"
                        style={{ width: 110 }}
                        value={shopOperator}
                        onChange={setShopOperator}
                        options={[
                          { value: 'self_operated', label: '自运营' },
                          { value: 'agency_operated', label: '代运营' },
                        ]}
                      />
                      <Select
                        allowClear
                        placeholder="销售模式"
                        style={{ width: 110 }}
                        value={shopMode}
                        onChange={setShopMode}
                        options={[
                          { value: 'dealer', label: '经销' },
                          { value: 'distribution', label: '分销' },
                          { value: 'hybrid', label: '混合' },
                        ]}
                      />
                      <Select
                        allowClear
                        placeholder="状态"
                        style={{ width: 110 }}
                        value={shopStatus}
                        onChange={setShopStatus}
                        options={[
                          { value: 'active', label: '启用' },
                          { value: 'dormant', label: '休眠' },
                          { value: 'inactive', label: '未启用' },
                        ]}
                      />
                      <Input.Search
                        allowClear
                        placeholder="搜店铺/主体/别名"
                        style={{ width: 200 }}
                        value={shopKeyword}
                        onChange={(e) => setShopKeyword(e.target.value)}
                      />
                    </Space>
                    <Space wrap>
                      <Upload
                        accept=".xlsx,.xls"
                        showUploadList={false}
                        beforeUpload={(file) => {
                          importShopsMutation.mutate(file);
                          return false;
                        }}
                      >
                        <Button
                          icon={<UploadOutlined />}
                          loading={importShopsMutation.isPending}
                        >
                          导入店铺基础信息.xlsx
                        </Button>
                      </Upload>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => openShopModal()}>
                        新增店铺
                      </Button>
                    </Space>
                  </Space>

                  <Alert
                    type="info"
                    showIcon
                    message="「启用」与「休眠」店铺均允许导入订单（便于历史补录），「未启用」店铺会在导入校验阶段拦截。店铺别名（如 展翅豪鹏3C店 → 智电汇通3C店）会在导入时自动归并。"
                  />

                  <Table<Shop>
                    rowKey="id"
                    size="small"
                    loading={shopsQuery.isLoading}
                    dataSource={shopsQuery.data?.items ?? []}
                    pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 家店铺` }}
                    scroll={{ x: 1180 }}
                    columns={[
                      {
                        title: '店铺名称 / 别名',
                        dataIndex: 'shop_name',
                        width: 240,
                        render: (name: string, row) => (
                          <Space direction="vertical" size={2}>
                            <Text strong>{name}</Text>
                            {row.aliases && row.aliases.length > 0 && (
                              <Space wrap size={[4, 4]}>
                                {row.aliases.map((a) => (
                                  <Tag key={a.id} color="default" style={{ fontSize: 11 }}>
                                    别名: {a.alias_name}
                                  </Tag>
                                ))}
                              </Space>
                            )}
                          </Space>
                        ),
                      },
                      {
                        title: '平台',
                        dataIndex: 'platform',
                        width: 90,
                        render: (p: Platform) => (
                          <Tag color={PLATFORM_META[p]?.color}>{PLATFORM_META[p]?.label ?? p}</Tag>
                        ),
                      },
                      {
                        title: '运营方',
                        dataIndex: 'operator_type',
                        width: 85,
                        render: (op?: OperatorType) =>
                          op ? (
                            <Tag color={OPERATOR_TYPE_META[op].color}>
                              {OPERATOR_TYPE_META[op].label}
                            </Tag>
                          ) : (
                            '-'
                          ),
                      },
                      {
                        title: '经营主体',
                        dataIndex: 'entity_name',
                        width: 170,
                        ellipsis: true,
                        render: (v?: string | null) => v || '-',
                      },
                      {
                        title: '销售模式',
                        dataIndex: 'sales_mode',
                        width: 85,
                        render: (m?: SalesMode | null) =>
                          m ? (
                            <Tag color={SALES_MODE_META[m].color}>{SALES_MODE_META[m].label}</Tag>
                          ) : (
                            <Text type="secondary">-</Text>
                          ),
                      },
                      {
                        title: '状态',
                        dataIndex: 'shop_status',
                        width: 80,
                        render: (st: ShopStatus = 'active') => (
                          <Tag color={SHOP_STATUS_META[st]?.color}>
                            {SHOP_STATUS_META[st]?.label ?? st}
                          </Tag>
                        ),
                      },
                      {
                        title: '业务特性开关',
                        width: 220,
                        render: (_, row) => (
                          <Space wrap size={[4, 4]}>
                            {row.erp_sales_enabled && <Tag color="purple">ERP独立入销</Tag>}
                            {row.zero_received_use_paid && <Tag color="orange">0实收取已付</Tag>}
                            {row.preserve_full_product_name && <Tag color="cyan">3C完整品名</Tag>}
                            {!row.erp_sales_enabled &&
                              !row.zero_received_use_paid &&
                              !row.preserve_full_product_name && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  标准直出
                                </Text>
                              )}
                          </Space>
                        ),
                      },
                      {
                        title: '操作',
                        width: 170,
                        fixed: 'right',
                        render: (_, row) => (
                          <Space size={4}>
                            <Button
                              size="small"
                              icon={<TagsOutlined />}
                              onClick={() => {
                                setAliasShop(row);
                                aliasForm.resetFields();
                              }}
                            >
                              别名
                            </Button>
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openShopModal(row)}
                            />
                            <Popconfirm
                              title={`确认删除店铺「${row.shop_name}」？`}
                              onConfirm={() => deleteShopMutation.mutate(row.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} />
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
              key: 'models',
              label: `产品型号与内外机 (${modelSummary?.total_models ?? 0})`,
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space wrap>
                      <Select
                        allowClear
                        placeholder="业务板块"
                        style={{ width: 110 }}
                        value={modelSegment}
                        onChange={(v) => {
                          setModelSegment(v);
                          setModelPage(1);
                        }}
                        options={segmentOptions.map((v) => ({ value: v, label: v }))}
                      />
                      <Select
                        allowClear
                        placeholder="品类"
                        style={{ width: 110 }}
                        value={modelCategory}
                        onChange={(v) => {
                          setModelCategory(v);
                          setModelPage(1);
                        }}
                        options={categoryOptions.map((v) => ({ value: v, label: v }))}
                      />
                      <Select
                        allowClear
                        placeholder="品牌"
                        style={{ width: 110 }}
                        value={modelBrand}
                        onChange={(v) => {
                          setModelBrand(v);
                          setModelPage(1);
                        }}
                        options={brandOptions.map((v) => ({ value: v, label: v }))}
                      />
                      <Input.Search
                        allowClear
                        placeholder="搜标准型号/品牌"
                        style={{ width: 200 }}
                        value={modelKeyword}
                        onChange={(e) => {
                          setModelKeyword(e.target.value);
                          setModelPage(1);
                        }}
                      />
                      <Space size={6}>
                        <Switch
                          size="small"
                          checked={onlyWithComponents}
                          onChange={(checked) => {
                            setOnlyWithComponents(checked);
                            setModelPage(1);
                          }}
                        />
                        <Text style={{ fontSize: 12 }}>仅看有内外机</Text>
                      </Space>
                      <Space size={6}>
                        <Switch
                          size="small"
                          checked={onlyAmbiguousModels}
                          onChange={(checked) => {
                            setOnlyAmbiguousModels(checked);
                            setModelPage(1);
                          }}
                        />
                        <Text style={{ fontSize: 12 }}>仅看冲突型号</Text>
                      </Space>
                    </Space>
                    <Space wrap>
                      <Upload
                        accept=".xlsx,.xls"
                        showUploadList={false}
                        beforeUpload={(file) => {
                          importProductsMutation.mutate(file);
                          return false;
                        }}
                      >
                        <Button
                          icon={<UploadOutlined />}
                          loading={importProductsMutation.isPending}
                        >
                          导入产品基础信息.xlsx
                        </Button>
                      </Upload>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => openModelModal()}
                      >
                        新增标准型号
                      </Button>
                    </Space>
                  </Space>

                  <Table<ProductModel>
                    rowKey="id"
                    size="small"
                    loading={modelsQuery.isLoading}
                    dataSource={modelsQuery.data?.items ?? []}
                    pagination={{
                      current: modelPage,
                      pageSize: 30,
                      total: modelsQuery.data?.total ?? 0,
                      onChange: setModelPage,
                      showTotal: (t) => `共 ${t} 个标准型号`,
                    }}
                    expandable={{
                      expandedRowRender: (model) => (
                        <Row gutter={16} style={{ padding: '4px 8px' }}>
                          <Col xs={24} lg={10}>
                            <Card
                              size="small"
                              title={`内外机组件 (${model.components.length})`}
                              extra={
                                <Button
                                  size="small"
                                  type="link"
                                  icon={<PlusOutlined />}
                                  onClick={() => {
                                    setComponentTargetModel(model);
                                    setEditingComponent(null);
                                    componentForm.resetFields();
                                    componentForm.setFieldsValue({ unit_type: 'indoor' });
                                  }}
                                >
                                  新增组件
                                </Button>
                              }
                            >
                              <Table<ProductUnitComponent>
                                rowKey="id"
                                size="small"
                                pagination={false}
                                dataSource={model.components}
                                locale={{ emptyText: '无内外机拆分（单品）' }}
                                columns={[
                                  {
                                    title: '内外机型号',
                                    dataIndex: 'component_model',
                                    render: (v) => <Text code>{v}</Text>,
                                  },
                                  {
                                    title: '类型',
                                    dataIndex: 'unit_type',
                                    width: 70,
                                    render: (t: 'indoor' | 'outdoor') => (
                                      <Tag color={t === 'indoor' ? 'blue' : 'default'}>
                                        {t === 'indoor' ? '内机' : '外机'}
                                      </Tag>
                                    ),
                                  },
                                  {
                                    title: '映射值 (D列)',
                                    dataIndex: 'mapping_value',
                                    render: (v?: string | null) => v || '-',
                                  },
                                  {
                                    title: '操作',
                                    width: 80,
                                    render: (_, comp) => (
                                      <Space size={4}>
                                        <Button
                                          size="small"
                                          type="text"
                                          icon={<EditOutlined />}
                                          onClick={() => {
                                            setComponentTargetModel(model);
                                            setEditingComponent(comp);
                                            componentForm.setFieldsValue({
                                              component_model: comp.component_model,
                                              unit_type: comp.unit_type,
                                              mapping_value: comp.mapping_value ?? '',
                                            });
                                          }}
                                        />
                                        <Popconfirm
                                          title="确认删除该组件？"
                                          onConfirm={() => deleteComponentMutation.mutate(comp.id)}
                                        >
                                          <Button
                                            size="small"
                                            type="text"
                                            danger
                                            icon={<DeleteOutlined />}
                                          />
                                        </Popconfirm>
                                      </Space>
                                    ),
                                  },
                                ]}
                              />
                            </Card>
                          </Col>
                          <Col xs={24} lg={14}>
                            <Card
                              size="small"
                              title={`多渠道 ID 映射 (${model.channel_mappings.length})`}
                              extra={
                                <Button
                                  size="small"
                                  type="link"
                                  icon={<PlusOutlined />}
                                  onClick={() => openMappingModal({ model_id: model.id })}
                                >
                                  新增映射
                                </Button>
                              }
                            >
                              <Table<ProductChannelMapping>
                                rowKey="id"
                                size="small"
                                pagination={false}
                                dataSource={model.channel_mappings}
                                locale={{ emptyText: '暂未配置渠道 ID' }}
                                columns={[
                                  {
                                    title: '渠道类型',
                                    dataIndex: 'channel_type',
                                    width: 150,
                                    render: (c: ChannelType) => (
                                      <Tag color={CHANNEL_TYPE_META[c]?.color}>
                                        {CHANNEL_TYPE_META[c]?.label ?? c}
                                      </Tag>
                                    ),
                                  },
                                  {
                                    title: '外部 ID',
                                    dataIndex: 'external_id',
                                    render: (v, rec) => (
                                      <Space size={4}>
                                        <Text code>{v}</Text>
                                        {rec.secondary_external_id && (
                                          <Tag>次级: {rec.secondary_external_id}</Tag>
                                        )}
                                        {rec.is_ambiguous && <Tag color="warning">一对多冲突</Tag>}
                                      </Space>
                                    ),
                                  },
                                  {
                                    title: '生效范围',
                                    dataIndex: 'shop_scope_name',
                                    width: 130,
                                    render: (v?: string | null) =>
                                      v ? <Tag color="blue">{v}</Tag> : <Tag>全局</Tag>,
                                  },
                                  {
                                    title: '操作',
                                    width: 80,
                                    render: (_, m) => (
                                      <Space size={4}>
                                        <Button
                                          size="small"
                                          type="text"
                                          icon={<EditOutlined />}
                                          onClick={() => openMappingModal({ mapping: m })}
                                        />
                                        <Popconfirm
                                          title="确认删除该映射？"
                                          onConfirm={() => deleteMappingMutation.mutate(m.id)}
                                        >
                                          <Button
                                            size="small"
                                            type="text"
                                            danger
                                            icon={<DeleteOutlined />}
                                          />
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
                    }}
                    columns={[
                      {
                        title: '标准型号',
                        dataIndex: 'standard_model',
                        render: (v: string, row) => (
                          <Space>
                            <Text strong copyable={{ text: v }}>
                              {v}
                            </Text>
                            {row.is_3c_full_name && <Tag color="cyan">3C全名</Tag>}
                            {row.has_ambiguous_mapping && (
                              <Tooltip title="存在指向多个型号的全局渠道ID">
                                <Tag color="warning" icon={<ExclamationCircleOutlined />}>
                                  含冲突ID
                                </Tag>
                              </Tooltip>
                            )}
                          </Space>
                        ),
                      },
                      { title: '业务板块', dataIndex: 'business_segment', width: 90 },
                      { title: '品类', dataIndex: 'category', width: 90 },
                      { title: '品牌', dataIndex: 'brand', width: 90 },
                      {
                        title: '内外机',
                        dataIndex: 'component_count',
                        width: 80,
                        render: (c: number) => (c > 0 ? <Tag color="blue">{c} 组件</Tag> : '-'),
                      },
                      {
                        title: '渠道映射',
                        dataIndex: 'mapping_count',
                        width: 90,
                        render: (c: number) => <Tag>{c} 条</Tag>,
                      },
                      {
                        title: '状态',
                        dataIndex: 'is_active',
                        width: 75,
                        render: (a: boolean) => (
                          <Tag color={a ? 'success' : 'default'}>{a ? '启用' : '停用'}</Tag>
                        ),
                      },
                      {
                        title: '操作',
                        width: 110,
                        render: (_, row) => (
                          <Space size={4}>
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openModelModal(row)}
                            />
                            <Popconfirm
                              title={`确认删除型号「${row.standard_model}」？`}
                              onConfirm={() => deleteModelMutation.mutate(row.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} />
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
              key: 'conflicts',
              label: (
                <Space size={6}>
                  <span>渠道 ID 冲突清单</span>
                  <Badge count={modelSummary?.ambiguous_id_groups ?? 0} size="small" />
                </Space>
              ),
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert
                    type="warning"
                    showIcon
                    message="以下渠道 ID 在全局范围同时指向多个标准型号（一对多冲突）。导入遇到这些 ID 时不会阻断批次，而是自动进入「待确认型号队列」，你也可以在这里直接为指定店铺添加作用域映射来消歧。"
                  />
                  <Space wrap>
                    <Select
                      allowClear
                      placeholder="按渠道类型筛选"
                      style={{ width: 190 }}
                      value={conflictChannel}
                      onChange={setConflictChannel}
                      options={(Object.keys(CHANNEL_TYPE_META) as ChannelType[]).map((c) => ({
                        value: c,
                        label: CHANNEL_TYPE_META[c].label,
                      }))}
                    />
                    <Input.Search
                      allowClear
                      placeholder="搜冲突外部 ID 或型号"
                      style={{ width: 240 }}
                      value={conflictKeyword}
                      onChange={(e) => setConflictKeyword(e.target.value)}
                    />
                  </Space>

                  <Table
                    rowKey={(g) => `${g.channel_type}:${g.external_id}`}
                    size="small"
                    loading={conflictsQuery.isLoading}
                    dataSource={conflictsQuery.data?.ambiguous_groups ?? []}
                    pagination={false}
                    locale={{ emptyText: '当前没有一对多冲突的全局渠道 ID' }}
                    columns={[
                      {
                        title: '渠道类型',
                        dataIndex: 'channel_type',
                        width: 180,
                        render: (c: ChannelType) => (
                          <Tag color={CHANNEL_TYPE_META[c]?.color}>
                            {CHANNEL_TYPE_META[c]?.label ?? c}
                          </Tag>
                        ),
                      },
                      {
                        title: '冲突外部 ID',
                        dataIndex: 'external_id',
                        width: 220,
                        render: (v: string) => <Text code copyable>{v}</Text>,
                      },
                      {
                        title: '冲突候选标准型号',
                        dataIndex: 'candidate_models',
                        render: (candidates: { model_id: number; standard_model: string; brand: string; category: string }[]) => (
                          <Space wrap>
                            {candidates.map((m) => (
                              <Tag key={m.model_id} color="warning">
                                {m.brand} · {m.standard_model}
                              </Tag>
                            ))}
                          </Space>
                        ),
                      },
                      {
                        title: '消歧操作',
                        width: 170,
                        render: (_, g) => (
                          <Button
                            size="small"
                            type="primary"
                            ghost
                            onClick={() =>
                              openMappingModal({
                                channel_type: g.channel_type,
                                external_id: g.external_id,
                                model_id: g.candidate_models[0]?.model_id,
                              })
                            }
                          >
                            新增店铺/次级键消歧
                          </Button>
                        ),
                      },
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: 'categories',
              label: `产品分类字典 (${categories.length})`,
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setEditingCategory(null);
                        categoryForm.resetFields();
                        setCategoryModalOpen(true);
                      }}
                    >
                      新增产品分类
                    </Button>
                  </div>
                  <Table<ProductCategory>
                    rowKey="id"
                    size="small"
                    loading={categoriesQuery.isLoading}
                    dataSource={categories}
                    pagination={false}
                    columns={[
                      { title: '业务板块', dataIndex: 'business_segment' },
                      { title: '品类', dataIndex: 'category' },
                      { title: '品牌', dataIndex: 'brand' },
                      {
                        title: '报表品牌覆盖（可选）',
                        dataIndex: 'report_brand',
                        render: (v?: string | null) => v || <Text type="secondary">同品牌</Text>,
                      },
                      {
                        title: '操作',
                        width: 110,
                        render: (_, row) => (
                          <Space size={4}>
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => {
                                setEditingCategory(row);
                                categoryForm.setFieldsValue(row);
                                setCategoryModalOpen(true);
                              }}
                            />
                            <Popconfirm
                              title="确认删除该分类？"
                              onConfirm={() => deleteCategoryMutation.mutate(row.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* Shop Create/Edit Modal */}
      <Modal
        title={editingShop ? `编辑店铺：${editingShop.shop_name}` : '新增店铺'}
        open={shopModalOpen}
        onCancel={() => setShopModalOpen(false)}
        onOk={() => shopForm.submit()}
        confirmLoading={saveShopMutation.isPending}
        width={600}
      >
        <Form form={shopForm} layout="vertical" onFinish={(v) => saveShopMutation.mutate(v)}>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="shop_name" label="店铺名称" rules={[{ required: true }]}>
                <Input placeholder="例如：华凌华晟联采专卖店" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="platform" label="所属平台" rules={[{ required: true }]}>
                <Select
                  options={(Object.keys(PLATFORM_META) as Platform[]).map((p) => ({
                    value: p,
                    label: PLATFORM_META[p].label,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="operator_type" label="运营方" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'self_operated', label: '自运营' },
                    { value: 'agency_operated', label: '代运营' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sales_mode" label="销售模式">
                <Select
                  allowClear
                  placeholder="可留空"
                  options={[
                    { value: 'dealer', label: '经销' },
                    { value: 'distribution', label: '分销' },
                    { value: 'hybrid', label: '混合' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="shop_status" label="店铺状态" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'active', label: '启用' },
                    { value: 'dormant', label: '休眠（允许历史补录）' },
                    { value: 'inactive', label: '未启用' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="entity_name" label="经营主体">
                <Input placeholder="可选" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="default_data_source" label="默认导出来源">
                <Select
                  allowClear
                  options={(Object.keys(DATA_SOURCE_META) as DataSource[]).map((d) => ({
                    value: d,
                    label: DATA_SOURCE_META[d].label,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="erp_sales_enabled" label="允许 ERP 独立入销" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="zero_received_use_paid"
                label="0 实收取已付 (3C)"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="preserve_full_product_name"
                label="保留完整品名作型号"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Shop Aliases Modal */}
      <Modal
        title={`管理店铺别名：${currentAliasShop?.shop_name ?? ''}`}
        open={Boolean(currentAliasShop)}
        onCancel={() => setAliasShop(null)}
        footer={null}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Form
            form={aliasForm}
            layout="inline"
            onFinish={(v) =>
              currentAliasShop &&
              createAliasMutation.mutate({
                shopId: currentAliasShop.id,
                alias_name: v.alias_name,
                source_hint: v.source_hint || null,
              })
            }
          >
            <Form.Item
              name="alias_name"
              rules={[{ required: true, message: '请输入别名' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="输入旧店名或导出表中的店铺名" />
            </Form.Item>
            <Form.Item name="source_hint">
              <Select
                allowClear
                placeholder="来源"
                style={{ width: 110 }}
                options={[
                  { value: '*', label: '全部' },
                  { value: 'tmall', label: '天猫' },
                  { value: 'jushuitan', label: '聚水潭' },
                  { value: 'manual', label: '手工' },
                ]}
              />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={createAliasMutation.isPending}>
                添加
              </Button>
            </Form.Item>
          </Form>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={currentAliasShop?.aliases ?? []}
            locale={{ emptyText: '暂无别名' }}
            columns={[
              { title: '别名', dataIndex: 'alias_name' },
              {
                title: '来源提示',
                dataIndex: 'source_hint',
                width: 90,
                render: (v?: string | null) => v || '*',
              },
              {
                title: '操作',
                width: 70,
                render: (_, a) => (
                  <Popconfirm
                    title="确认移除该别名？"
                    onConfirm={() => deleteAliasMutation.mutate(a.id)}
                  >
                    <Button size="small" type="link" danger>
                      移除
                    </Button>
                  </Popconfirm>
                ),
              },
            ]}
          />
        </Space>
      </Modal>

      {/* Model Create/Edit Modal */}
      <Modal
        title={editingModel ? `编辑标准型号：${editingModel.standard_model}` : '新增标准型号'}
        open={modelModalOpen}
        onCancel={() => setModelModalOpen(false)}
        onOk={() => modelForm.submit()}
        confirmLoading={saveModelMutation.isPending}
      >
        <Form form={modelForm} layout="vertical" onFinish={(v) => saveModelMutation.mutate(v)}>
          <Form.Item name="standard_model" label="标准型号" rules={[{ required: true }]}>
            <Input placeholder="例如：KFR-35GW/N8HE1Ⅱ 或 3C完整品名" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="business_segment" label="业务板块" rules={[{ required: true }]}>
                <Input placeholder="家电 / 3C" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="品类" rules={[{ required: true }]}>
                <Input placeholder="空调 / 手机" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="brand" label="品牌" rules={[{ required: true }]}>
                <Input placeholder="美的 / 华凌 / 苹果" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="is_3c_full_name" label="3C完整品名型号" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="is_active" label="启用" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Unit Component Modal */}
      <Modal
        title={
          editingComponent
            ? `编辑内外机组件`
            : `为「${componentTargetModel?.standard_model ?? ''}」新增内外机组件`
        }
        open={Boolean(componentTargetModel)}
        onCancel={() => {
          setComponentTargetModel(null);
          setEditingComponent(null);
        }}
        onOk={() => componentForm.submit()}
        confirmLoading={saveComponentMutation.isPending}
      >
        <Form
          form={componentForm}
          layout="vertical"
          onFinish={(v) => saveComponentMutation.mutate(v)}
        >
          <Form.Item name="component_model" label="内外机型号" rules={[{ required: true }]}>
            <Input placeholder="例如：KFR-35G/N8HE1Ⅱ" />
          </Form.Item>
          <Form.Item name="unit_type" label="内外机分类" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'indoor', label: '内机 (indoor)' },
                { value: 'outdoor', label: '外机 (outdoor)' },
              ]}
            />
          </Form.Item>
          <Form.Item name="mapping_value" label="映射值（可选，对应 Excel D 列）">
            <Input placeholder="如存在别名编码或括号写法可填写" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Channel Mapping Modal */}
      <Modal
        title={editingMapping ? '编辑渠道 ID 映射' : '新增渠道 ID 映射 / 消歧规则'}
        open={mappingModalOpen}
        onCancel={() => setMappingModalOpen(false)}
        onOk={() => mappingForm.submit()}
        confirmLoading={saveMappingMutation.isPending}
      >
        <Form form={mappingForm} layout="vertical" onFinish={(v) => saveMappingMutation.mutate(v)}>
          <Form.Item name="model_id" label="目标标准型号" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={(modelsQuery.data?.items ?? []).map((m) => ({
                value: m.id,
                label: `${m.brand} | ${m.standard_model}`,
              }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="channel_type" label="渠道类型" rules={[{ required: true }]}>
                <Select
                  options={(Object.keys(CHANNEL_TYPE_META) as ChannelType[]).map((c) => ({
                    value: c,
                    label: CHANNEL_TYPE_META[c].label,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="external_id" label="外部 ID" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="secondary_external_id" label="次级外部 ID / 规格（可选消歧）">
                <Input placeholder="如 jst_sku_id 或规格词" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="shop_scope_id" label="限定生效店铺（留空=全局）">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="全局生效"
                  options={(allShopsQuery.data?.items ?? []).map((s) => ({
                    value: s.id,
                    label: s.shop_name,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="is_active" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Category Modal */}
      <Modal
        title={editingCategory ? '编辑产品分类' : '新增产品分类'}
        open={categoryModalOpen}
        onCancel={() => setCategoryModalOpen(false)}
        onOk={() => categoryForm.submit()}
        confirmLoading={saveCategoryMutation.isPending}
      >
        <Form
          form={categoryForm}
          layout="vertical"
          onFinish={(v) => saveCategoryMutation.mutate(v)}
        >
          <Form.Item name="business_segment" label="业务板块" rules={[{ required: true }]}>
            <Input placeholder="家电 / 3C" />
          </Form.Item>
          <Form.Item name="category" label="品类" rules={[{ required: true }]}>
            <Input placeholder="空调 / 热水器 / 手机" />
          </Form.Item>
          <Form.Item name="brand" label="品牌" rules={[{ required: true }]}>
            <Input placeholder="海信 / 美的 / 华凌" />
          </Form.Item>
          <Form.Item name="report_brand" label="报表品牌（可选）">
            <Input placeholder="例如：海信热水器" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Shops Excel Import Result Modal */}
      <Modal
        title="店铺基础信息导入结果"
        open={Boolean(shopsImportResult)}
        onCancel={() => setShopsImportResult(null)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setShopsImportResult(null)}>
            知道了
          </Button>,
        ]}
      >
        {shopsImportResult && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="读取总行数">{shopsImportResult.total_rows}</Descriptions.Item>
              <Descriptions.Item label="新增店铺">{shopsImportResult.inserted}</Descriptions.Item>
              <Descriptions.Item label="更新店铺">{shopsImportResult.updated}</Descriptions.Item>
              <Descriptions.Item label="跳过无变更/异常">{shopsImportResult.skipped}</Descriptions.Item>
            </Descriptions>
            {shopsImportResult.warnings.length > 0 && (
              <Alert
                type="warning"
                message={`存在 ${shopsImportResult.warnings.length} 条提示`}
                description={shopsImportResult.warnings.slice(0, 8).join('\n')}
              />
            )}
          </Space>
        )}
      </Modal>

      {/* Products Excel Import Result Modal */}
      <Modal
        title="产品基础信息导入结果"
        open={Boolean(productsImportResult)}
        onCancel={() => setProductsImportResult(null)}
        width={640}
        footer={[
          productsImportResult && productsImportResult.ambiguous_conflicts.length > 0 ? (
            <Button
              key="conflicts"
              onClick={() => {
                setProductsImportResult(null);
                setActiveTab('conflicts');
              }}
            >
              查看冲突清单 ({productsImportResult.ambiguous_conflicts.length})
            </Button>
          ) : null,
          <Button key="ok" type="primary" onClick={() => setProductsImportResult(null)}>
            完成
          </Button>,
        ]}
      >
        {productsImportResult && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="产品分类">
                新增 {productsImportResult.categories.inserted} / 更新{' '}
                {productsImportResult.categories.updated}
              </Descriptions.Item>
              <Descriptions.Item label="标准型号">
                新增 {productsImportResult.models.inserted} / 更新{' '}
                {productsImportResult.models.updated}
              </Descriptions.Item>
              <Descriptions.Item label="产品内外机">
                新增 {productsImportResult.components.inserted} / 更新{' '}
                {productsImportResult.components.updated}
              </Descriptions.Item>
              <Descriptions.Item label="渠道 ID 映射">
                新增 {productsImportResult.channel_mappings.inserted} / 更新{' '}
                {productsImportResult.channel_mappings.updated}
              </Descriptions.Item>
            </Descriptions>
            {productsImportResult.ambiguous_conflicts.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`检测到 ${productsImportResult.ambiguous_conflicts.length} 组一对多渠道 ID 冲突`}
                description="已全部保留在映射表中并在冲突清单标出，导入订单遇到这些 ID 时会自动进入「待确认型号队列」。"
              />
            )}
            {productsImportResult.warnings.length > 0 && (
              <Alert
                type="info"
                message={`导入提示 (${productsImportResult.warnings.length})`}
                description={productsImportResult.warnings.slice(0, 8).join('\n')}
              />
            )}
          </Space>
        )}
      </Modal>
    </Space>
  );
}
