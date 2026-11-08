import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(name, email, password);
      toast.success('Account created successfully!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl mx-auto shadow-md mb-4">
            W
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Create an Account</h2>
          <p className="text-sm text-slate-500 mt-1">Start collaborating with AI insights</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Shivashankargoud B R"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="shiva@workspace.local"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition shadow-sm disabled:opacity-50 mt-2"
          >
            {loading ? 'Creating Account...' : 'Get Started'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 font-semibold hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
