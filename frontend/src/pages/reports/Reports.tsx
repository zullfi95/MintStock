import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { Calendar } from 'lucide-react';

export default function Reports() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  const handleExport = async (reportType: string) => {
    setSelectedReport(reportType);
    setShowDateModal(true);
  };

  const handleExportConfirm = async () => {
    if (!selectedReport) return;

    try {
      setLoading(true);
      const params: any = {};
      if (dateRange.startDate) params.startDate = dateRange.startDate;
      if (dateRange.endDate) params.endDate = dateRange.endDate;

      const res = await api.get(`/reports/${selectedReport}/export`, {
        params,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedReport}-report-${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setShowDateModal(false);
      setDateRange({ startDate: '', endDate: '' });
    } catch (error) {
      alert(t('reports.exportFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">{t('reports.title')}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-3 text-blue-600">📊 {t('reports.stockReport')}</h2>
          <p className="text-sm text-gray-600 mb-4">{t('reports.stockDesc')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('stock')}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {t('reports.exportExcel')}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-3 text-orange-600">📉 {t('reports.consumptionReport')}</h2>
          <p className="text-sm text-gray-600 mb-4">{t('reports.consumptionDesc')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('consumption')}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {t('reports.exportExcel')}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-3 text-purple-600">💰 {t('reports.purchasesReport')}</h2>
          <p className="text-sm text-gray-600 mb-4">{t('reports.purchasesDesc')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('purchases')}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {t('reports.exportExcel')}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-3 text-indigo-600">📋 {t('reports.requestsHistory')}</h2>
          <p className="text-sm text-gray-600 mb-4">{t('reports.requestsDesc')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => window.open('/mintstock/warehouse/requests', '_self')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t('reports.viewRequests')}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">💡 {t('reports.tips')}</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• {t('reports.tip1')}</li>
          <li>• {t('reports.tip2')}</li>
          <li>• {t('reports.tip3')}</li>
          <li>• {t('reports.tip4')}</li>
        </ul>
      </div>

      {/* Date Range Modal */}
      {showDateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Calendar className="h-6 w-6" />
                {t('reports.selectDateRange')}
              </h2>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('reports.startDate')}</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-1">{t('reports.endDate')}</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <p className="text-sm text-gray-500 mb-4">
              {t('reports.dateRangeHint')}
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowDateModal(false); setDateRange({ startDate: '', endDate: '' }); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleExportConfirm}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {t('reports.exportExcel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
