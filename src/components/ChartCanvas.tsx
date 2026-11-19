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

    const defaultPlugins = {
      tooltip: {
        backgroundColor: '#0F172A',
        titleColor: '#F8FAFC',
        bodyColor: '#E2E8F0',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
        titleFont: {
          family: '"Plus Jakarta Sans", sans-serif',
          size: 12,
          weight: 600 as const,
        },
        bodyFont: {
          family: '"IBM Plex Mono", monospace',
          size: 12,
        },
        displayColors: true,
        boxPadding: 4,
      },
      legend: {
        labels: {
          color: '#475569',
          font: {
            family: '"DM Sans", sans-serif',
            size: 12,
          },
          usePointStyle: false,
          boxWidth: 16,
          boxHeight: 3,
          padding: 16,
        },
      },
    };

    const config: ChartConfiguration<T> = {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        ...options,
        plugins: {
          ...defaultPlugins,
          ...(options?.plugins as Record<string, unknown> | undefined),
        },
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
