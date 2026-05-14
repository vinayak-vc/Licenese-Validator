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

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ProjectProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="clients" element={<ClientRegistry />} />
              <Route path="integration" element={<IntegrationHub />} />
              <Route path="settings" element={<ProjectSettings />} />
            </Route>
          </Routes>
        </ProjectProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
