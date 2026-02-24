import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

interface Location {
  id: string;
  name: string;
  type: string;
}

interface StockItem {
  id: string;
  locationId: string;
  productId: string;
  quantity: number;
  limitQty: number | null;
  location: { id: string; name: string; type: string };
  product: {
    id: string;
    name: string;
    unit: string;
    category: { name: string };
  };
}

export default function Stock() {
  const { t } = useTranslation();
  const [stock, setStock] = useState<StockItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLocations();
    fetchStock();
  }, []);

  useEffect(() => {
    fetchStock();
  }, [selectedLocation]);

  const fetchLocations = async () => {
    try {
      const res = await api.get('/locations');
      setLocations(res.data);
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    }
  };

  const fetchStock = async () => {
    try {
      setLoading(true);
      const params = selectedLocation ? { locationId: selectedLocation } : {};
      const res = await api.get('/stock', { params });
      setStock(res.data);
    } catch (error) {
      console.error('Failed to fetch stock:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('stock.title')}</h1>
      </div>

      <div className="mb-4">
        <select
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          className="px-4 py-2 border rounded"
        >
          <option value="">{t('stock.allLocations')}</option>
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('stock.location')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('stock.category')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('stock.product')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('stock.quantity')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('stock.unit')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('stock.limit')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {stock.map(item => {
              const isLow = item.limitQty && item.quantity < item.limitQty * 0.3;
              const isCritical = item.quantity <= 0;

              return (
                <tr key={item.id} className={isCritical ? 'bg-red-50' : isLow ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4">{item.location.name}</td>
                  <td className="px-6 py-4">{item.product.category.name}</td>
                  <td className="px-6 py-4">{item.product.name}</td>
                  <td className="px-6 py-4 font-semibold">{item.quantity}</td>
                  <td className="px-6 py-4">{item.product.unit}</td>
                  <td className="px-6 py-4">{item.limitQty || '-'}</td>
                  <td className="px-6 py-4">
                    {isCritical ? (
                      <span className="px-2 py-1 rounded text-sm bg-red-100 text-red-800">{t('stock.critical')}</span>
                    ) : isLow ? (
                      <span className="px-2 py-1 rounded text-sm bg-yellow-100 text-yellow-800">{t('stock.low')}</span>
                    ) : (
                      <span className="px-2 py-1 rounded text-sm bg-green-100 text-green-800">{t('stock.ok')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
