import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfigProvider } from './components/ConfigProvider';
import { AuthProvider } from './components/AuthContext';
import { AuthModal } from './components/AuthModal';
import { Layout } from './components/Layout';
import { HomePage } from './pages/Home';
import { TopupGamePage, TopupIndexPage } from './pages/Topup';
import { GiftDetailPage, GiftIndexPage } from './pages/GiftCards';
import { OrderPage, TrackPage } from './pages/Order';
import { ContactPage } from './pages/Contact';
import { NotFoundPage, PrivacyPage, TermsPage } from './pages/Legal';
import { AdminPage } from './pages/Admin';

export function App() {
  return (
    <ConfigProvider>
      <AuthProvider>
        <BrowserRouter>
          <AuthModal />
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/topup" element={<TopupIndexPage />} />
              <Route path="/topup/:code" element={<TopupGamePage />} />
              <Route path="/gift-cards" element={<GiftIndexPage />} />
              <Route path="/gift-cards/:id" element={<GiftDetailPage />} />
              <Route path="/order/:id" element={<OrderPage />} />
              <Route path="/track" element={<TrackPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/index.html" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}
