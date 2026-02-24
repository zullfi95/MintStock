import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { useAuth, canWarehouse } from '../../hooks/useAuth';

interface Location { id: string; name: string; type: string; }
interface Product { id: string; name: string; unit: string; category: { name: string }; }
interface InventoryItem {
  id: string;
  productId: string;
  systemQty: number;
  actualQty: number | null;
  difference: number | null;
  product: Product;
}
interface Inventory {
  id: string;
  locationId: string;
  location: Location;
  status: string;
  startedAt: string;
  conductedBy: string;
  closedAt: string | null;
  items: InventoryItem[];
}

export default function Inventory() {
  const { t } = useTranslation();
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    fetchInventories();
  }, []);

  const fetchInventories = async () => {
    try {
      const res = await api.get('/warehouse/inventory');
      setInventories(res.data);
    } catch (error) {
      console.error('Failed to fetch inventories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (inv: Inventory) => {
    try {
      const res = await api.get(`/warehouse/inventory/${inv.id}`);
      setSelectedInventory(res.data);
    } catch (error) {
      alert('Failed to fetch inventory details');
    }
  };

  const handleClose = async () => {
    if (!selectedInventory) return;

    // Check if all items have actualQty
    const missingActual = selectedInventory.items.filter(item => item.actualQty === null);
    if (missingActual.length > 0) {
      alert(t('inventory.missingActual', { count: missingActual.length }));
      return;
    }

    if (!confirm(t('inventory.confirmClose'))) {
      return;
    }

    try {
      await api.post(`/warehouse/inventory/${selectedInventory.id}/close`);
      alert('Inventory closed successfully');
      setSelectedInventory(null);
      fetchInventories();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to close inventory');
    }
  };

  if (loading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('inventory.allTitle')}</h1>
      </div>

      <div className="space-y-4">
        {inventories.map(inv => {
          const completedItems = inv.items.filter(i => i.actualQty !== null).length;
          const totalItems = inv.items.length;

          return (
            <div key={inv.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold">{inv.location.name}</h3>
                  <p className="text-sm text-gray-500">
                    {t('inventory.started', { date: new Date(inv.startedAt).toLocaleDateString(), name: inv.conductedBy })}
                  </p>
                  {inv.closedAt && (
                    <p className="text-sm text-gray-500">
                      Closed: {new Date(inv.closedAt).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">
                    {t('inventory.progress', { done: completedItems, total: totalItems })}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded text-sm ${
                  inv.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                }`}>{inv.status}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleViewDetails(inv)}
                  className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                >
                  {t('inventory.viewDetails')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Details Modal */}
      {selectedInventory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {t('inventory.inventoryTitle', { name: selectedInventory.location.name })}
              <span className={`ml-3 px-3 py-1 rounded text-sm ${
                selectedInventory.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
              }`}>{selectedInventory.status}</span>
            </h2>

            <div className="mb-4 p-3 bg-gray-50 rounded">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">{t('inventory.startedBy')}</span> {selectedInventory.conductedBy}
                  <br />
                  <span className="font-medium">{t('inventory.startedAt')}</span> {new Date(selectedInventory.startedAt).toLocaleString()}
                </div>
                {selectedInventory.closedAt && (
                  <div>
                    <span className="font-medium">{t('inventory.closedAt')}</span> {new Date(selectedInventory.closedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">{t('inventory.product')}</th>
                    <th className="px-4 py-2 text-left">{t('inventory.category')}</th>
                    <th className="px-4 py-2 text-right">{t('inventory.systemQty')}</th>
                    <th className="px-4 py-2 text-right">{t('inventory.actualQty')}</th>
                    <th className="px-4 py-2 text-right">{t('inventory.difference')}</th>
                    <th className="px-4 py-2 text-left">{t('inventory.unit')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedInventory.items.map(item => {
                    const diff = item.actualQty !== null ? item.actualQty - item.systemQty : null;

                    return (
                      <tr key={item.id} className={item.actualQty === null ? 'bg-yellow-50' : ''}>
                        <td className="px-4 py-2">{item.product.name}</td>
                        <td className="px-4 py-2">{item.product.category.name}</td>
                        <td className="px-4 py-2 text-right">{item.systemQty}</td>
                        <td className="px-4 py-2 text-right">
                          {item.actualQty !== null ? item.actualQty : (
                            <span className="text-yellow-600 font-medium">{t('inventory.pending')}</span>
                          )}
                        </td>
                        <td className={`px-4 py-2 text-right font-semibold ${
                          diff === null ? 'text-gray-400' :
                          diff > 0 ? 'text-green-600' :
                          diff < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {diff !== null ? (
                            <>{diff > 0 ? '+' : ''}{diff}</>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-2">{item.product.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedInventory.status === 'COMPLETED' && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <h3 className="font-semibold text-blue-900 mb-2">{t('inventory.summary')}</h3>
                <div className="text-sm text-blue-800">
                  <p>{t('inventory.totalItems')} {selectedInventory.items.length}</p>
                  <p>{t('inventory.surplusItems')} {selectedInventory.items.filter(i => (i.difference || 0) > 0).length}</p>
                  <p>{t('inventory.shortageItems')} {selectedInventory.items.filter(i => (i.difference || 0) < 0).length}</p>
                  <p>{t('inventory.matchingItems')} {selectedInventory.items.filter(i => i.difference === 0).length}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSelectedInventory(null)}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                {t('common.close')}
              </button>
              {user && canWarehouse(user.role) && selectedInventory.status === 'IN_PROGRESS' && (
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  {t('inventory.closeInventory')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
