import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import Layout from './components/Layout';
import ReloadPrompt from './components/ReloadPrompt';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import MaterialList from './pages/MaterialList';
import PlaceholderPage from './pages/Placeholders';
import SiteList from './pages/SiteList'; // Changed from SitesList to SiteList
import SiteDetails from './pages/SiteDetails';
import Journal from './pages/Journal';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import HiltiPage from './pages/HiltiPage'; // Added HiltiPage

const ProtectedRoute = ({ children }) => {
  const { currentUser } = useAppContext();
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (currentUser.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }
  return children;
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-white">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Une erreur est survenue</h1>
          <pre className="bg-slate-900 p-4 rounded text-sm overflow-auto">
            {this.state.error && this.state.error.toString()}
          </pre>
          <button
            onClick={() => window.location.href = '/'}
            className="mt-4 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
          >
            Retour à l'accueil
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="material" element={<MaterialList />} />
        <Route path="sites" element={<SiteList />} /> {/* Changed from SitesList to SiteList */}
        <Route path="sites/:id" element={<SiteDetails />} />
        <Route path="journal" element={<Journal />} />
        <Route path="settings" element={<Settings />} />
        <Route path="hilti" element={<HiltiPage />} /> {/* Added HiltiPage route */}
        <Route path="*" element={<PlaceholderPage title="Page Non Trouvée" />} /> {/* Added catch-all route */}
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AppProvider>
      <ReloadPrompt />
      <BrowserRouter>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
