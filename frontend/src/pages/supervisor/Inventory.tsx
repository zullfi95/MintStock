import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

interface Location { id: string; name: string; }
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
  items: InventoryItem[];
}

export default function Inventory() {
  const { t } = useTranslation();
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [myLocations, setMyLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
  const [actualQtyMap, setActualQtyMap] = useState<{[key: string]: number}>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [invRes, locRes] = await Promise.all([
        api.get('/warehouse/inventory'),
        api.get('/locations/my')
      ]);
      setInventories(invRes.data);
      setMyLocations(locRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!selectedLocation) {
      alert(t('inventory.selectLocation'));
      return;
    }
    try {
      await api.post('/warehouse/inventory', { locationId: selectedLocation });
      setShowModal(false);
      setSelectedLocation('');
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to start inventory');
    }
  };

  const handleViewDetails = async (inv: Inventory) => {
    try {
      const res = await api.get(`/warehouse/inventory/${inv.id}`);
      setSelectedInventory(res.data);
      // Initialize actualQty map
      const qtyMap: {[key: string]: number} = {};
      res.data.items.forEach((item: InventoryItem) => {
        qtyMap[item.productId] = item.actualQty ?? item.systemQty;
      });
      setActualQtyMap(qtyMap);
    } catch (error) {
      alert('Failed to fetch inventory details');
    }
  };

  const handleUpdateActualQty = async () => {
    if (!selectedInventory) return;

    const items = Object.entries(actualQtyMap).map(([productId, actualQty]) => ({
      productId,
      actualQty
    }));

    try {
      await api.put(`/warehouse/inventory/${selectedInventory.id}/items`, { items });
      alert(t('common.success'));
      setSelectedInventory(null);
      setActualQtyMap({});
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update quantities');
    }
  };

  if (loading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('inventory.myTitle')}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {t('inventory.startInventory')}
        </button>
      </div>

      <div className="space-y-4">
        {inventories.map(inv => (
          <div key={inv.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold">{inv.location.name}</h3>
                <p className="text-sm text-gray-500">
                  {t('inventory.started', { date: new Date(inv.startedAt).toLocaleDateString(), name: inv.conductedBy })}
                </p>
                <p className="text-sm text-gray-500">{t('inventory.items', { count: inv.items.length })}</p>
              </div>
              <span className={`px-3 py-1 rounded text-sm ${
                inv.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
              }`}>{inv.status}</span>
            </div>
            {inv.status === 'IN_PROGRESS' && (
              <button
                onClick={() => handleViewDetails(inv)}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                {t('inventory.updateQty')}
              </button>
            )}
            {inv.status === 'COMPLETED' && (
              <button
                onClick={() => handleViewDetails(inv)}
                className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
              >
                {t('inventory.viewResults')}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Start Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{t('inventory.startTitle')}</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('inventory.location')}</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">{t('inventory.selectLocation')}</option>
                {myLocations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setSelectedLocation(''); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleStart}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {t('common.start')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedInventory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {t('inventory.inventoryTitle', { name: selectedInventory.location.name })}
              <span className={`ml-3 px-3 py-1 rounded text-sm ${
                selectedInventory.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
              }`}>{selectedInventory.status}</span>
            </h2>

            <div className="mb-4">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">{t('inventory.product')}</th>
                    <th className="px-4 py-2 text-left">{t('inventory.category')}</th>
                    <th className="px-4 py-2 text-left">{t('inventory.systemQty')}</th>
                    <th className="px-4 py-2 text-left">{t('inventory.actualQty')}</th>
                    {selectedInventory.status === 'COMPLETED' && (
                      <th className="px-4 py-2 text-left">{t('inventory.difference')}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedInventory.items.map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-2">{item.product.name}</td>
                      <td className="px-4 py-2">{item.product.category.name}</td>
                      <td className="px-4 py-2">{item.systemQty} {item.product.unit}</td>
                      <td className="px-4 py-2">
                        {selectedInventory.status === 'IN_PROGRESS' ? (
                          <input
                            type="number"
                            value={actualQtyMap[item.productId] || 0}
                            onChange={(e) => setActualQtyMap({
                              ...actualQtyMap,
                              [item.productId]: parseFloat(e.target.value) || 0
                            })}
                            className="w-24 px-2 py-1 border rounded"
                          />
                        ) : (
                          <span>{item.actualQty} {item.product.unit}</span>
                        )}
                      </td>
                      {selectedInventory.status === 'COMPLETED' && (
                        <td className={`px-4 py-2 font-semibold ${
                          (item.difference || 0) > 0 ? 'text-green-600' :
                          (item.difference || 0) < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {(item.difference ?? 0) > 0 ? '+' : ''}{item.difference}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setSelectedInventory(null); setActualQtyMap({}); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                {t('common.close')}
              </button>
              {selectedInventory.status === 'IN_PROGRESS' && (
                <button
                  onClick={handleUpdateActualQty}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {t('inventory.saveQty')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
