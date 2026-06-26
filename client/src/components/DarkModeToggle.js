import React from 'react';

/**
 * DarkModeToggle — a floating sun/moon button in the top-right corner.
 *
 * Props:
 *   darkMode  – boolean
 *   onToggle  – fn()
 */
export default function DarkModeToggle({ darkMode, onToggle }) {
  return (
    <button
      className="dark-mode-toggle"
      onClick={onToggle}
      title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle dark mode"
    >
      {darkMode ? '☀️' : '🌙'}
    </button>
  );
}
