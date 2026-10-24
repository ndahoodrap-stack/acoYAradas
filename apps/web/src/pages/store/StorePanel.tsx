import { Route, Routes } from 'react-router-dom';
import { PanelShell, type PanelLink } from '../../components/PanelShell';
import StoreOrders from './StoreOrders';
import StoreProducts from './StoreProducts';
import StoreProfile from './StoreProfile';
import StorePromotions from './StorePromotions';
import StoreFinance from './StoreFinance';
import StoreCampaigns from './StoreCampaigns';

const links: PanelLink[] = [
  { to: '/comercio', label: 'Pedidos', icon: '🧾', end: true },
  { to: '/comercio/productos', label: 'Productos', icon: '📦' },
  { to: '/comercio/promociones', label: 'Promociones', icon: '🏷️' },
  { to: '/comercio/campanas', label: 'Publicidad', icon: '📣' },
  { to: '/comercio/finanzas', label: 'Finanzas', icon: '💳' },
  { to: '/comercio/perfil', label: 'Mi perfil', icon: '🏪' },
];

export default function StorePanel() {
  return (
    <PanelShell
      title="Panel del comercio"
      subtitle="Gestioná tu catálogo, tus pedidos y tu facturación"
      links={links}
    >
      <Routes>
        <Route index element={<StoreOrders />} />
        <Route path="productos" element={<StoreProducts />} />
        <Route path="promociones" element={<StorePromotions />} />
        <Route path="campanas" element={<StoreCampaigns />} />
        <Route path="finanzas" element={<StoreFinance />} />
        <Route path="perfil" element={<StoreProfile />} />
      </Routes>
    </PanelShell>
  );
}
