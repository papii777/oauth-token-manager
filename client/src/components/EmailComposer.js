import React, { useState } from 'react';
import { useToast } from '../App';
import api from '../utils/api';

/**
 * EmailComposer – modal for composing and sending a new email.
 *
 * Props:
 *   accountId  – numeric account ID
 *   onClose    – fn() to close the modal
 *   defaultTo  – optional pre-filled recipient
 */
export default function EmailComposer({ accountId, onClose, defaultTo = '' }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ to: defaultTo, subject: '', body: '' });
  const [sending, setSending] = useState(false);

  async function handleSend(e) {
    e.preventDefault();
    setSending(true);
    try {
      await api.post(`/mailbox/${accountId}/send`, {
        to: form.to,
        subject: form.subject,
        body: form.body,
        contentType: 'HTML',
      });
      addToast('Email sent!', 'success');
      onClose();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to send email.', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">✏️ Compose Email</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSend} className="composer-form">
          <div className="form-group">
            <label>To</label>
            <input
              type="email"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              placeholder="recipient@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Subject</label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Subject"
              required
            />
          </div>

          <div className="form-group">
            <label>Message (HTML supported)</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Write your message…"
              rows={8}
              required
            />
          </div>

          <div className="modal__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={sending}>
              {sending ? <span className="spinner spinner--sm" /> : '📤 Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
