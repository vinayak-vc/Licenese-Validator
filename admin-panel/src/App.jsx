import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { ProjectProvider } from './context/ProjectContext';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ClientRegistry } from './pages/ClientRegistry';
import { IntegrationHub } from './pages/IntegrationHub';
import { ProjectSettings } from './pages/ProjectSettings';

import { HardwareInsights } from './pages/HardwareInsights';
import { GlobalSearch } from './pages/GlobalSearch';
import { NotificationProvider } from './context/NotificationContext';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ProjectProvider>
          <NotificationProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="clients" element={<ClientRegistry />} />
              <Route path="search" element={<GlobalSearch />} />
              <Route path="hardware" element={<HardwareInsights />} />
              <Route path="integration" element={<IntegrationHub />} />
              <Route path="settings" element={<ProjectSettings />} />
            </Route>
          </Routes>
          </NotificationProvider>
        </ProjectProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
