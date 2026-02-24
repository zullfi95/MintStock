import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { useAuth, canAdmin } from '../../hooks/useAuth';
import { X, Users, UserPlus } from 'lucide-react';

interface Location {
  id: string;
  name: string;
  address: string;
  type: 'WAREHOUSE' | 'SITE';
}

interface SupervisorAssignment {
  id: string;
  supervisorId: string;
  locationId: string;
  assignedAt: string;
}

interface User {
  username: string;
  role: string;
}

export default function Locations() {
  const { t } = useTranslation();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [supervisors, setSupervisors] = useState<SupervisorAssignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    type: 'SITE' as 'WAREHOUSE' | 'SITE'
  });

  const [supervisorFormData, setSupervisorFormData] = useState({
    username: ''
  });

  useEffect(() => {
    fetchLocations();
    if (user && canAdmin(user.role)) {
      fetchUsers();
    }
  }, [typeFilter]);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const params = typeFilter ? { type: typeFilter } : {};
      const res = await api.get('/locations', { params });
      setLocations(res.data);
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/auth/users');
      const supervisors = res.data.filter((u: User) => u.role === 'SUPERVISOR');
      setUsers(supervisors);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchSupervisors = async (locationId: string) => {
    try {
      const res = await api.get(`/locations/${locationId}/supervisors`);
      setSupervisors(res.data);
    } catch (error) {
      console.error('Failed to fetch supervisors:', error);
    }
  };

  const handleAssignSupervisor = async () => {
    if (!selectedLocation || !supervisorFormData.username) {
      alert('Please select a supervisor');
      return;
    }

    try {
      await api.post(`/locations/${selectedLocation.id}/supervisors`, {
        username: supervisorFormData.username
      });
      setShowSupervisorModal(false);
      setSupervisorFormData({ username: '' });
      setSelectedLocation(null);
      fetchSupervisors(selectedLocation.id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to assign supervisor');
    }
  };

  const handleUnassignSupervisor = async (supervisorId: string) => {
    if (!selectedLocation) return;

    try {
      await api.delete(`/locations/${selectedLocation.id}/supervisors/${supervisorId}`);
      fetchSupervisors(selectedLocation.id);
    } catch (error) {
      alert('Failed to unassign supervisor');
    }
  };

  const openSupervisorModal = (location: Location) => {
    setSelectedLocation(location);
    fetchSupervisors(location.id);
    setShowSupervisorModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/locations/${editing.id}`, formData);
      } else {
        await api.post('/locations', formData);
      }
      setShowModal(false);
      setEditing(null);
      setFormData({ name: '', address: '', type: 'SITE' });
      fetchLocations();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save location');
    }
  };

  if (loading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('locations.title')}</h1>
        {user && canAdmin(user.role) && (
          <button
            onClick={() => {
              setEditing(null);
              setFormData({ name: '', address: '', type: 'SITE' });
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t('locations.addLocation')}
          </button>
        )}
      </div>

      <div className="mb-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 border rounded"
        >
          <option value="">{t('locations.allTypes')}</option>
          <option value="WAREHOUSE">{t('locations.warehouse')}</option>
          <option value="SITE">{t('locations.site')}</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('locations.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('locations.address')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('locations.type')}</th>
              {user && canAdmin(user.role) && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common.actions')}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {locations.map(location => (
              <tr key={location.id}>
                <td className="px-6 py-4">{location.name}</td>
                <td className="px-6 py-4">{location.address}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-sm ${
                    location.type === 'WAREHOUSE' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {location.type}
                  </span>
                </td>
                {user && canAdmin(user.role) && (
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => {
                        setEditing(location);
                        setFormData(location);
                        setShowModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => openSupervisorModal(location)}
                      className="text-green-600 hover:text-green-900"
                    >
                      <Users className="h-4 w-4 inline" /> {t('locations.supervisors')}
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
            <h2 className="text-xl font-bold mb-4">{editing ? t('locations.editTitle') : t('locations.addTitle')}</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">{t('locations.name')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">{t('locations.address')}</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">{t('locations.type')}</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'WAREHOUSE' | 'SITE' })}
                  className="w-full px-3 py-2 border rounded"
                  required
                >
                  <option value="WAREHOUSE">{t('locations.warehouse')}</option>
                  <option value="SITE">{t('locations.site')}</option>
                </select>
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

      {/* Supervisor Management Modal */}
      {showSupervisorModal && selectedLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {t('locations.supervisors')} - {selectedLocation.name}
              </h2>
              <button onClick={() => setShowSupervisorModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Assign Supervisor */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> {t('locations.assignSupervisor')}
              </h3>
              <div className="flex gap-2">
                <select
                  value={supervisorFormData.username}
                  onChange={(e) => setSupervisorFormData({ username: e.target.value })}
                  className="flex-1 px-3 py-2 border rounded"
                >
                  <option value="">{t('locations.selectSupervisor')}</option>
                  {users.map(u => (
                    <option key={u.username} value={u.username}>{u.username}</option>
                  ))}
                </select>
                <button
                  onClick={handleAssignSupervisor}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  {t('common.assign')}
                </button>
              </div>
            </div>

            {/* Assigned Supervisors List */}
            <div>
              <h3 className="text-sm font-semibold mb-2">{t('locations.assignedSupervisors')}</h3>
              {supervisors.length === 0 ? (
                <p className="text-sm text-gray-500">{t('locations.noSupervisors')}</p>
              ) : (
                <ul className="space-y-2">
                  {supervisors.map(s => (
                    <li key={s.id} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded">
                      <div>
                        <span className="font-medium">{s.supervisorId}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {new Date(s.assignedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        onClick={() => handleUnassignSupervisor(s.supervisorId)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        {t('common.remove')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => { setShowSupervisorModal(false); setSelectedLocation(null); setSupervisors([]); }}
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
