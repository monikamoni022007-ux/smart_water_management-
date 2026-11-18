export type DataSource = 'demo' | 'manual';

export interface ReadingInput {
  date: string;
  volumeLiters: number;
  nightFlowLph: number;
  notes?: string;
  source?: DataSource;
  meterId?: string;
}

export interface ReadingProps {
  id: number;
  userId: number;
  meterId: string;
  date: string;
  volumeLiters: number;
  nightFlowLph: number;
  source: DataSource;
  notes: string;
  createdAt?: string;
}

export class Reading {
  public readonly id: number;
  public readonly userId: number;
  public readonly meterId: string;
  public readonly date: string;
  public readonly volumeLiters: number;
  public readonly nightFlowLph: number;
  public readonly source: DataSource;
  public readonly notes: string;
  public readonly createdAt: string;

  constructor(props: ReadingProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.meterId = props.meterId;
    this.date = props.date;
    this.volumeLiters = Number(props.volumeLiters);
    this.nightFlowLph = Number(props.nightFlowLph);
    this.source = props.source;
    this.notes = props.notes ?? '';
    this.createdAt = props.createdAt ?? new Date().toISOString();
  }

  public isWeekend(): boolean {
    const parsed = new Date(`${this.date}T12:00:00Z`);
    const day = parsed.getUTCDay();
    return day === 0 || day === 6;
  }

  public getDayOfWeek(): number {
    const parsed = new Date(`${this.date}T12:00:00Z`);
    return parsed.getUTCDay();
  }

  public static validateInput(input: Partial<ReadingInput>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      errors.push('Date must be a valid YYYY-MM-DD value.');
    } else {
      const d = new Date(`${input.date}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) {
        errors.push('Date is invalid.');
      }
    }

    if (input.volumeLiters === undefined || input.volumeLiters === null || Number.isNaN(Number(input.volumeLiters))) {
      errors.push('Water volume (liters) is required.');
    } else {
      const vol = Number(input.volumeLiters);
      if (vol <= 0 || vol > 50000) {
        errors.push('Water volume must be between 1 and 50,000 liters.');
      }
    }

    if (input.nightFlowLph === undefined || input.nightFlowLph === null || Number.isNaN(Number(input.nightFlowLph))) {
      errors.push('Nighttime flow (L/h) is required.');
    } else {
      const night = Number(input.nightFlowLph);
      if (night < 0 || night > 2000) {
        errors.push('Nighttime flow must be between 0 and 2,000 L/h.');
      }
    }

    if (input.notes && input.notes.length > 240) {
      errors.push('Notes must be 240 characters or fewer.');
    }

    return { valid: errors.length === 0, errors };
  }

  public toJSON(): ReadingProps {
    return {
      id: this.id,
      userId: this.userId,
      meterId: this.meterId,
      date: this.date,
      volumeLiters: this.volumeLiters,
      nightFlowLph: this.nightFlowLph,
      source: this.source,
      notes: this.notes,
      createdAt: this.createdAt,
    };
  }
}
