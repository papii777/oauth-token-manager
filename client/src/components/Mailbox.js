import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../App';
import EmailComposer from './EmailComposer';
import api from '../utils/api';

export default function Mailbox() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [account, setAccount] = useState(null);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [messages, setMessages] = useState([]);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [selectedMsgContent, setSelectedMsgContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Load account info
  useEffect(() => {
    api.get(`/tokens/${accountId}`)
      .then(({ data }) => setAccount(data))
      .catch(() => addToast('Account not found.', 'error'));
  }, [accountId, addToast]);

  // Load folder list
  useEffect(() => {
    api.get(`/mailbox/${accountId}/folders`)
      .then(({ data }) => setFolders(data.value || []))
      .catch(() => {});
  }, [accountId]);

  // Load messages when folder / page / search changes
  const loadMessages = useCallback(async () => {
    setLoading(true);
    setSelectedMsg(null);
    setSelectedMsgContent(null);
    try {
      const params = {
        folder: activeFolder,
        top: PAGE_SIZE,
        skip: page * PAGE_SIZE,
      };
      if (search) params.search = search;

      const { data } = await api.get(`/mailbox/${accountId}/messages`, { params });
      setMessages(data.value || []);
    } catch (err) {
      addToast('Failed to load messages.', 'error');
    } finally {
      setLoading(false);
    }
  }, [accountId, activeFolder, page, search, addToast]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function openMessage(msg) {
    setSelectedMsg(msg);
    setMsgLoading(true);
    try {
      const { data } = await api.get(`/mailbox/${accountId}/message/${msg.id}`);
      setSelectedMsgContent(data);
    } catch {
      addToast('Failed to load email content.', 'error');
    } finally {
      setMsgLoading(false);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    setPage(0);
    loadMessages();
  }

  const folderLabel = (name) => {
    const icons = {
      inbox: '📥 Inbox',
      sentItems: '📤 Sent',
      drafts: '📝 Drafts',
      deleteditems: '🗑 Deleted',
      junkemail: '🚫 Junk',
    };
    return icons[name] || `📁 ${name}`;
  };

  return (
    <div className="page page--mailbox">
      {/* Top bar */}
      <header className="topbar">
        <button className="btn btn--ghost btn--sm" onClick={() => navigate('/')}>
          ← Back
        </button>
        <div className="topbar__brand">
          <span className="topbar__icon">📬</span>
          <span className="topbar__title">{account?.email || 'Mailbox'}</span>
        </div>
        <button className="btn btn--primary btn--sm" onClick={() => setComposing(true)}>
          ✏️ Compose
        </button>
      </header>

      <div className="mailbox-layout">
        {/* Sidebar – folders */}
        <aside className="mailbox-sidebar">
          <p className="sidebar-heading">Folders</p>
          {/* Well-known folders */}
          {['inbox', 'sentItems', 'drafts', 'deleteditems', 'junkemail'].map((f) => (
            <button
              key={f}
              className={`folder-btn ${activeFolder === f ? 'folder-btn--active' : ''}`}
              onClick={() => { setActiveFolder(f); setPage(0); }}
            >
              {folderLabel(f)}
            </button>
          ))}

          {/* Dynamic folders from API */}
          {folders
            .filter((f) => !['inbox', 'sentItems', 'drafts', 'deletedItems', 'junkEmail'].includes(f.id))
            .map((f) => (
              <button
                key={f.id}
                className={`folder-btn ${activeFolder === f.id ? 'folder-btn--active' : ''}`}
                onClick={() => { setActiveFolder(f.id); setPage(0); }}
              >
                📁 {f.displayName}
                {f.unreadItemCount > 0 && (
                  <span className="folder-badge">{f.unreadItemCount}</span>
                )}
              </button>
            ))}
        </aside>

        {/* Message list */}
        <section className="message-list">
          {/* Search bar */}
          <form className="message-search" onSubmit={handleSearch}>
            <input
              type="text"
              className="search-input"
              placeholder="Search messages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="btn btn--secondary btn--sm">🔍</button>
          </form>

          {loading ? (
            <div className="loading-state">
              <span className="spinner spinner--lg" />
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <p className="empty-icon">📭</p>
              <p>No messages found.</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message-item ${selectedMsg?.id === msg.id ? 'message-item--active' : ''} ${!msg.isRead ? 'message-item--unread' : ''}`}
                  onClick={() => openMessage(msg)}
                >
                  <div className="message-item__from">
                    {msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Unknown'}
                  </div>
                  <div className="message-item__subject">{msg.subject || '(No subject)'}</div>
                  <div className="message-item__preview">{msg.bodyPreview}</div>
                  <div className="message-item__meta">
                    {msg.hasAttachments && <span className="attachment-icon">📎</span>}
                    <span className="message-item__date">
                      {new Date(msg.receivedDateTime).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              <div className="pagination">
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Prev
                </button>
                <span>Page {page + 1}</span>
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={messages.length < PAGE_SIZE}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </section>

        {/* Message content pane */}
        <section className="message-content">
          {!selectedMsg && (
            <div className="empty-state">
              <p className="empty-icon">✉️</p>
              <p>Select a message to read it</p>
            </div>
          )}

          {selectedMsg && msgLoading && (
            <div className="loading-state">
              <span className="spinner spinner--lg" />
            </div>
          )}

          {selectedMsg && !msgLoading && selectedMsgContent && (
            <div className="email-reader">
              <div className="email-reader__header">
                <h2 className="email-subject">{selectedMsgContent.subject || '(No subject)'}</h2>
                <p className="email-from">
                  From: <strong>{selectedMsgContent.from?.emailAddress?.name}</strong>{' '}
                  &lt;{selectedMsgContent.from?.emailAddress?.address}&gt;
                </p>
                <p className="email-to">
                  To:{' '}
                  {(selectedMsgContent.toRecipients || [])
                    .map((r) => r.emailAddress?.address)
                    .join(', ')}
                </p>
                <p className="email-date">
                  {new Date(selectedMsgContent.receivedDateTime).toLocaleString()}
                </p>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setComposing(true)}
                >
                  ↩ Reply
                </button>
              </div>

              <div
                className="email-body"
                dangerouslySetInnerHTML={{
                  __html:
                    selectedMsgContent.body?.content ||
                    `<p>${selectedMsgContent.bodyPreview}</p>`,
                }}
              />
            </div>
          )}
        </section>
      </div>

      {/* Compose modal */}
      {composing && (
        <EmailComposer
          accountId={accountId}
          onClose={() => setComposing(false)}
          defaultTo={
            selectedMsgContent?.from?.emailAddress?.address || ''
          }
        />
      )}
    </div>
  );
}
