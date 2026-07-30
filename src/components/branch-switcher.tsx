'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Owner-only. Adds ?branchId= to the current page (or `all` for the
 * consolidated view). Server pages re-scope their queries from that param;
 * non-Owner roles are pinned to their own branch server-side regardless.
 */
export function BranchSwitcher({
  branches,
  allowAll = true,
}: {
  branches: { id: string; name: string }[];
  allowAll?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params?.get('branchId') ?? (allowAll ? 'all' : branches[0]?.id);

  return (
    <label className="block">
      <span className="label">Branch</span>
      <select
        className="select"
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(params?.toString());
          next.set('branchId', e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {allowAll && <option value="all">All branches (consolidated)</option>}
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
