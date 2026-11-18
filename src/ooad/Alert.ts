export type AlertRiskLevel = 'Normal' | 'Low Risk' | 'Medium Risk' | 'High Risk';
export type AlertStatus = 'Active' | 'Acknowledged' | 'Resolved';

export interface AlertProps {
  id: number;
  userId: number;
  date: string;
  riskLevel: AlertRiskLevel;
  ruleTriggered: string;
  reason: string;
  expectedLiters: number;
  actualLiters: number;
  nightFlowLph: number;
  recommendedAction: string;
  status: AlertStatus;
  createdAt?: string;
}

export class Alert {
  public readonly id: number;
  public readonly userId: number;
  public readonly date: string;
  public readonly riskLevel: AlertRiskLevel;
  public readonly ruleTriggered: string;
  public readonly reason: string;
  public readonly expectedLiters: number;
  public readonly actualLiters: number;
  public readonly nightFlowLph: number;
  public readonly recommendedAction: string;
  public status: AlertStatus;
  public readonly createdAt: string;

  constructor(props: AlertProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.date = props.date;
    this.riskLevel = props.riskLevel;
    this.ruleTriggered = props.ruleTriggered;
    this.reason = props.reason;
    this.expectedLiters = Number(props.expectedLiters);
    this.actualLiters = Number(props.actualLiters);
    this.nightFlowLph = Number(props.nightFlowLph);
    this.recommendedAction = props.recommendedAction;
    this.status = props.status;
    this.createdAt = props.createdAt ?? new Date().toISOString();
  }

  public acknowledge(): void {
    if (this.status === 'Active') {
      this.status = 'Acknowledged';
    }
  }

  public resolve(): void {
    this.status = 'Resolved';
  }

  public toJSON(): AlertProps {
    return {
      id: this.id,
      userId: this.userId,
      date: this.date,
      riskLevel: this.riskLevel,
      ruleTriggered: this.ruleTriggered,
      reason: this.reason,
      expectedLiters: this.expectedLiters,
      actualLiters: this.actualLiters,
      nightFlowLph: this.nightFlowLph,
      recommendedAction: this.recommendedAction,
      status: this.status,
      createdAt: this.createdAt,
    };
  }
}

/**
 * Observer Pattern interface for components reacting to suspected leak alerts.
 */
export interface AlertObserver {
  update(alert: Alert): void;
}
