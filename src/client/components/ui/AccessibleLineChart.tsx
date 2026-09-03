import { useId } from "react";

export type ChartSeries = {
  id: string;
  label: string;
  /** Any CSS color value; combine with a dash pattern so color is never the only distinction. */
  color: string;
  dash?: string;
  points: Array<number | null>;
};

export type AccessibleLineChartProps = {
  title: string;
  description: string;
  xLabels: string[];
  min: number;
  max: number;
  series: ChartSeries[];
  tableCaption: string;
  /** Formats an x label for axis ticks and the data table. */
  formatLabel?: (label: string) => string;
};

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 12, right: 12, bottom: 28, left: 28 };

type Segment = Array<{ x: number; y: number; index: number }>;

function buildSegments(points: Array<number | null>, xOf: (i: number) => number, yOf: (v: number) => number): Segment[] {
  const segments: Segment[] = [];
  let current: Segment = [];
  points.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: xOf(index), y: yOf(value), index });
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

export function AccessibleLineChart({
  title,
  description,
  xLabels,
  min,
  max,
  series,
  tableCaption,
  formatLabel = (label) => label,
}: AccessibleLineChartProps) {
  const headingId = useId();
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const count = xLabels.length;

  const xOf = (index: number) =>
    PADDING.left + (count <= 1 ? innerWidth / 2 : (index / (count - 1)) * innerWidth);
  const yOf = (value: number) =>
    PADDING.top + innerHeight - ((value - min) / (max - min)) * innerHeight;

  const yTicks: number[] = [];
  for (let tick = min; tick <= max; tick += 1) yTicks.push(tick);

  const tickCount = Math.min(5, count);
  const xTickIndexes = [...new Set(
    Array.from({ length: tickCount }, (_, i) =>
      Math.round((i / Math.max(1, tickCount - 1)) * (count - 1)),
    ),
  )];

  return (
    <figure aria-labelledby={headingId}>
      <figcaption id={headingId} className="sr-only">
        {title}. {description}
      </figcaption>

      <div className="flex flex-wrap items-center gap-4" aria-hidden="true">
        {series.map((entry) => (
          <span key={entry.id} className="text-on-surface-variant flex items-center gap-1.5 text-xs">
            <svg width="20" height="8" viewBox="0 0 20 8">
              <line
                x1="1"
                y1="4"
                x2="19"
                y2="4"
                stroke={entry.color}
                strokeWidth="2.5"
                strokeDasharray={entry.dash}
                strokeLinecap="round"
              />
            </svg>
            {entry.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${title}. ${description} The same data is available in the table below.`}
        className="mt-2 w-full"
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="var(--sys-outline-variant)"
              strokeWidth="1"
            />
            <text
              x={PADDING.left - 8}
              y={yOf(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--sys-on-surface-variant)"
            >
              {tick}
            </text>
          </g>
        ))}

        {xTickIndexes.map((index) => (
          <text
            key={index}
            x={xOf(index)}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize="11"
            fill="var(--sys-on-surface-variant)"
          >
            {formatLabel(xLabels[index] ?? "")}
          </text>
        ))}

        {series.map((entry) => {
          const segments = buildSegments(entry.points, xOf, yOf);
          return (
            <g key={entry.id}>
              {segments.map((segment) =>
                segment.length === 1 ? (
                  <circle
                    key={`dot-${segment[0].index}`}
                    cx={segment[0].x}
                    cy={segment[0].y}
                    r="3.5"
                    fill={entry.color}
                  />
                ) : (
                  <polyline
                    key={`line-${segment[0].index}`}
                    points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={entry.color}
                    strokeWidth="2.5"
                    strokeDasharray={entry.dash}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ),
              )}
            </g>
          );
        })}
      </svg>

      <details className="mt-2">
        <summary className="text-primary focus-visible:outline-focus-ring inline-flex cursor-pointer items-center rounded-control text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
          View chart data as a table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-sm">
            <caption className="text-on-surface-variant pb-2 text-left text-xs">
              {tableCaption}
            </caption>
            <thead>
              <tr className="border-outline-variant border-b">
                <th scope="col" className="text-on-surface-variant py-1.5 pr-4 font-medium">
                  Date
                </th>
                {series.map((entry) => (
                  <th key={entry.id} scope="col" className="text-on-surface-variant py-1.5 pr-4 font-medium">
                    {entry.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {xLabels.map((label, index) => (
                <tr key={label} className="border-outline-variant/60 border-b last:border-0">
                  <th scope="row" className="text-on-surface py-1.5 pr-4 font-normal">
                    {formatLabel(label)}
                  </th>
                  {series.map((entry) => (
                    <td key={entry.id} className="text-on-surface py-1.5 pr-4">
                      {entry.points[index] ?? "No check-in"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
