import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { useAuth, canAdmin } from '../../hooks/useAuth';
import { X, Tag } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string | null;
  isActive: boolean;
}

interface Product {
  id: string;
  name: string;
  unit: string;
}

interface SupplierPrice {
  id: string;
  supplierId: string;
  productId: string;
  price: number;
  product: Product;
}

export default function Suppliers() {
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<SupplierPrice[]>([]);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: ''
  });

  const [priceFormData, setPriceFormData] = useState({
    productId: '',
    price: ''
  });

  useEffect(() => {
    if (user?.role !== 'SUPERVISOR') {
      fetchSuppliers();
      fetchProducts();
    }
  }, [user]);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/suppliers');
      setSuppliers(res.data);
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      setProducts(res.data);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    }
  };

  const fetchPrices = async (supplierId: string) => {
    try {
      const res = await api.get(`/suppliers/${supplierId}/prices`);
      setPrices(res.data);
    } catch (error) {
      console.error('Failed to fetch prices:', error);
    }
  };

  const handleSetPrice = async () => {
    if (!selectedSupplier || !priceFormData.productId || !priceFormData.price) {
      alert('Please fill all fields');
      return;
    }

    try {
      await api.post(`/suppliers/${selectedSupplier.id}/prices`, {
        productId: priceFormData.productId,
        price: parseFloat(priceFormData.price)
      });
      setPriceFormData({ productId: '', price: '' });
      fetchPrices(selectedSupplier.id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to set price');
    }
  };

  const openPriceModal = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    fetchPrices(supplier.id);
    setShowPriceModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/suppliers/${editing.id}`, formData);
      } else {
        await api.post('/suppliers', formData);
      }
      setShowModal(false);
      setEditing(null);
      setFormData({ name: '', contactPerson: '', phone: '', email: '' });
      fetchSuppliers();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save supplier');
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.patch(`/suppliers/${id}/toggle`);
      fetchSuppliers();
    } catch (error) {
      alert('Failed to toggle supplier status');
    }
  };

  if (user?.role === 'SUPERVISOR') {
    return <div className="p-6">{t('common.accessDenied')}</div>;
  }

  if (loading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('suppliers.title')}</h1>
        {user && (canAdmin(user.role) || user.role === 'OPERATIONS_MANAGER') && (
          <button
            onClick={() => {
              setEditing(null);
              setFormData({ name: '', contactPerson: '', phone: '', email: '' });
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t('suppliers.addSupplier')}
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('suppliers.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('suppliers.contactPerson')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('suppliers.phone')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('suppliers.email')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common.status')}</th>
              {user && (canAdmin(user.role) || user.role === 'OPERATIONS_MANAGER') && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common.actions')}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {suppliers.map(supplier => (
              <tr key={supplier.id}>
                <td className="px-6 py-4">{supplier.name}</td>
                <td className="px-6 py-4">{supplier.contactPerson}</td>
                <td className="px-6 py-4">{supplier.phone}</td>
                <td className="px-6 py-4">{supplier.email || '-'}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-sm ${
                    supplier.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {supplier.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </td>
                {user && (canAdmin(user.role) || user.role === 'OPERATIONS_MANAGER') && (
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => {
                        setEditing(supplier);
                        setFormData({
                          name: supplier.name,
                          contactPerson: supplier.contactPerson,
                          phone: supplier.phone,
                          email: supplier.email || ''
                        });
                        setShowModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => openPriceModal(supplier)}
                      className="text-green-600 hover:text-green-900 mr-3"
                    >
                      <Tag className="h-4 w-4 inline" /> {t('suppliers.prices')}
                    </button>
                    <button
                      onClick={() => handleToggle(supplier.id)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      {t('common.toggle')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editing ? t('suppliers.editTitle') : t('suppliers.addTitle')}</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">{t('suppliers.name')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">{t('suppliers.contactPerson')}</label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">{t('suppliers.phone')}</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">{t('suppliers.emailOptional')}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditing(null); }}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Price Management Modal */}
      {showPriceModal && selectedSupplier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {t('suppliers.prices')} - {selectedSupplier.name}
              </h2>
              <button onClick={() => setShowPriceModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Set Price */}
            <div className="mb-6 bg-gray-50 p-4 rounded">
              <h3 className="text-sm font-semibold mb-2">{t('suppliers.setPrice')}</h3>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={priceFormData.productId}
                  onChange={(e) => setPriceFormData({ ...priceFormData, productId: e.target.value })}
                  className="px-3 py-2 border rounded col-span-2"
                >
                  <option value="">{t('suppliers.selectProduct')}</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder={t('suppliers.price')}
                  value={priceFormData.price}
                  onChange={(e) => setPriceFormData({ ...priceFormData, price: e.target.value })}
                  className="px-3 py-2 border rounded"
                />
              </div>
              <button
                onClick={handleSetPrice}
                className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                {t('suppliers.setPrice')}
              </button>
            </div>

            {/* Prices List */}
            <div>
              <h3 className="text-sm font-semibold mb-2">{t('suppliers.currentPrices')}</h3>
              {prices.length === 0 ? (
                <p className="text-sm text-gray-500">{t('suppliers.noPrices')}</p>
              ) : (
                <ul className="space-y-2">
                  {prices.map(p => (
                    <li key={p.id} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded">
                      <span className="font-medium">{p.product.name}</span>
                      <span className="text-green-600 font-semibold">{p.price.toFixed(2)} ₼</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => { setShowPriceModal(false); setSelectedSupplier(null); setPrices([]); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
