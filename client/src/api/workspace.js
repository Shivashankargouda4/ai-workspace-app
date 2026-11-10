import api from './client';

/**
 * Resolve the signed-in user's active organization, workspace, project, and members.
 * Never falls back to ID 1 when the user belongs to zero organizations.
 */
export async function fetchDefaultWorkspaceContext(preferredOrgId = null) {
  const orgsRes = await api.get('/orgs');
  const organizations = orgsRes.data?.organizations || [];
  if (organizations.length === 0) {
    return {
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
  }

  const savedOrgId = preferredOrgId || Number(localStorage.getItem('activeOrgId')) || null;
  const primaryOrg =
    organizations.find((o) => o.id === savedOrgId) ||
    organizations.find((o) => o.id === 1) ||
    organizations[0];

  localStorage.setItem('activeOrgId', String(primaryOrg.id));

  const detailsRes = await api.get(`/orgs/${primaryOrg.id}`);
  const workspaces = detailsRes.data?.workspaces || [];
  const projects = detailsRes.data?.projects || [];
  const members = detailsRes.data?.members || [];
  const currentUserRole = detailsRes.data?.currentUserRole || primaryOrg.role || 'member';

  return {
    hasOrg: true,
    orgId: primaryOrg.id,
    organization: detailsRes.data?.organization || primaryOrg,
    workspaceId: workspaces[0]?.id ?? null,
    projectId: projects[0]?.id ?? null,
    currentUserRole,
    members,
    organizations,
    workspaces,
    projects,
  };
}
