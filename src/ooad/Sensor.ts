import { DataSource, Reading } from './Reading';

export abstract class Sensor {
  public readonly sensorId: string;
  public readonly location: string;
  public readonly unit: string;

  constructor(sensorId: string, location: string, unit = 'Liters') {
    this.sensorId = sensorId;
    this.location = location;
    this.unit = unit;
  }

  public abstract validate(): boolean;

  public abstract captureReading(params: {
    id: number;
    userId: number;
    meterId: string;
    date: string;
    volumeLiters: number;
    nightFlowLph: number;
    source: DataSource;
    notes?: string;
  }): Reading;
}

export class FlowSensor extends Sensor {
  public readonly pipeDiameterMm: number;
  public readonly maxRatedFlowLph: number;

  constructor(
    sensorId = 'SIM-FLOW-01',
    location = 'Main Supply Line (Software Simulation)',
    pipeDiameterMm = 25,
    maxRatedFlowLph = 2500
  ) {
    super(sensorId, location, 'Liters');
    this.pipeDiameterMm = pipeDiameterMm;
    this.maxRatedFlowLph = maxRatedFlowLph;
  }

  public validate(): boolean {
    return this.pipeDiameterMm > 0 && this.maxRatedFlowLph > 0 && this.sensorId.trim().length > 0;
  }

  public calculateAverageHourlyFlow(volumeLiters: number): number {
    return Number((volumeLiters / 24).toFixed(2));
  }

  public captureReading(params: {
    id: number;
    userId: number;
    meterId: string;
    date: string;
    volumeLiters: number;
    nightFlowLph: number;
    source: DataSource;
    notes?: string;
  }): Reading {
    if (!this.validate()) {
      throw new Error(`FlowSensor ${this.sensorId} failed configuration validation.`);
    }
    const validation = Reading.validateInput({
      date: params.date,
      volumeLiters: params.volumeLiters,
      nightFlowLph: params.nightFlowLph,
      notes: params.notes,
    });
    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }
    return new Reading({
      id: params.id,
      userId: params.userId,
      meterId: params.meterId,
      date: params.date,
      volumeLiters: Number(params.volumeLiters.toFixed(1)),
      nightFlowLph: Number(params.nightFlowLph.toFixed(1)),
      source: params.source,
      notes: params.notes ?? '',
    });
  }
}
