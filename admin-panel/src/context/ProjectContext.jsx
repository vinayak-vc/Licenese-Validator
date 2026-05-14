import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.getProjects();
      const projList = res.projects || [];
      setProjects(projList);
      if (projList.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projList[0].projectId);
      }
    } catch (error) {
      addToast(`Failed to load projects: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, addToast, selectedProjectId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const selectedProject = projects.find(p => p.projectId === selectedProjectId) || null;

  return (
    <ProjectContext.Provider value={{
      projects,
      selectedProjectId,
      setSelectedProjectId,
      selectedProject,
      loading,
      refreshProjects: fetchProjects
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within ProjectProvider');
  return context;
}
