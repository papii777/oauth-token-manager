import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Mailbox from './components/Mailbox';
import DarkModeToggle from './components/DarkModeToggle';

// ─── Auth Context ─────────────────────────────────────────────────────────────

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Toast Context ────────────────────────────────────────────────────────────

export const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken'));
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') !== 'false');
  const [toasts, setToasts] = useState([]);

  // Sync dark-mode class on <body>
  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  function login(newToken) {
    localStorage.setItem('adminToken', newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem('adminToken');
    setToken(null);
  }

  function addToast(message, type = 'info') {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      <ToastContext.Provider value={{ addToast }}>
        <BrowserRouter>
          {/* Dark mode toggle always visible */}
          <DarkModeToggle darkMode={darkMode} onToggle={() => setDarkMode((d) => !d)} />

          <Routes>
            <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
            <Route
              path="/"
              element={token ? <Dashboard /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/mailbox/:accountId"
              element={token ? <Mailbox /> : <Navigate to="/login" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          {/* Toast notifications */}
          <div className="toast-container">
            {toasts.map((t) => (
              <div key={t.id} className={`toast toast--${t.type}`}>
                {t.message}
              </div>
            ))}
          </div>
        </BrowserRouter>
      </ToastContext.Provider>
    </AuthContext.Provider>
  );
}
