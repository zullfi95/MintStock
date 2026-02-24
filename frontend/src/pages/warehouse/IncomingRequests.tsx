import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

interface Product { id: string; name: string; unit: string; }
interface RequestItem { id: string; productId: string; quantity: number; issued: number; product: Product; }
interface Request {
  id: string;
  locationId: string;
  location: { name: string };
  status: string;
  createdBy: string;
  createdAt: string;
  items: RequestItem[];
}

export default function IncomingRequests() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [issueItems, setIssueItems] = useState<{productId: string; quantity: number}[]>([]);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const res = await api.get('/warehouse/requests');
      setRequests(res.data);
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api.patch(`/warehouse/requests/${id}/status`, { status });
      fetchRequests();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update status');
    }
  };

  const handleIssue = async () => {
    if (!selectedRequest) return;
    try {
      await api.post('/warehouse/issue', {
        requestId: selectedRequest.id,
        items: issueItems.filter(i => i.quantity > 0)
      });
      setSelectedRequest(null);
      setIssueItems([]);
      fetchRequests();
      alert(t('incomingRequests.issuedSuccess'));
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to issue items');
    }
  };

  if (loading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">{t('incomingRequests.title')}</h1>

      <div className="space-y-4">
        {requests.map(req => (
          <div key={req.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold">{req.location.name}</h3>
                <p className="text-sm text-gray-500">By: {req.createdBy} | {new Date(req.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`px-3 py-1 rounded text-sm ${
                req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                req.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                req.status === 'PARTIAL' ? 'bg-orange-100 text-orange-800' :
                req.status === 'FULFILLED' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}>{req.status}</span>
            </div>
            <div className="mb-3">
              {req.items.map(item => (
                <div key={item.id} className="text-sm text-gray-700">
                  {item.product.name}: {item.issued}/{item.quantity} {item.product.unit}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {req.status === 'PENDING' && (
                <>
                  <button
                    onClick={() => handleStatusChange(req.id, 'APPROVED')}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  >
                    {t('incomingRequests.approve')}
                  </button>
                  <button
                    onClick={() => handleStatusChange(req.id, 'REJECTED')}
                    className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                  >
                    {t('incomingRequests.reject')}
                  </button>
                </>
              )}
              {(req.status === 'APPROVED' || req.status === 'PARTIAL') && (
                <button
                  onClick={() => {
                    setSelectedRequest(req);
                    setIssueItems(req.items.map(i => ({ productId: i.productId, quantity: i.quantity - i.issued })));
                  }}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  {t('incomingRequests.issueItems')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{t('incomingRequests.issueTitle')}</h2>
            <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
              {selectedRequest.items.map((item, idx) => (
                <div key={item.id} className="flex justify-between items-center">
                  <span className="text-sm">{item.product.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{t('incomingRequests.remaining', { count: item.quantity - item.issued })}</span>
                    <input
                      type="number"
                      value={issueItems[idx]?.quantity || 0}
                      onChange={(e) => {
                        const newItems = [...issueItems];
                        newItems[idx] = { productId: item.productId, quantity: parseInt(e.target.value) || 0 };
                        setIssueItems(newItems);
                      }}
                      className="w-20 px-2 py-1 border rounded text-sm"
                      max={item.quantity - item.issued}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setSelectedRequest(null); setIssueItems([]); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleIssue}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {t('incomingRequests.issue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
