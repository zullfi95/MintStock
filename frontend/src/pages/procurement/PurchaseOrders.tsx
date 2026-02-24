import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { useAuth, canProcurement, canManageWarehouse } from '../../hooks/useAuth';
import { X, Upload } from 'lucide-react';

interface Supplier { id: string; name: string; contact?: string; phone?: string; email?: string; }
interface Product { id: string; name: string; unit: string; }
interface POItem { id: string; productId: string; quantity: number; unitPrice: number; receivedQty: number; product: Product; }
interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier: Supplier;
  status: string;
  totalAmount: number;
  createdAt: string;
  items: POItem[];
}

export default function PurchaseOrders() {
  const { t } = useTranslation();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    supplierId: '',
    items: [{productId: '', quantity: 0, unitPrice: 0}]
  });

  const [receiveData, setReceiveData] = useState({
    items: [{productId: '', receivedQty: 0}],
    note: '',
    photo: null as File | null
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [posRes, suppliersRes, productsRes] = await Promise.all([
        api.get('/procurement/purchase-orders'),
        api.get('/suppliers'),
        api.get('/products')
      ]);
      setPos(posRes.data);
      setSuppliers(suppliersRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReceive = async () => {
    if (!selectedPO) return;
    
    const validItems = receiveData.items.filter(i => i.productId && i.receivedQty > 0);
    if (validItems.length === 0) {
      alert(t('purchaseOrders.validationError'));
      return;
    }

    try {
      const formDataToSend = new FormData();
      validItems.forEach(item => {
        formDataToSend.append('items[]', JSON.stringify(item));
      });
      if (receiveData.note) {
        formDataToSend.append('note', receiveData.note);
      }
      if (receiveData.photo) {
        formDataToSend.append('photo', receiveData.photo);
      }

      await api.post(`/procurement/purchase-orders/${selectedPO.id}/receive`, formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setShowReceiveModal(false);
      setReceiveData({ items: [{productId: '', receivedQty: 0}], note: '', photo: null });
      setSelectedPO(null);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to receive items');
    }
  };

  const handleCreate = async () => {
    const validItems = formData.items.filter(i => i.productId && i.quantity > 0 && i.unitPrice > 0);
    if (!formData.supplierId || validItems.length === 0) {
      alert(t('purchaseOrders.validationError'));
      return;
    }
    try {
      await api.post('/procurement/purchase-orders', {
        supplierId: formData.supplierId,
        items: validItems
      });
      setShowModal(false);
      setFormData({ supplierId: '', items: [{productId: '', quantity: 0, unitPrice: 0}] });
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create PO');
    }
  };

  const handleDownloadPDF = async (id: string) => {
    try {
      const res = await api.get(`/procurement/purchase-orders/${id}/pdf`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `PO-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert(t('common.error'));
    }
  };

  const handleSend = async (id: string, method: 'email' | 'telegram') => {
    try {
      await api.post(`/procurement/purchase-orders/${id}/send`, { method });
      alert(t('purchaseOrders.sentVia', { method }));
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send PO');
    }
  };

  if (loading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('purchaseOrders.title')}</h1>
        {user && canProcurement(user.role) && (
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t('purchaseOrders.createPO')}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {pos.map(po => (
          <div key={po.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold">{po.poNumber} - {po.supplier.name}</h3>
                <p className="text-sm text-gray-500">{new Date(po.createdAt).toLocaleDateString()} | Total: {po.totalAmount.toFixed(2)} ₼</p>
              </div>
              <span className={`px-3 py-1 rounded text-sm ${
                po.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                po.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
                po.status === 'RECEIVED' ? 'bg-green-100 text-green-800' :
                po.status === 'PARTIALLY_RECEIVED' ? 'bg-yellow-100 text-yellow-800' :
                po.status === 'CLOSED' ? 'bg-purple-100 text-purple-800' :
                'bg-gray-100 text-gray-800'
              }`}>{po.status}</span>
            </div>
            <div className="text-sm mb-3">
              {po.items.map(item => (
                <div key={item.id} className="text-gray-700">
                  {item.product.name}: {item.receivedQty}/{item.quantity} @ {item.unitPrice} ₼
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleDownloadPDF(po.id)}
                className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
              >
                {t('purchaseOrders.downloadPDF')}
              </button>
              {user && canProcurement(user.role) && po.status === 'DRAFT' && (
                <>
                  <button
                    onClick={() => handleSend(po.id, 'email')}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    {t('purchaseOrders.sendEmail')}
                  </button>
                  <button
                    onClick={() => handleSend(po.id, 'telegram')}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  >
                    {t('purchaseOrders.sendTelegram')}
                  </button>
                </>
              )}
              {user && canManageWarehouse(user.role) && (po.status === 'SENT' || po.status === 'RECEIVED' || po.status === 'PARTIALLY_RECEIVED') && (
                <button
                  onClick={() => {
                    setSelectedPO(po);
                    setReceiveData({
                      items: po.items.filter(i => i.receivedQty < i.quantity).map(i => ({
                        productId: i.productId,
                        receivedQty: 0
                      })),
                      note: '',
                      photo: null
                    });
                    setShowReceiveModal(true);
                  }}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  {t('purchaseOrders.receive')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{t('purchaseOrders.createTitle')}</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('purchaseOrders.supplier')}</label>
              <select
                value={formData.supplierId}
                onChange={(e) => setFormData({...formData, supplierId: e.target.value})}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">{t('purchaseOrders.selectSupplier')}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">{t('purchaseOrders.items')}</label>
              {formData.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <select
                    value={item.productId}
                    onChange={(e) => {
                      const newItems = [...formData.items];
                      newItems[idx].productId = e.target.value;
                      setFormData({...formData, items: newItems});
                    }}
                    className="flex-1 px-3 py-2 border rounded text-sm"
                  >
                    <option value="">{t('purchaseOrders.selectProduct')}</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input
                    type="number"
                    placeholder={t('purchaseOrders.qty')}
                    value={item.quantity}
                    onChange={(e) => {
                      const newItems = [...formData.items];
                      newItems[idx].quantity = parseFloat(e.target.value) || 0;
                      setFormData({...formData, items: newItems});
                    }}
                    className="w-24 px-3 py-2 border rounded text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder={t('purchaseOrders.price')}
                    value={item.unitPrice}
                    onChange={(e) => {
                      const newItems = [...formData.items];
                      newItems[idx].unitPrice = parseFloat(e.target.value) || 0;
                      setFormData({...formData, items: newItems});
                    }}
                    className="w-24 px-3 py-2 border rounded text-sm"
                  />
                  <button
                    onClick={() => setFormData({...formData, items: formData.items.filter((_, i) => i !== idx)})}
                    className="px-2 text-red-600 hover:text-red-800"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setFormData({...formData, items: [...formData.items, {productId: '', quantity: 0, unitPrice: 0}]})}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {t('purchaseOrders.addItem')}
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setFormData({supplierId: '', items: [{productId: '', quantity: 0, unitPrice: 0}]}); }}
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

      {/* Receive Modal */}
      {showReceiveModal && selectedPO && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{t('purchaseOrders.receiveTitle')} - {selectedPO.poNumber}</h2>
              <button onClick={() => setShowReceiveModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">{t('purchaseOrders.supplier')}: {selectedPO.supplier.name}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">{t('purchaseOrders.receiveItems')}</label>
              {receiveData.items.map((item, idx) => {
                const poItem = selectedPO.items.find(i => i.productId === item.productId);
                if (!poItem) return null;
                const remaining = poItem.quantity - poItem.receivedQty;
                return (
                  <div key={idx} className="flex gap-2 mb-2 items-center">
                    <span className="flex-1 text-sm font-medium">{poItem.product.name}</span>
                    <span className="text-xs text-gray-500">
                      {t('purchaseOrders.remaining')}: {remaining} {poItem.product.unit}
                    </span>
                    <input
                      type="number"
                      placeholder={t('purchaseOrders.receiveQty')}
                      value={item.receivedQty}
                      onChange={(e) => {
                        const newItems = [...receiveData.items];
                        newItems[idx].receivedQty = parseFloat(e.target.value) || 0;
                        setReceiveData({...receiveData, items: newItems});
                      }}
                      max={remaining}
                      className="w-24 px-3 py-2 border rounded text-sm"
                    />
                  </div>
                );
              })}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('purchaseOrders.note')}</label>
              <textarea
                value={receiveData.note}
                onChange={(e) => setReceiveData({...receiveData, note: e.target.value})}
                className="w-full px-3 py-2 border rounded text-sm"
                rows={2}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('purchaseOrders.photo')}</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                {receiveData.photo ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-600">{receiveData.photo.name}</span>
                    <button
                      onClick={() => setReceiveData({...receiveData, photo: null})}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <span className="text-sm text-gray-600">{t('purchaseOrders.uploadPhoto')}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setReceiveData({...receiveData, photo: e.target.files?.[0] || null})}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowReceiveModal(false); setReceiveData({ items: [{productId: '', receivedQty: 0}], note: '', photo: null }); setSelectedPO(null); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                {t('common.cancel')}
              </button>
              <button onClick={handleReceive} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                {t('purchaseOrders.receive')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
