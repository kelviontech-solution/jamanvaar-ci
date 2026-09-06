import React from 'react';
import { usePosStore } from '../../store/posStore';
import { X, Keyboard, Command } from 'lucide-react';

// Deliberately decommissioned — POS is touch-first and must not expose any
// keyboard-shortcut UI (see tests/pos_touch_first_no_shortcuts_ui.test.ts).
// F-key shortcuts still work for staff who know them; nothing in the UI
// teaches or references them.
export const ShortcutsHelpModal: React.FC = () => {
  return null;
};
