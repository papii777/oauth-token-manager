import React from 'react';

/**
 * AccountCard — displays a single OAuth account with its status and actions.
 *
 * Props:
 *   account   – account object from the API
 *   onRefresh – async fn(id)
 *   onDelete  – async fn(id)
 *   onMailbox – fn(id)
 */
export default function AccountCard({ account, onRefresh, onDelete, onMailbox }) {
  const expiry = new Date(account.token_expiry);
  const now = new Date();
  const isExpired = expiry < now;
  const minutesLeft = Math.max(0, Math.round((expiry - now) / 60000));
  const hoursLeft = Math.floor(minutesLeft / 60);
  const minsLeft = minutesLeft % 60;

  const expiryLabel = isExpired
    ? 'Expired'
    : hoursLeft > 0
    ? `${hoursLeft}h ${minsLeft}m`
    : `${minsLeft}m`;

  const statusClass = account.status === 'active' && !isExpired
    ? 'badge badge--active'
    : account.status === 'error'
    ? 'badge badge--error'
    : 'badge badge--expired';

  const statusLabel =
    account.status === 'error' ? 'Error' : isExpired ? 'Expired' : 'Active';

  return (
    <div className={`account-card ${account.status === 'error' ? 'account-card--error' : ''}`}>
      {/* Header */}
      <div className="account-card__header">
        <div className="account-avatar">
          {account.email.charAt(0).toUpperCase()}
        </div>
        <div className="account-info">
          <p className="account-email">{account.email}</p>
          <p className="account-id">{account.user_id}</p>
        </div>
        <span className={statusClass}>{statusLabel}</span>
      </div>

      {/* Meta */}
      <div className="account-card__meta">
        <div className="meta-item">
          <span className="meta-label">Token Expiry</span>
          <span className={`meta-value ${isExpired ? 'meta-value--warn' : ''}`}>
            {isExpired ? '⚠️ Expired' : `⏱ ${expiryLabel}`}
          </span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Last Updated</span>
          <span className="meta-value">
            {new Date(account.updated_at).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="account-card__actions">
        <button
          className="btn btn--secondary btn--sm"
          onClick={() => onMailbox(account.id)}
        >
          📬 Mailbox
        </button>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => onRefresh(account.id)}
        >
          🔄 Refresh
        </button>
        <button
          className="btn btn--danger btn--sm"
          onClick={() => onDelete(account.id)}
        >
          🗑 Delete
        </button>
      </div>
    </div>
  );
}
