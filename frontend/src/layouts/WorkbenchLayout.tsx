import { Badge, Layout, Menu, Space, Typography } from 'antd';
import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  CheckSquareOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  SettingOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { phase1Api } from '../api/client';
import { v2Api } from '../api/v2Client';

const { Sider, Header, Content } = Layout;
const { Title, Text } = Typography;

const ROUTE_TITLES: Record<string, string> = {
  '/master-data': '基础主数据中心（店铺、产品型号与渠道映射）',
  '/import': '销售数据导入与清洗校验向导',
  '/effective-sales': '有效销售明细与来源追溯工作台',
  '/model-review': '待确认型号队列（冲突消歧与一键沉淀）',
  '/orders': '原始订单行留档查询 (Layer 1)',
  '/reports': 'Phase 1 基础汇总报表',
  '/management': '销售业务规则、模板与批次管理',
};

export function WorkbenchLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => phase1Api.health(),
    retry: false,
    refetchInterval: 30_000,
  });

  const pendingBadgeQuery = useQuery({
    queryKey: ['model-review', 'badge'],
    queryFn: () => v2Api.listPendingModels({ page: 1, page_size: 1 }),
    retry: false,
    refetchInterval: 60_000,
  });

  const pendingCount = pendingBadgeQuery.data?.total_pending_records ?? 0;

  const activeKey =
    Object.keys(ROUTE_TITLES).find((prefix) => location.pathname.startsWith(prefix)) ?? '/import';

  return (
    <Layout style={{ minHeight: '100vh', background: '#f4f6f9' }}>
      <Sider
        width={236}
        breakpoint="lg"
        collapsedWidth={64}
        style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }}
      >
        <div
          style={{
            padding: '20px 18px 16px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
          }}
        >
          <Space align="center" size={10}>
            <DatabaseOutlined style={{ fontSize: 22, color: '#38bdf8' }} />
            <div>
              <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
                SJH-DATA
              </div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>电商销售数据管理平台 V2</div>
            </div>
          </Space>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          style={{ background: '#0f172a', marginTop: 8 }}
          onClick={({ key }) => navigate(key)}
          items={[
            { key: '/master-data', icon: <AppstoreOutlined />, label: '基础主数据中心' },
            { key: '/import', icon: <CloudUploadOutlined />, label: '销售数据导入' },
            { key: '/effective-sales', icon: <CheckSquareOutlined />, label: '有效销售明细' },
            {
              key: '/model-review',
              icon: <AuditOutlined />,
              label: (
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <span>待确认型号</span>
                  {pendingCount > 0 && <Badge count={pendingCount} size="small" />}
                </Space>
              ),
            },
            { key: '/orders', icon: <TableOutlined />, label: '原始订单行 (L1)' },
            { key: '/reports', icon: <BarChartOutlined />, label: '基础汇总报表' },
            { key: '/management', icon: <SettingOutlined />, label: '规则与批次管理' },
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
          <Title level={5} style={{ margin: 0 }}>
            {ROUTE_TITLES[activeKey] ?? 'SJH-DATA'}
          </Title>
          <Space size={16}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              支持：淘宝 / 天猫 / 抖音 / 京东 / 拼多多 / 焕新生活 / 聚水潭
            </Text>
            <Badge
              status={
                healthQuery.isSuccess
                  ? 'success'
                  : healthQuery.isLoading
                    ? 'processing'
                    : 'error'
              }
              text={
                <span style={{ fontSize: 12, color: '#475569' }}>
                  {healthQuery.isSuccess
                    ? 'API 已连接'
                    : healthQuery.isLoading
                      ? '连接中...'
                      : 'API 未连接'}
                </span>
              }
            />
          </Space>
        </Header>

        <Content
          style={{
            padding: '20px 24px 40px',
            maxWidth: 1560,
            width: '100%',
            margin: '0 auto',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
