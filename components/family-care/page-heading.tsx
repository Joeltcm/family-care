import type { ReactNode } from 'react';

export function PageHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: ReactNode }) {
  return <section className="welcome-row section-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="welcome-copy">{copy}</p></div>{action}</section>;
}
