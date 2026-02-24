import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';

// Pages
import Dashboard from './pages/Dashboard';
import Requests from './pages/supervisor/Requests';
import Inventory from './pages/supervisor/Inventory';
import IncomingRequests from './pages/warehouse/IncomingRequests';
import InventoryWarehouse from './pages/warehouse/Inventory';
import PurchaseRequestsPage from './pages/procurement/PurchaseRequests';
import PurchaseOrdersPage from './pages/procurement/PurchaseOrders';
import ProductsPage from './pages/admin/Products';
import LocationsPage from './pages/admin/Locations';
import SuppliersPage from './pages/admin/Suppliers';
import StockPage from './pages/stock/Stock';
import LowStockPage from './pages/stock/LowStock';
import ReportsPage from './pages/reports/Reports';

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center">Загрузка...</div>;
  if (!user) return <div>Нет доступа</div>;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/stock/low" element={<LowStockPage />} />
        <Route path="/reports" element={<ReportsPage />} />

        {/* Supervisor */}
        <Route path="/requests" element={<Requests />} />
        <Route path="/inventory" element={<Inventory />} />

        {/* Warehouse */}
        <Route path="/warehouse/requests" element={<IncomingRequests />} />
        <Route path="/warehouse/inventory" element={<InventoryWarehouse />} />

        {/* Procurement */}
        <Route path="/procurement/purchase-requests" element={<PurchaseRequestsPage />} />
        <Route path="/procurement/orders" element={<PurchaseOrdersPage />} />

        {/* Admin */}
        <Route path="/admin/products" element={<ProductsPage />} />
        <Route path="/admin/locations" element={<LocationsPage />} />
        <Route path="/admin/suppliers" element={<SuppliersPage />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/mintstock">
      <ErrorBoundary>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
