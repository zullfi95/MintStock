import { ReactNode, ElementType } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  Boxes,
  Inbox,
  Building2,
  ShoppingCart,
  FileText,
  Users,
  Tag,
  TrendingUp,
  Menu,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth, canWarehouse, canProcurement, isSupervisor } from '../hooks/useAuth';
import SharedHeader from 'shared-components/Header';
import i18n from '../i18n';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: ElementType;
}

function NavLink({ item }: { item: NavItem }) {
  const location = useLocation();
  const active = item.path === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(item.path);
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
        focus:outline-none focus:ring-2 focus:ring-[rgb(19,91,147)] focus:ring-offset-2
        ${active
          ? 'bg-[rgb(19,91,147)] text-white'
          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
        }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon
        className={`mr-3 flex-shrink-0 h-5 w-5 ${active ? 'text-white' : 'text-gray-400 group-hover:text-gray-500'}`}
        aria-hidden="true"
      />
      {item.label}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="pt-4 mt-4 border-t border-gray-200">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  if (!user) return null;

  const role = user.role;

  const mainItems: NavItem[] = [
    { path: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
    { path: '/reports', label: t('nav.reports'), icon: TrendingUp },
  ];

  const supervisorItems: NavItem[] = [
    { path: '/requests', label: t('nav.myRequests'), icon: ClipboardList },
    { path: '/inventory', label: t('nav.inventory'), icon: Package },
    { path: '/stock', label: t('nav.stockBalance'), icon: Boxes },
  ];

  const warehouseItems: NavItem[] = [
    { path: '/warehouse/requests', label: t('nav.incomingRequests'), icon: Inbox },
    { path: '/warehouse/inventory', label: t('nav.inventory'), icon: Package },
    { path: '/stock', label: t('nav.stockBalance'), icon: Boxes },
    { path: '/admin/locations', label: t('nav.locations'), icon: Building2 },
  ];

  const procurementItems: NavItem[] = [
    { path: '/procurement/purchase-requests', label: t('nav.purchaseRequests'), icon: ShoppingCart },
    { path: '/procurement/orders', label: t('nav.purchaseOrders'), icon: FileText },
    { path: '/admin/suppliers', label: t('nav.suppliers'), icon: Users },
    { path: '/admin/products', label: t('nav.products'), icon: Tag },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-shrink-0" aria-label="Sidebar">
        <div className="flex flex-col w-64">
          <div className="flex flex-col flex-grow bg-white border-r border-gray-200 pt-5 pb-4 overflow-y-auto">

            {/* Logo */}
            <div className="flex items-center flex-shrink-0 px-4 mb-8">
              <Link
                to="/"
                className="flex flex-col text-2xl font-bold text-[rgb(19,91,147)] hover:text-[rgb(30,120,180)] transition-colors leading-tight"
              >
                <span>MintStock</span>
                <span className="text-sm font-normal">{t('nav.sectionWarehouse')} & {t('nav.sectionProcurement')}</span>
              </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 space-y-1">
              {mainItems.map(item => <NavLink key={item.path} item={item} />)}

              {isSupervisor(role) && (
                <>
                  <SectionLabel label={t('nav.sectionWarehouse')} />
                  {supervisorItems.map(item => <NavLink key={item.path} item={item} />)}
                </>
              )}

              {canWarehouse(role) && (
                <>
                  <SectionLabel label={t('nav.sectionWarehouse')} />
                  {warehouseItems.map(item => <NavLink key={item.path} item={item} />)}
                </>
              )}

              {canProcurement(role) && (
                <>
                  <SectionLabel label={t('nav.sectionProcurement')} />
                  {procurementItems.map(item => <NavLink key={item.path} item={item} />)}
                </>
              )}
            </nav>
          </div>
        </div>
      </aside>

      {/* Right side: header + content */}
      <div className="flex flex-col flex-1 min-w-0">
        <SharedHeader
          currentProject="mintstock"
          projectName="MintStock"
          mobileMenuButton={
            <button
              className="lg:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          }
          user={user}
          logout={logout}
          showProfile={true}
          showBackButton={true}
          showLanguageSwitcher={true}
          languages={[
            { code: 'ru', label: 'Русский' },
            { code: 'az', label: 'Azərbaycan' },
            { code: 'en', label: 'English' },
          ]}
          onLanguageChange={(code: string) => {
            localStorage.setItem('language', code);
            i18n.changeLanguage(code);
          }}
          showProjectSwitcher={true}
          navigate={navigate}
          currentPath={location.pathname}
          logoutText={t('common.close') === 'Закрыть' ? 'Выйти' : 'Logout'}
        />

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
