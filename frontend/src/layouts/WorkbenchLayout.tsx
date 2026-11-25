import { Badge, Layout, Menu, Space, Typography } from 'antd';
import {
  BarChartOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  SettingOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { phase1Api } from '../api/client';

const { Sider, Header, Content } = Layout;
const { Title, Text } = Typography;

const ROUTE_TITLES: Record<string, string> = {
  '/import': '数据导入与清洗校验向导',
  '/orders': '标准化销售明细查询与导出',
  '/reports': '多维汇总报表与导出',
  '/management': '导入批次、映射模板与店铺管理',
};

/**
 * Production Layout Shell — Variant A (极简工作台 / Classic Left-Rail Workbench).
 */
export function WorkbenchLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => phase1Api.health(),
    retry: false,
    refetchInterval: 30_000,
  });

  const activeKey =
    Object.keys(ROUTE_TITLES).find((prefix) => location.pathname.startsWith(prefix)) ?? '/import';

  return (
    <Layout style={{ minHeight: '100vh', background: '#f4f6f9' }}>
      <Sider
        width={228}
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
              <div style={{ color: '#94a3b8', fontSize: 11 }}>电商销售数据管理平台</div>
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
            { key: '/import', icon: <CloudUploadOutlined />, label: '数据导入向导' },
            { key: '/orders', icon: <TableOutlined />, label: '明细查询与导出' },
            { key: '/reports', icon: <BarChartOutlined />, label: '汇总报表导出' },
            { key: '/management', icon: <SettingOutlined />, label: '批次与配置管理' },
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
              支持：淘宝 / 天猫 / 抖音 / 京东 / 拼多多 / 聚水潭
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
            maxWidth: 1520,
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
