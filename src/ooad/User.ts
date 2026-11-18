export interface UserProps {
  id: number;
  name: string;
  email: string;
  householdName: string;
  householdSize: number;
  createdAt?: string;
}

export class User {
  public readonly id: number;
  public readonly name: string;
  public readonly email: string;
  public readonly householdName: string;
  public readonly householdSize: number;
  public readonly createdAt: string;

  constructor(props: UserProps) {
    this.id = props.id;
    this.name = props.name;
    this.email = props.email;
    this.householdName = props.householdName;
    this.householdSize = props.householdSize;
    this.createdAt = props.createdAt ?? new Date().toISOString();
  }

  public getMeterId(): string {
    return `WM-${String(this.id).padStart(4, '0')}`;
  }

  public getRecommendedPerCapitaTarget(): number {
    // 105 liters per person per day conservative residential benchmark
    return this.householdSize * 105;
  }

  public toPublicJSON(): UserProps {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      householdName: this.householdName,
      householdSize: this.householdSize,
      createdAt: this.createdAt,
    };
  }
}
