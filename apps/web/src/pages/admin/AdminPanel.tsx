import { Route, Routes } from 'react-router-dom';
import { PanelShell, type PanelLink } from '../../components/PanelShell';
import AdminDashboard from './AdminDashboard';
import AdminStores from './AdminStores';
import AdminOrders from './AdminOrders';
import AdminRiders from './AdminRiders';
import AdminAds from './AdminAds';
import AdminPlans from './AdminPlans';
import AdminCommissions from './AdminCommissions';
import AdminLogistics from './AdminLogistics';
import AdminCategories from './AdminCategories';
import AdminUsers from './AdminUsers';
import AdminAudit from './AdminAudit';
import AdminSettings from './AdminSettings';
import AdminReports from './AdminReports';
import AdminWhatsapp from './AdminWhatsapp';

const links: PanelLink[] = [
  { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/admin/comercios', label: 'Comercios', icon: '🏪' },
  { to: '/admin/pedidos', label: 'Pedidos', icon: '🧾' },
  { to: '/admin/repartidores', label: 'Repartidores', icon: '🛵' },
  { to: '/admin/publicidad', label: 'Publicidad', icon: '📣' },
  { to: '/admin/planes', label: 'Planes y pagos', icon: '💳' },
  { to: '/admin/comisiones', label: 'Comisiones', icon: '📊' },
  { to: '/admin/logistica', label: 'Logística', icon: '🚚' },
  { to: '/admin/categorias', label: 'Categorías', icon: '🗂️' },
  { to: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
  { to: '/admin/reportes', label: 'Reportes', icon: '📥' },
  { to: '/admin/whatsapp', label: 'WhatsApp', icon: '💬' },
  { to: '/admin/auditoria', label: 'Auditoría', icon: '🔍' },
  { to: '/admin/configuracion', label: 'Configuración', icon: '⚙️' },
];

export default function AdminPanel() {
  return (
    <PanelShell
      title="Panel de acoYAradas!"
      subtitle="Administración global de comercios, pedidos, publicidad e ingresos"
      links={links}
    >
      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="comercios" element={<AdminStores />} />
        <Route path="pedidos" element={<AdminOrders />} />
        <Route path="repartidores" element={<AdminRiders />} />
        <Route path="publicidad" element={<AdminAds />} />
        <Route path="planes" element={<AdminPlans />} />
        <Route path="comisiones" element={<AdminCommissions />} />
        <Route path="logistica" element={<AdminLogistics />} />
        <Route path="categorias" element={<AdminCategories />} />
        <Route path="usuarios" element={<AdminUsers />} />
        <Route path="reportes" element={<AdminReports />} />
        <Route path="whatsapp" element={<AdminWhatsapp />} />
        <Route path="auditoria" element={<AdminAudit />} />
        <Route path="configuracion" element={<AdminSettings />} />
      </Routes>
    </PanelShell>
  );
}
