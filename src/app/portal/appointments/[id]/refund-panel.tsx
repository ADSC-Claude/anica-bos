'use client';

import { useActionState, useState } from 'react';
import { refundDepositAction, type RefundState } from '../actions';
import { formatPeso } from '@/lib/money';

/**
 * Sending a reservation fee back.
 *
 * Only appears where the money is genuinely owed — a cancelled booking whose
 * fee is still sitting paid. That pairing is how the cancellation rule records
 * "we owe her this", so the desk never has to work out whether a refund is due;
 * the panel is either there or it is not.
 */
export function RefundPanel({
  appointmentId,
  amountCents,
  cancelReason,
  viaGateway,
}: {
  appointmentId: string;
  amountCents: number;
  cancelReason: string;
  /** False when the fee arrived by hand, so there is nothing to reverse. */
  viaGateway: boolean;
}) {
  const [state, action, pending] = useActionState<RefundState, FormData>(refundDepositAction, {});
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <div className="card-pad border-cocoa-200 bg-cocoa-50 text-sm text-cocoa-700">
        <p className="font-semibold">Refunded</p>
        <p className="mt-1">{state.ok}</p>
      </div>
    );
  }

  return (
    <div className="card-pad space-y-2 border-clay-500/30 bg-clay-500/5">
      <p className="section-title">Reservation fee owed back</p>
      <p className="text-sm text-cocoa-700">
        This booking was cancelled in time, so the{' '}
        <strong className="num">{formatPeso(amountCents)}</strong> fee is refundable.{' '}
        {viaGateway
          ? 'It was paid through PayMongo and can be sent back from here.'
          : 'It was paid by hand, so there is nothing for PayMongo to reverse — mark it refunded here and send the money yourself.'}
      </p>

      {!open && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>
            Refund {formatPeso(amountCents)}
          </button>
          <span className="text-[11px] text-cocoa-400">
            Ask the guest first whether she would rather move the booking — a reschedule keeps
            the fee against her new date.
          </span>
        </div>
      )}

      {open && (
        <form action={action} className="space-y-2">
          <input type="hidden" name="id" value={appointmentId} />
          <label className="block">
            <span className="label">Why</span>
            <input name="reason" className="input" defaultValue={cancelReason}
              placeholder="Cancelled in time" />
          </label>
          <label className="block">
            <span className="label">Owner&apos;s approval PIN</span>
            <input name="approvalPin" type="password" inputMode="numeric" className="input"
              autoComplete="off" required />
            <span className="mt-1 block text-[11px] text-cocoa-400">
              Money leaving the business needs the Owner, the same as a void.
            </span>
          </label>

          {state.error && (
            <p role="alert" className="rounded-lg bg-clay-500/10 px-2 py-1.5 text-xs text-clay-500">
              {state.error}
            </p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={pending}>
              {pending ? 'Sending…' : `Refund ${formatPeso(amountCents)}`}
            </button>
            <button type="button" className="btn-ghost btn-sm" disabled={pending}
              onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
