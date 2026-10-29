import { Route, Routes } from 'react-router-dom';
import { PanelShell, type PanelLink } from '../../components/PanelShell';
import MyOrders from '../MyOrders';
import MyProfile from '../MyProfile';

const links: PanelLink[] = [
  { to: '/mis-pedidos', label: 'Mis pedidos', icon: '📦', end: true },
  { to: '/mis-pedidos/perfil', label: 'Mi perfil', icon: '👤' },
];

export default function UserPanel() {
  return (
    <PanelShell
      title="Mi cuenta"
      subtitle="Gestioná tus pedidos y tu perfil"
      links={links}
    >
      <Routes>
        <Route index element={<MyOrders />} />
        <Route path="perfil" element={<MyProfile />} />
      </Routes>
    </PanelShell>
  );
}