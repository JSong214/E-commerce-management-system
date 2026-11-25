import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WorkbenchLayout } from './layouts/WorkbenchLayout';
import { ImportWizardPage } from './pages/ImportWizardPage';
import { ManagementPage } from './pages/ManagementPage';
import { OrderLinesPage } from './pages/OrderLinesPage';
import { ReportsPage } from './pages/ReportsPage';

const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<WorkbenchLayout />}>
        <Route path="/" element={<Navigate to="/import" replace />} />
        <Route path="/import" element={<ImportWizardPage />} />
        <Route path="/orders" element={<OrderLinesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/management" element={<ManagementPage />} />
        <Route path="*" element={<Navigate to="/import" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#0284c7',
          borderRadius: 6,
        },
      }}
    >
      <QueryClientProvider client={defaultQueryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

export default App;
