import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchDefaultWorkspaceContext } from '../api/workspace';
import { useAuth } from './AuthContext';

const WorkspaceContext = createContext(null);

const EMPTY_CTX = {
  hasOrg: false,
  orgId: null,
  organization: null,
  workspaceId: null,
  projectId: null,
  currentUserRole: null,
  members: [],
  organizations: [],
  workspaces: [],
  projects: [],
};

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [contextData, setContextData] = useState(EMPTY_CTX);
  const [loading, setLoading] = useState(true);

  const refreshWorkspace = useCallback(
    async (preferredOrgId = null) => {
      if (!user) {
        setContextData(EMPTY_CTX);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const ctx = await fetchDefaultWorkspaceContext(preferredOrgId);
        setContextData(ctx);
      } catch (err) {
        console.error('Failed to resolve workspace context', err);
        setContextData(EMPTY_CTX);
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const selectOrg = useCallback(
    async (nextOrgId) => {
      localStorage.setItem('activeOrgId', String(nextOrgId));
      await refreshWorkspace(Number(nextOrgId));
    },
    [refreshWorkspace]
  );

  useEffect(() => {
    refreshWorkspace();
  }, [refreshWorkspace]);

  return (
    <WorkspaceContext.Provider value={{ ...contextData, loading, refreshWorkspace, selectOrg }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
