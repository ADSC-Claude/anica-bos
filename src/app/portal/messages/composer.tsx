'use client';

import { useRef } from 'react';
import { sendMessageAction } from './actions';

export function MessageComposer({ toUserId }: { toUserId: string }) {
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={async (formData) => {
        await sendMessageAction(formData);
        ref.current?.reset();
      }}
      className="flex gap-2"
    >
      <input type="hidden" name="toUserId" value={toUserId} />
      <input name="body" className="input" placeholder="Write a message…" autoComplete="off" required />
      <button className="btn-primary" type="submit">Send</button>
    </form>
  );
}
