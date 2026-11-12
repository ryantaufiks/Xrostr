import type { LeaveRequestView } from '@xrostr/contracts';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { LEAVE_STATUS_LABELS, leaveRange } from '@/lib/leave';

/** One leave request: type, dates and status, with room for actions underneath. */
export function LeaveRequestRow({
  request,
  showEmployee = false,
  children,
}: {
  request: LeaveRequestView;
  showEmployee?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {showEmployee && (
            <p className="text-lg font-semibold text-fg">
              {request.employee.fullName}{' '}
              <span className="font-normal text-muted">· {request.employee.employeeNo}</span>
            </p>
          )}
          <p className={showEmployee ? 'text-base text-fg' : 'text-lg font-semibold text-fg'}>
            {request.leaveType.name}
          </p>
          <p className="text-base text-muted">
            {leaveRange(request)} ·{' '}
            <span className="font-semibold text-fg">{request.days} hari</span>
          </p>
        </div>
        <Badge
          tone={
            request.status === 'pending'
              ? 'warn'
              : request.status === 'approved'
                ? 'active'
                : 'neutral'
          }
        >
          {LEAVE_STATUS_LABELS[request.status]}
        </Badge>
      </div>
      {request.reason && <p className="text-base text-muted">“{request.reason}”</p>}
      {request.decisionNote && (
        <p className="text-base text-muted">
          Catatan: <span className="text-fg">{request.decisionNote}</span>
        </p>
      )}
      {children}
    </li>
  );
}
