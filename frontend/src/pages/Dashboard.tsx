import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { useAuth, canAdmin, canManageWarehouse, canManageProcurement } from '../hooks/useAuth';

interface DashboardStats {
  activeRequests: number;
  lowStock: number;
  activePOs: number;
  pendingPRs: number;
  myRequests: number;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats>({
    activeRequests: 0,
    lowStock: 0,
    activePOs: 0,
    pendingPRs: 0,
    myRequests: 0
  });
  const { user } = useAuth();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const role = user?.role;
      let requestsPromise, stockPromise, posPromise, prsPromise, myRequestsPromise;

      // Role-based data fetching
      if (role === 'SUPERVISOR') {
        // Supervisor sees their own requests
        requestsPromise = api.get('/supervisor/requests?status=PENDING').catch(() => ({ data: [] }));
        myRequestsPromise = api.get('/supervisor/requests').catch(() => ({ data: [] }));
        stockPromise = Promise.resolve({ data: [] });
        posPromise = Promise.resolve({ data: [] });
        prsPromise = Promise.resolve({ data: [] });
      } else if (canManageWarehouse(role!)) {
        // Warehouse sees pending requests from supervisors
        requestsPromise = api.get('/warehouse/requests?status=PENDING').catch(() => ({ data: [] }));
        myRequestsPromise = Promise.resolve({ data: [] });
        stockPromise = api.get('/stock/low').catch(() => ({ data: [] }));
        posPromise = Promise.resolve({ data: [] });
        prsPromise = api.get('/procurement/purchase-requests?status=PENDING').catch(() => ({ data: [] }));
      } else if (canManageProcurement(role!)) {
        // Procurement sees pending purchase requests
        requestsPromise = Promise.resolve({ data: [] });
        myRequestsPromise = Promise.resolve({ data: [] });
        stockPromise = Promise.resolve({ data: [] });
        posPromise = api.get('/procurement/purchase-orders?status=SENT').catch(() => ({ data: [] }));
        prsPromise = api.get('/procurement/purchase-requests?status=PENDING').catch(() => ({ data: [] }));
      } else if (canAdmin(role!)) {
        // Admin sees everything
        requestsPromise = api.get('/warehouse/requests?status=PENDING').catch(() => ({ data: [] }));
        myRequestsPromise = Promise.resolve({ data: [] });
        stockPromise = api.get('/stock/low').catch(() => ({ data: [] }));
        posPromise = api.get('/procurement/purchase-orders?status=SENT').catch(() => ({ data: [] }));
        prsPromise = api.get('/procurement/purchase-requests?status=PENDING').catch(() => ({ data: [] }));
      } else {
        requestsPromise = Promise.resolve({ data: [] });
        myRequestsPromise = Promise.resolve({ data: [] });
        stockPromise = Promise.resolve({ data: [] });
        posPromise = Promise.resolve({ data: [] });
        prsPromise = Promise.resolve({ data: [] });
      }

      const [requests, stock, pos, prs, myRequests] = await Promise.all([
        requestsPromise,
        stockPromise,
        posPromise,
        prsPromise,
        myRequestsPromise
      ]);

      setStats({
        activeRequests: requests.data.length,
        lowStock: stock.data.length,
        activePOs: pos.data.length,
        pendingPRs: prs.data.length,
        myRequests: myRequests.data.length
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  // Role-based widgets configuration
  const getWidgetsForRole = () => {
    const role = user?.role;

    if (role === 'SUPERVISOR') {
      return [
        { title: t('dashboard.myRequests'), value: stats.myRequests, color: 'blue', sub: t('dashboard.totalRequests') },
        { title: t('dashboard.pendingRequests'), value: stats.activeRequests, color: 'yellow', sub: t('dashboard.awaitingFulfillment') },
      ];
    } else if (canManageWarehouse(role!)) {
      return [
        { title: t('dashboard.activeRequests'), value: stats.activeRequests, color: 'blue', sub: t('dashboard.pendingApproval') },
        { title: t('dashboard.lowStockItems'), value: stats.lowStock, color: 'red', sub: t('dashboard.warehouseItems') },
        { title: t('dashboard.purchaseRequests'), value: stats.pendingPRs, color: 'yellow', sub: t('dashboard.pendingReview') },
      ];
    } else if (canManageProcurement(role!)) {
      return [
        { title: t('dashboard.purchaseRequests'), value: stats.pendingPRs, color: 'yellow', sub: t('dashboard.pendingReview') },
        { title: t('dashboard.activePOs'), value: stats.activePOs, color: 'green', sub: t('dashboard.inProcess') },
      ];
    } else if (canAdmin(role!)) {
      return [
        { title: t('dashboard.activeRequests'), value: stats.activeRequests, color: 'blue', sub: t('dashboard.pendingApproval') },
        { title: t('dashboard.lowStockItems'), value: stats.lowStock, color: 'red', sub: t('dashboard.warehouseItems') },
        { title: t('dashboard.activePOs'), value: stats.activePOs, color: 'green', sub: t('dashboard.inProcess') },
        { title: t('dashboard.purchaseRequests'), value: stats.pendingPRs, color: 'yellow', sub: t('dashboard.pendingReview') },
      ];
    }
    return [];
  };

  const getQuickLinksForRole = () => {
    const role = user?.role;

    if (role === 'SUPERVISOR') {
      return [
        { icon: '📋', label: t('dashboard.myRequestsLink'), href: '/mintstock/requests' },
        { icon: '📊', label: t('dashboard.inventoryLink'), href: '/mintstock/inventory' },
        { icon: '📈', label: t('dashboard.reportsLink'), href: '/mintstock/reports' },
      ];
    } else if (canManageWarehouse(role!)) {
      return [
        { icon: '📋', label: t('dashboard.requestsLink'), href: '/mintstock/warehouse/requests' },
        { icon: '📊', label: t('dashboard.inventoryLink'), href: '/mintstock/warehouse/inventory' },
        { icon: '📦', label: t('dashboard.productsLink'), href: '/mintstock/admin/products' },
        { icon: '📈', label: t('dashboard.reportsLink'), href: '/mintstock/reports' },
      ];
    } else if (canManageProcurement(role!)) {
      return [
        { icon: '🛒', label: t('dashboard.purchaseRequestsLink'), href: '/mintstock/procurement/purchase-requests' },
        { icon: '📦', label: t('dashboard.purchaseOrdersLink'), href: '/mintstock/procurement/orders' },
        { icon: '🚚', label: t('dashboard.suppliersLink'), href: '/mintstock/admin/suppliers' },
        { icon: '📈', label: t('dashboard.reportsLink'), href: '/mintstock/reports' },
      ];
    } else if (canAdmin(role!)) {
      return [
        { icon: '📦', label: t('dashboard.productsLink'), href: '/mintstock/admin/products' },
        { icon: '📍', label: t('dashboard.locationsLink'), href: '/mintstock/admin/locations' },
        { icon: '🚚', label: t('dashboard.suppliersLink'), href: '/mintstock/admin/suppliers' },
        { icon: '📊', label: t('dashboard.stockLink'), href: '/mintstock/stock' },
        { icon: '📈', label: t('dashboard.reportsLink'), href: '/mintstock/reports' },
      ];
    }
    return [];
  };

  const widgets = getWidgetsForRole();
  const quickLinks = getQuickLinksForRole();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">{t('dashboard.title', { name: user?.username })}</h1>
      
      {widgets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {widgets.map((widget, index) => (
            <div key={index} className="bg-white p-6 rounded-lg shadow">
              <h2 className={`text-lg font-semibold mb-2 text-${widget.color}-600`}>{widget.title}</h2>
              <p className="text-4xl font-bold">{widget.value}</p>
              <p className="text-sm text-gray-500 mt-1">{widget.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">{t('dashboard.quickLinks')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickLinks.map((link, index) => (
            <a
              key={index}
              href={link.href}
              className="p-4 border rounded hover:bg-gray-50 text-center"
            >
              <div className="text-2xl mb-2">{link.icon}</div>
              <div className="text-sm font-medium">{link.label}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
