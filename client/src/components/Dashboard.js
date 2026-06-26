import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useToast } from '../App';
import AccountCard from './AccountCard';
import api from '../utils/api';

export default function Dashboard() {
  const { logout } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(null);
  const [search, setSearch] = useState('');

  const fetchAccounts = useCallback(async () => {
    try {
      const { data } = await api.get('/tokens');
      setAccounts(data);
    } catch (err) {
      addToast('Failed to load accounts.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchAccounts();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchAccounts, 60000);
    return () => clearInterval(interval);
  }, [fetchAccounts]);

  async function handleRefresh(id) {
    setRefreshing(id);
    try {
      await api.post(`/tokens/${id}/refresh`);
      addToast('Token refreshed successfully!', 'success');
      fetchAccounts();
    } catch (err) {
      addToast(err.response?.data?.error || 'Token refresh failed.', 'error');
    } finally {
      setRefreshing(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this account?')) return;
    try {
      await api.delete(`/tokens/${id}`);
      addToast('Account deleted.', 'success');
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      addToast(err.response?.data?.error || 'Delete failed.', 'error');
    }
  }

  function handleMailbox(id) {
    navigate(`/mailbox/${id}`);
  }

  const filtered = accounts.filter(
    (a) =>
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      a.user_id.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = accounts.filter(
    (a) => a.status === 'active' && new Date(a.token_expiry) > new Date()
  ).length;
  const expiredCount = accounts.length - activeCount;

  return (
    <div className="page">
      {/* Sidebar / Header */}
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__icon">🔐</span>
          <span className="topbar__title">M365 Token Manager</span>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={logout}>
          Sign Out
        </button>
      </header>

      <main className="content">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <p className="stat-value">{accounts.length}</p>
            <p className="stat-label">Total Accounts</p>
          </div>
          <div className="stat-card stat-card--success">
            <p className="stat-value">{activeCount}</p>
            <p className="stat-label">Active</p>
          </div>
          <div className="stat-card stat-card--warn">
            <p className="stat-value">{expiredCount}</p>
            <p className="stat-label">Expired / Error</p>
          </div>
        </div>

        {/* Search + Refresh */}
        <div className="toolbar">
          <input
            className="search-input"
            type="text"
            placeholder="Search by email or user ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="btn btn--secondary btn--sm"
            onClick={fetchAccounts}
            disabled={loading}
          >
            {loading ? <span className="spinner spinner--sm" /> : '↺ Refresh'}
          </button>
        </div>

        {/* Account list */}
        {loading ? (
          <div className="loading-state">
            <span className="spinner spinner--lg" />
            <p>Loading accounts…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p className="empty-icon">📭</p>
            <p>{search ? 'No accounts match your search.' : 'No accounts yet.'}</p>
            {!search && (
              <p className="empty-hint">
                Authorize a Microsoft account via the Cloudflare Worker to get started.
              </p>
            )}
          </div>
        ) : (
          <div className="accounts-grid">
            {filtered.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onRefresh={refreshing === account.id ? () => {} : handleRefresh}
                onDelete={handleDelete}
                onMailbox={handleMailbox}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
