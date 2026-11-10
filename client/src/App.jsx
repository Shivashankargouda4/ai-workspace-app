import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import WorkspaceOnboarding from './components/WorkspaceOnboarding';
import Login from './pages/Login';
import Register from './pages/Register';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Kanban = lazy(() => import('./pages/Kanban'));
const Chat = lazy(() => import('./pages/Chat'));
const Documents = lazy(() => import('./pages/Documents'));
const CodeStudio = lazy(() => import('./pages/CodeStudio'));
const Meet = lazy(() => import('./pages/Meet'));
const Files = lazy(() => import('./pages/Files'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Team = lazy(() => import('./pages/Team'));
const InviteAccept = lazy(() => import('./pages/InviteAccept'));

function PageFallback() {
  return (
    <div className="py-16 flex items-center justify-center">
      <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand-600"></div>
    </div>
  );
}

function ProtectedShell() {
  const { loading, hasOrg, refreshWorkspace } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const pendingPath = sessionStorage.getItem('pendingInvitePath');
    if (
      pendingPath &&
      (pendingPath.startsWith('/invite/') || pendingPath.startsWith('/meet/')) &&
      location.pathname !== pendingPath
    ) {
      sessionStorage.removeItem('pendingInvitePath');
      navigate(pendingPath, { replace: true });
    }
  }, [location.pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-3 sm:p-6 md:p-8 pb-20 md:pb-8 max-w-7xl mx-auto w-full min-w-0">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/invite/:token" element={<InviteAccept />} />
              {!hasOrg ? (
                <Route path="*" element={<WorkspaceOnboarding onWorkspaceReady={refreshWorkspace} />} />
              ) : (
                <>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/kanban" element={<Kanban />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/code" element={<CodeStudio />} />
                  <Route path="/meet" element={<Meet />} />
                  <Route path="/meet/:roomCode" element={<Meet />} />
                  <Route path="/files" element={<Files />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              )}
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  // Strict route protection: unauthenticated users MUST log in first (preserve pending invite/meet link)
  if (!user) {
    if (location.pathname.startsWith('/invite/') || location.pathname.startsWith('/meet/')) {
      sessionStorage.setItem('pendingInvitePath', location.pathname);
    }
    return <Navigate to="/login" replace />;
  }

  return (
    <WorkspaceProvider>
      <ProtectedShell />
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
