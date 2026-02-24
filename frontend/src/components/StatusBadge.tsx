interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
}

const statusVariants: Record<string, string> = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
};

export function StatusBadge({ status, variant = 'default' }: StatusBadgeProps) {
  return (
    <span className={`px-2 py-1 rounded text-sm ${statusVariants[variant] || statusVariants.default}`}>
      {status}
    </span>
  );
}

export function getStatusVariant(status: string): StatusBadgeProps['variant'] {
  const statusMap: Record<string, StatusBadgeProps['variant']> = {
    // PO Status
    'DRAFT': 'default',
    'SENT': 'info',
    'RECEIVED': 'success',
    'PARTIALLY_RECEIVED': 'warning',
    'CLOSED': 'purple',
    // Request Status
    'PENDING': 'warning',
    'APPROVED': 'info',
    'PARTIAL': 'warning',
    'FULFILLED': 'success',
    'REJECTED': 'danger',
    // Purchase Request Status
    'IN_PROGRESS': 'info',
    'DONE': 'success',
    // Inventory Status
    'COMPLETED': 'success',
    // Generic
    'ACTIVE': 'success',
    'INACTIVE': 'default',
  };

  return statusMap[status] || 'default';
}
