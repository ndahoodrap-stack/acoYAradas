import { Route, Routes } from 'react-router-dom';
import { PanelShell, type PanelLink } from '../../components/PanelShell';
import RiderOrders from './RiderOrders';
import RiderHistory from './RiderHistory';
import RiderProfile from './RiderProfile';

const links: PanelLink[] = [
  { to: '/repartidor', label: 'Mis entregas', icon: '🛵', end: true },
  { to: '/repartidor/historial', label: 'Historial', icon: '🗂️' },
  { to: '/repartidor/perfil', label: 'Mi perfil', icon: '👤' },
];

export default function RiderPanel() {
  return (
    <PanelShell
      title="Panel del repartidor"
      subtitle="Tus pedidos asignados y el seguimiento de cada entrega"
      links={links}
    >
      <Routes>
        <Route index element={<RiderOrders />} />
        <Route path="historial" element={<RiderHistory />} />
        <Route path="perfil" element={<RiderProfile />} />
      </Routes>
    </PanelShell>
  );
}
