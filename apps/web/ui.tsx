import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  FlaskConical,
  LoaderCircle,
} from 'lucide-react';
import type { Summary } from './client';
import { date, href } from './client';

export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
export function Badge({ value }: { value: string }) {
  const tone = ['passed', 'PASS', 'verified', 'observed'].includes(value)
    ? 'good'
    : ['failed', 'BLOCK', 'error'].includes(value)
      ? 'bad'
      : ['WARNING', 'inconclusive', 'flaky', 'budget'].includes(value)
        ? 'warn'
        : 'neutral';
  const Symbol =
    tone === 'good' ? CircleCheck : tone === 'bad' || tone === 'warn' ? CircleAlert : CircleDot;
  return (
    <span className={`badge ${tone}`}>
      <Symbol size={13} aria-hidden="true" />
      {value}
    </span>
  );
}
export function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <FlaskConical size={20} aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export const Loading = () => (
  <p className="message" role="status">
    <LoaderCircle className="spin" size={17} /> Loading workspace…
  </p>
);
export const ErrorMessage = ({ error }: { error: Error | string }) => (
  <p className="message error" role="alert">
    <CircleAlert size={18} />
    {typeof error === 'string' ? error : error.message}
  </p>
);
export function RunTable({ rows, target = 'runs' }: { rows: Summary[]; target?: string }) {
  if (!rows.length)
    return (
      <Empty
        title="No executions yet"
        detail="Run a baseline or inject a controlled response failure to start collecting evidence."
      />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Workflow</th>
            <th>Status</th>
            <th>Risk</th>
            <th>Started</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td>
                <a className="table-link" href={href(target, item.id)}>
                  {item.scenario}
                </a>
                <small>{item.project}</small>
              </td>
              <td>{item.workflow}</td>
              <td>
                <Badge value={item.status} />
              </td>
              <td>{item.risk?.score ?? '—'}</td>
              <td className="nowrap">{date(item.createdAt)}</td>
              <td>
                <a
                  className="icon-btn"
                  href={href(target, item.id)}
                  aria-label={`Open ${item.scenario}`}
                >
                  <ArrowUpRight size={16} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
