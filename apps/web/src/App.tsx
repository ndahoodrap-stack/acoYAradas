import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useSession } from './lib/session';

import Home from './pages/Home';
import Stores from './pages/Stores';
import Categories from './pages/Categories';
import StoreDetail from './pages/StoreDetail';
import ProductDetail from './pages/ProductDetail';
import SearchPage from './pages/SearchPage';
import CartPage from './pages/CartPage';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import Track from './pages/Track';
import Login from './pages/Login';
import Register from './pages/Register';
import MyOrders from './pages/MyOrders';
import Legal from './pages/Legal';
import BecomeStore from './pages/BecomeStore';
import Advertising from './pages/Advertising';
import NotFound from './pages/NotFound';

const StorePanel = lazy(() => import('./pages/store/StorePanel'));
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'));
const RiderPanel = lazy(() => import('./pages/rider/RiderPanel'));

function Protected({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow: Array<'admin' | 'store_owner' | 'store_staff' | 'courier' | 'customer'>;
}) {
  const { user, loading } = useSession();
  if (loading) return <Spinner label="Verificando sesión…" />;
  if (!user) return <Navigate to="/ingresar" replace />;
  if (!allow.includes(user.role)) {
    return (
      <div className="container-app py-16">
        <div className="card mx-auto max-w-md p-8 text-center">
          <div className="text-3xl">🔒</div>
          <h2 className="mt-3 text-lg font-bold">No tenés acceso a esta zona</h2>
          <p className="mt-2 text-sm text-ink-500">
            Tu cuenta ({user.email}) no tiene permisos para ver esta sección.
          </p>
          <a href="/" className="btn-primary mt-5">
            Volver al inicio
          </a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/comercios" element={<Stores />} />
          <Route path="/comercios/:slug" element={<StoreDetail />} />
          <Route path="/categorias" element={<Categories />} />
          <Route path="/productos/:id" element={<ProductDetail />} />
          <Route path="/buscar" element={<SearchPage />} />
          <Route path="/carrito" element={<CartPage />} />
          <Route path="/finalizar-compra" element={<Checkout />} />
          <Route path="/pedido/:code" element={<OrderConfirmation />} />
          <Route path="/seguimiento" element={<Track />} />
          <Route path="/seguimiento/:code" element={<Track />} />
          <Route path="/ingresar" element={<Login />} />
          <Route path="/registrarse" element={<Register />} />
          <Route path="/mis-pedidos" element={<MyOrders />} />
          <Route path="/legal/:slug" element={<Legal />} />
          <Route path="/sumate" element={<BecomeStore />} />
          <Route path="/publicidad" element={<Advertising />} />

          <Route
            path="/comercio/*"
            element={
              <Protected allow={['store_owner', 'store_staff']}>
                <StorePanel />
              </Protected>
            }
          />
          <Route
            path="/admin/*"
            element={
              <Protected allow={['admin']}>
                <AdminPanel />
              </Protected>
            }
          />
          <Route
            path="/repartidor/*"
            element={
              <Protected allow={['courier']}>
                <RiderPanel />
              </Protected>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
