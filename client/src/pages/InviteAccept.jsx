import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useWorkspace } from '../context/WorkspaceContext';

export default function InviteAccept() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { selectOrg } = useWorkspace();
  const [status, setStatus] = useState('accepting'); // 'accepting' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let active = true;
    const accept = async () => {
      try {
        const res = await api.post(`/orgs/join/${encodeURIComponent(token)}`);
        if (!active) return;
        toast.success(res.data?.message || 'Joined organization!');
        if (res.data?.orgId) {
          await selectOrg(res.data.orgId);
        }
        navigate('/team', { replace: true });
      } catch (err) {
        if (!active) return;
        setStatus('error');
        setErrorMsg(err.response?.data?.error || 'Could not accept invitation.');
      }
    };
    accept();
    return () => {
      active = false;
    };
  }, [token, selectOrg, navigate]);

  return (
    <div className="max-w-md mx-auto mt-12 bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm space-y-4">
      {status === 'accepting' ? (
        <>
          <RefreshCw className="w-8 h-8 text-brand-600 animate-spin mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">Joining organization...</h2>
          <p className="text-sm text-slate-500">Verifying your invitation token.</p>
        </>
      ) : (
        <>
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">Invitation Error</h2>
          <p className="text-sm text-rose-600">{errorMsg}</p>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium"
          >
            <CheckCircle2 className="w-4 h-4" /> Go to Workspace
          </button>
        </>
      )}
    </div>
  );
}
