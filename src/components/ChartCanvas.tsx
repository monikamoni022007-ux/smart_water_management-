import { useEffect, useRef } from 'react';
import {
  Chart,
  ChartConfiguration,
  ChartData,
  ChartOptions,
  ChartType,
  registerables,
} from 'chart.js';

Chart.register(...registerables);

interface ChartCanvasProps<T extends ChartType> {
  type: T;
  data: ChartData<T>;
  options?: ChartOptions<T>;
  heightClass?: string;
  testId?: string;
  ariaLabel: string;
}

export function ChartCanvas<T extends ChartType>({
  type,
  data,
  options,
  heightClass = 'h-72',
  testId,
  ariaLabel,
}: ChartCanvasProps<T>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<T> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const config: ChartConfiguration<T> = {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        ...options,
      } as ChartOptions<T>,
    };

    chartRef.current = new Chart(canvas, config);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [type, data, options]);

  return (
    <div className={`relative w-full ${heightClass}`} data-testid={testId}>
      <canvas ref={canvasRef} aria-label={ariaLabel} role="img" />
    </div>
  );
}
