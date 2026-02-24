import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { StatusBadge } from '../../components';
import { AlertTriangle } from 'lucide-react';

interface StockItem {
  id: string;
  productId: string;
  locationId: string;
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

export default function LowStock() {
  const { t } = useTranslation();
  const [lowStock, setLowStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLowStock();
  }, []);

  const fetchLowStock = async () => {
    try {
      setLoading(true);
      const res = await api.get('/stock/low');
      setLowStock(res.data);
    } catch (error) {
      console.error('Failed to fetch low stock:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('lowStock.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('lowStock.description')}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-red-50 px-4 py-2 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <span className="text-red-800 font-semibold">{lowStock.length} {t('lowStock.items')}</span>
        </div>
      </div>

      {lowStock.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-green-800 font-medium">{t('lowStock.noItems')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('stock.location')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('stock.category')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('stock.product')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('stock.quantity')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('stock.unit')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('common.status')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {lowStock.map(item => (
                <tr key={item.id} className="bg-red-50">
                  <td className="px-6 py-4">{item.location.name}</td>
                  <td className="px-6 py-4">{item.product.category.name}</td>
                  <td className="px-6 py-4 font-medium">{item.product.name}</td>
                  <td className="px-6 py-4 font-bold text-red-600">{item.quantity}</td>
                  <td className="px-6 py-4">{item.product.unit}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={t('stock.critical')} variant="danger" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">💡 {t('lowStock.recommendations')}</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• {t('lowStock.rec1')}</li>
          <li>• {t('lowStock.rec2')}</li>
          <li>• {t('lowStock.rec3')}</li>
        </ul>
      </div>
    </div>
  );
}
