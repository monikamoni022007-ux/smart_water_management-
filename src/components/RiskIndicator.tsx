import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { AlertRiskLevel } from '../types/api';
import { formatAlertRiskLabel } from '../utils/plainLanguage';

interface RiskIndicatorProps {
  level: AlertRiskLevel;
  plain?: boolean;
}

export function RiskIndicator({ level, plain = false }: RiskIndicatorProps) {
  const label = plain ? formatAlertRiskLabel(level) : level;

  if (level === 'High Risk') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC2626] whitespace-nowrap">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (level === 'Medium Risk') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B45309] whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (level === 'Low Risk') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0284C7] whitespace-nowrap">
        <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D] whitespace-nowrap">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
