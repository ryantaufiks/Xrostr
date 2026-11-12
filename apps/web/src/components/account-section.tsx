import type { ReactNode } from 'react';
import { Card } from './ui';

/** One titled block on the Account page: explanation on the left, controls on the right. */
export function AccountSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[240px_1fr]">
      <div>
        <h2 className="label font-bold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div>{children}</div>
    </Card>
  );
}
