import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import {
  PrototypeSwitcher,
  type PrototypeVariantKey,
} from './components/PrototypeSwitcher';
import { VariantAWorkbench, type AppRouteKey } from './prototypes/VariantAWorkbench';
import { VariantBSplitStudio } from './prototypes/VariantBSplitStudio';
import { VariantCCommandTerminal } from './prototypes/VariantCCommandTerminal';

const queryClient = new QueryClient();

function parseVariant(raw: string | null): PrototypeVariantKey {
  if (raw === 'B' || raw === 'C') return raw;
  return 'A';
}

function PrototypeRouteShell({ route }: { route: AppRouteKey }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const variant = parseVariant(searchParams.get('variant'));

  const handleVariantChange = (next: PrototypeVariantKey) => {
    const updated = new URLSearchParams(searchParams);
    updated.set('variant', next);
    setSearchParams(updated, { replace: true });
  };

  const handleNavigate = (nextRoute: AppRouteKey) => {
    const qs = location.search;
    navigate(`/${nextRoute}${qs}`);
  };

  return (
    <>
      {variant === 'A' && <VariantAWorkbench route={route} onNavigate={handleNavigate} />}
      {variant === 'B' && <VariantBSplitStudio route={route} onNavigate={handleNavigate} />}
      {variant === 'C' && <VariantCCommandTerminal route={route} onNavigate={handleNavigate} />}
      <PrototypeSwitcher current={variant} onChange={handleVariantChange} />
    </>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/import" replace />} />
      <Route path="/import" element={<PrototypeRouteShell route="import" />} />
      <Route path="/orders" element={<PrototypeRouteShell route="orders" />} />
      <Route path="/reports" element={<PrototypeRouteShell route="reports" />} />
      <Route path="/management" element={<PrototypeRouteShell route="management" />} />
      <Route path="*" element={<Navigate to="/import" replace />} />
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
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

export default App;
