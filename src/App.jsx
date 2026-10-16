import React, { useEffect } from 'react';
import { supabase } from './supabaseClient';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import Layout from './components/Layout';
import ReloadPrompt from './components/ReloadPrompt';
import GlobalTimer from './components/GlobalTimer';

const VersionOverlay = () => (
  <div className="fixed bottom-0 right-0 bg-black/80 text-white text-[10px] p-1 z-[9999] pointer-events-none">
    v0.9.12
  </div>
);
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import MaterialList from './pages/MaterialList';
import PlaceholderPage from './pages/Placeholders';
import SitesList from './pages/SitesList';
import SiteDetails from './pages/SiteDetails';
import Journal from './pages/Journal';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import HiltiPage from './pages/HiltiPage';
import TimeTracking from './pages/TimeTrackingPage';
import ManualEntry from './pages/ManualEntry';
import ValidationPage from './pages/ValidationPage';
import OnboardingPage from './pages/OnboardingPage';
import SetupWizard from './pages/SetupWizard';
import WeeklyTimeEntry from './pages/WeeklyTimeEntry';

const ProtectedRoute = ({ children }) => {
  const { companySetupComplete } = useAppContext();
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUser(data?.session?.user ?? null);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  if (loading) return null;

  // 1. Not authenticated → login
  if (!user) return <Navigate to="/login" replace />;

  // 2. Company check loading → wait
  if (companySetupComplete === null) return null;

  // 3. No company → setup wizard
  if (companySetupComplete === false) return <Navigate to="/setup" replace />;

  // 4. Authenticated + company → render app
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
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-8 text-white">
          <h1 className="text-4xl font-bold text-red-500 mb-6">Une erreur est survenue</h1>
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl max-w-2xl w-full overflow-auto max-h-[50vh] mb-6">
            <p className="font-mono text-red-400 mb-2">Message d'erreur :</p>
            <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono">
              {this.state.error && this.state.error.toString()}
              {this.state.error?.stack && `\n\n${this.state.error.stack}`}
            </pre>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-colors"
          >
            Recharger l'application
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
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/setup" element={<SetupWizard />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
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
        <Route path="sites" element={<SitesList />} />
        <Route path="sites/:id" element={<SiteDetails />} />
        <Route path="journal" element={<Journal />} />
        <Route path="settings" element={<Settings />} />
        <Route path="hilti" element={<HiltiPage />} />
        <Route path="hours" element={<TimeTracking />} />
        <Route path="timetracking" element={<TimeTracking />} />
        <Route path="timetracking/manual" element={<ManualEntry />} />
        <Route path="timetracking/weekly" element={<WeeklyTimeEntry />} />
        <Route path="timetracking/validation" element={<ValidationPage />} />
        <Route path="*" element={<PlaceholderPage title="Page Non Trouvée" />} /> {/* Added catch-all route */}
      </Route>
    </Routes>
  );
};

function App() {

  return (
    <ErrorBoundary>
      <AppProvider>
        <ReloadPrompt />
        <BrowserRouter>
          <GlobalTimer />
          <AppRoutes />
          <VersionOverlay />
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
// Force Vercel Deploy: 2026-02-11 07:22
// Version: 0.9.11
