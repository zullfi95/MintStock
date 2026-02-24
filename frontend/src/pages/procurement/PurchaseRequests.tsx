import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { useAuth, canWarehouse, canProcurement } from '../../hooks/useAuth';

interface Product { id: string; name: string; unit: string; }
interface PRItem { id: string; productId: string; quantity: number; product: Product; }
interface PurchaseRequest {
  id: string;
  status: string;
  createdBy: string;
  createdAt: string;
  items: PRItem[];
}

export default function PurchaseRequests() {
  const { t } = useTranslation();
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [items, setItems] = useState<{productId: string; quantity: number}[]>([{productId: '', quantity: 0}]);
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [prsRes, prodsRes] = await Promise.all([
        api.get('/procurement/purchase-requests'),
        api.get('/products')
      ]);
      setPrs(prsRes.data);
      setProducts(prodsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const validItems = items.filter(i => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      alert(t('purchaseRequests.validationError'));
      return;
    }
    try {
      await api.post('/procurement/purchase-requests', { items: validItems });
      setShowModal(false);
      setItems([{productId: '', quantity: 0}]);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create purchase request');
    }
  };

  const handleStatusChange = async (id: string, status: 'IN_PROGRESS' | 'DONE') => {
    try {
      await api.patch(`/procurement/purchase-requests/${id}/status`, { status });
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update status');
    }
  };

  if (loading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('purchaseRequests.title')}</h1>
        {user && canWarehouse(user.role) && (
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t('purchaseRequests.createRequest')}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {prs.map(pr => (
          <div key={pr.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-sm text-gray-500">By: {pr.createdBy} | {new Date(pr.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`px-3 py-1 rounded text-sm ${
                pr.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                pr.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                pr.status === 'DONE' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }`}>{pr.status}</span>
            </div>
            <div className="text-sm mb-2">
              {pr.items.map(item => (
                <div key={item.id} className="text-gray-700">
                  {item.product.name}: {item.quantity} {item.product.unit}
                </div>
              ))}
            </div>
            {user && canProcurement(user.role) && pr.status === 'PENDING' && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleStatusChange(pr.id, 'IN_PROGRESS')}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  {t('purchaseRequests.startWork')}
                </button>
                <button
                  onClick={() => handleStatusChange(pr.id, 'DONE')}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  {t('purchaseRequests.markDone')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{t('purchaseRequests.createTitle')}</h2>
            <div className="space-y-3 mb-4">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    value={item.productId}
                    onChange={(e) => {
                      const newItems = [...items];
                      newItems[idx].productId = e.target.value;
                      setItems(newItems);
                    }}
                    className="flex-1 px-3 py-2 border rounded text-sm"
                  >
                    <option value="">{t('purchaseRequests.selectProduct')}</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => {
                      const newItems = [...items];
                      newItems[idx].quantity = parseInt(e.target.value) || 0;
                      setItems(newItems);
                    }}
                    className="w-24 px-3 py-2 border rounded text-sm"
                    placeholder="Qty"
                  />
                  <button
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="px-2 text-red-600 hover:text-red-800"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setItems([...items, {productId: '', quantity: 0}])}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {t('purchaseRequests.addItem')}
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setItems([{productId: '', quantity: 0}]); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                {t('common.cancel')}
              </button>
              <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
