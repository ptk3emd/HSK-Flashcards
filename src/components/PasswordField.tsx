import React, { useState } from 'react';
import { Check, Circle, Eye, EyeOff } from 'lucide-react';
import { PasswordVerdict } from '../lib/passwordPolicy';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  /** Enforced by the browser too; skipped on sign-in for accounts made under older rules */
  minLength?: number;
  describedBy?: string;
}

/** A glass password field with a show/hide toggle, shared by every account screen. */
export const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  describedBy,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-sm font-medium">{label}</span>
      <span className="relative block">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          maxLength={72}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          className="w-full min-h-12 pl-4 pr-12 rounded-xl glass-field text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 -translate-y-1/2 min-h-10 min-w-10 flex items-center justify-center rounded-lg ink-secondary hover:text-[var(--text-fg)] cursor-pointer"
        >
          {visible ? (
            <EyeOff className="w-[18px] h-[18px]" aria-hidden="true" />
          ) : (
            <Eye className="w-[18px] h-[18px]" aria-hidden="true" />
          )}
        </button>
      </span>
    </label>
  );
};

interface PasswordChecklistProps {
  verdict: PasswordVerdict;
  id: string;
}

/** Live rules for the password being typed, with a hairline strength rule. */
export const PasswordChecklist: React.FC<PasswordChecklistProps> = ({ verdict, id }) => {
  const passed = verdict.checks.filter((check) => check.ok).length;
  const percent = Math.round((passed / verdict.checks.length) * 100);

  return (
    <div id={id} className="space-y-2 pt-0.5">
      <ul className="space-y-1.5">
        {verdict.checks.map((check) => (
          <li
            key={check.id}
            className={`flex items-center gap-2 text-xs ${
              check.ok ? 'text-emerald-700 dark:text-emerald-300' : 'ink-secondary'
            }`}
          >
            {check.ok ? (
              <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Circle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            {check.label}
          </li>
        ))}
      </ul>
      <div
        role="progressbar"
        aria-label="Força da senha"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-[3px] rounded-full bg-black/10 dark:bg-white/10 overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-200 ${
            verdict.ok ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-red-600 dark:bg-red-400'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
