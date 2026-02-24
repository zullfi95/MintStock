import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

interface Location { id: string; name: string; }
interface Product { id: string; name: string; unit: string; category: { name: string }; }
interface RequestItem { id: string; productId: string; quantity: number; issued: number; product: Product; }
interface Request {
  id: string;
  locationId: string;
  location: Location;
  status: string;
  createdAt: string;
  items: RequestItem[];
}

export default function Requests() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<Request[]>([]);
  const [myLocations, setMyLocations] = useState<Location[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [items, setItems] = useState<{productId: string; quantity: number}[]>([]);
  const [autofillData, setAutofillData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [reqRes, locRes] = await Promise.all([
        api.get('/warehouse/requests'),
        api.get('/locations/my')
      ]);
      setRequests(reqRes.data);
      setMyLocations(locRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutofill = async () => {
    if (!selectedLocation) return;
    try {
      const res = await api.get(`/warehouse/requests/${selectedLocation}/autofill`);
      setAutofillData(res.data);
      setItems(res.data.map((item: any) => ({ productId: item.productId, quantity: item.quantity })));
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to autofill');
    }
  };

  const handleSubmit = async () => {
    if (!selectedLocation || items.length === 0) {
      alert(t('requests.validationError'));
      return;
    }
    try {
      await api.post('/warehouse/requests', {
        locationId: selectedLocation,
        items
      });
      setShowModal(false);
      setSelectedLocation('');
      setItems([]);
      setAutofillData([]);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create request');
    }
  };

  if (loading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('requests.title')}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {t('requests.newRequest')}
        </button>
      </div>

      <div className="space-y-4">
        {requests.map(req => (
          <div key={req.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold">{req.location.name}</h3>
                <p className="text-sm text-gray-500">{new Date(req.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`px-3 py-1 rounded text-sm ${
                req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                req.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                req.status === 'PARTIAL' ? 'bg-orange-100 text-orange-800' :
                req.status === 'FULFILLED' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}>{req.status}</span>
            </div>
            <div className="text-sm">
              <p className="font-medium mb-1">{t('requests.itemsCount', { count: req.items.length })}</p>
              {req.items.slice(0, 3).map(item => (
                <div key={item.id} className="text-gray-600">
                  {item.product.name}: {item.issued}/{item.quantity} {item.product.unit}
                </div>
              ))}
              {req.items.length > 3 && <p className="text-gray-500">{t('requests.moreItems', { count: req.items.length - 3 })}</p>}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{t('requests.createTitle')}</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('requests.location')}</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">{t('requests.selectLocation')}</option>
                {myLocations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
              {selectedLocation && (
                <button
                  onClick={handleAutofill}
                  className="mt-2 px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  {t('requests.autofill')}
                </button>
              )}
            </div>
            {autofillData.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold mb-2">{t('requests.suggestedItems')}</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {autofillData.map((item, idx) => (
                    <div key={item.productId} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <span className="text-sm">{item.product.name}</span>
                      <span className="text-sm text-gray-600">
                        Current: {item.currentQty}, Limit: {item.limitQty}, Need: {item.quantity}
                      </span>
                      <input
                        type="number"
                        value={items[idx]?.quantity || 0}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[idx] = { productId: item.productId, quantity: parseInt(e.target.value) || 0 };
                          setItems(newItems);
                        }}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setSelectedLocation(''); setItems([]); setAutofillData([]); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {t('requests.submitRequest')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
