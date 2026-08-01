'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { formatPeso, discountAmount } from '@/lib/money';
import { checkoutAction, type CheckoutState } from '../actions';

type Service = { id: string; name: string; priceCents: number; categoryName: string };
type Item = { id: string; name: string; priceCents: number; stockQty: number };
type Pkg = { id: string; name: string; priceCents: number; type: string };
type Preset = {
  id: string; name: string; type: 'PERCENT' | 'FIXED'; value: number;
  stackable: boolean; requiresId: boolean; membersOnly: boolean; isEmployeeRate: boolean;
};
type Simple = { id: string; name: string };

type Line = {
  key: string;
  type: 'SERVICE' | 'PRODUCT' | 'PACKAGE' | 'PREPAID_REDEMPTION' | 'PERK' | 'GIFT_CERTIFICATE';
  refId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  employeeId: string;
  clientPackageId?: string;
  birthdayPerk?: boolean;
};

type AppliedDiscount = {
  key: string;
  presetId: string | null;
  label: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  idNumber?: string;
  voucherCode?: string;
};

type PaymentRow = { key: string; method: string; amountPesos: string; reference: string };

type ClientContext = {
  client: { id: string; name: string; loyaltyPoints: number; pwdIdNumber: string; seniorIdNumber: string; incomplete: boolean } | null;
  alerts: { label: string; detail: string }[];
  membership: {
    id: string; name: string; discountPercent: number;
    birthdayPerkServiceId: string | null; birthdayPerkAvailable: boolean;
  } | null;
  prepaid: {
    clientPackageId: string; packageName: string; serviceId: string; serviceName: string;
    basePriceCents: number; remaining: number;
  }[];
  corporateAccounts: Simple[];
};

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'GCASH', label: 'GCash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CORPORATE_CHARGE', label: 'Charge to company' },
];

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

export function PosTerminal(props: {
  branchId: string;
  canApproveOwnDiscount: boolean;
  discountApprovalPercent: number;
  tipsEnabled: boolean;
  loyaltyPointValueCents: number;
  taxRegime: string;
  services: Service[];
  items: Item[];
  packages: Pkg[];
  presets: Preset[];
  clients: Simple[] & { mobile?: string }[];
  therapists: Simple[];
  corporates: Simple[];
  partners: Simple[];
  prefill?: {
    appointmentId?: string;
    clientId?: string;
    clientName?: string;
    depositCents?: number;
    lines?: { serviceId: string; name: string; priceCents: number; employeeId: string }[];
  };
  blocked: boolean;
}) {
  const [tab, setTab] = useState<'services' | 'products' | 'packages'>('services');
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<Line[]>(
    (props.prefill?.lines ?? []).map((l) => ({
      key: nextKey(),
      type: 'SERVICE',
      refId: l.serviceId,
      name: l.name,
      unitPriceCents: l.priceCents,
      quantity: 1,
      employeeId: l.employeeId,
    })),
  );
  const [clientId, setClientId] = useState(props.prefill?.clientId ?? '');
  const [clientQuery, setClientQuery] = useState('');
  const [ctx, setCtx] = useState<ClientContext | null>(null);
  const [discounts, setDiscounts] = useState<AppliedDiscount[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([
    { key: nextKey(), method: 'CASH', amountPesos: '', reference: '' },
  ]);
  const [tipPesos, setTipPesos] = useState('');
  const [gcCode, setGcCode] = useState('');
  const [gcApplied, setGcApplied] = useState<{ code: string; amountPesos: string }[]>([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState('');
  const [approvalPin, setApprovalPin] = useState('');
  const [corporateAccountId, setCorporateAccountId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [manualType, setManualType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [result, setResult] = useState<CheckoutState>({});
  const [pending, startTransition] = useTransition();

  // Pull the client's balances, perks and alerts as soon as they are picked.
  useEffect(() => {
    if (!clientId) { setCtx(null); return; }
    fetch(`/api/portal/client-context?clientId=${clientId}`)
      .then((r) => r.json())
      .then(setCtx)
      .catch(() => setCtx(null));
  }, [clientId]);

  const subtotal = lines.reduce((a, l) => a + l.unitPriceCents * l.quantity, 0);

  // Discounts apply sequentially to the running total; each is its own line.
  const discountRows = useMemo(() => {
    let running = subtotal;
    return discounts.map((d) => {
      const amount = discountAmount(running, d.type, d.type === 'FIXED' ? d.value * 100 : d.value);
      running -= amount;
      return { ...d, amountCents: amount };
    });
  }, [discounts, subtotal]);

  const discountTotal = discountRows.reduce((a, d) => a + d.amountCents, 0);
  const loyaltyRedeemCents =
    Math.min(
      Math.max(0, Number(loyaltyPoints) || 0),
      ctx?.client?.loyaltyPoints ?? 0,
    ) * props.loyaltyPointValueCents;
  const net = Math.max(0, subtotal - discountTotal - loyaltyRedeemCents);
  const tip = Math.round((Number(tipPesos) || 0) * 100);
  const total = net + tip;

  const depositCredit = Math.min(props.prefill?.depositCents ?? 0, total);
  const gcTotal = gcApplied.reduce((a, g) => a + Math.round((Number(g.amountPesos) || 0) * 100), 0);
  const paymentsTotal = payments.reduce((a, p) => a + Math.round((Number(p.amountPesos) || 0) * 100), 0);
  const due = Math.max(0, total - depositCredit - gcTotal);
  const change = Math.max(0, paymentsTotal - due);
  const short = Math.max(0, due - paymentsTotal);

  const manualPercentEquivalent =
    subtotal > 0
      ? discounts
          .filter((d) => !d.presetId && !d.voucherCode)
          .reduce((a, d) => a + (d.type === 'PERCENT' ? d.value : ((d.value * 100) / subtotal) * 100), 0)
      : 0;
  const needsPin = manualPercentEquivalent > props.discountApprovalPercent;

  function addLine(partial: Omit<Line, 'key' | 'quantity' | 'employeeId'> & { employeeId?: string }) {
    setLines((prev) => [
      ...prev,
      { key: nextKey(), quantity: 1, employeeId: partial.employeeId ?? '', ...partial },
    ]);
  }

  function togglePreset(p: Preset) {
    setDiscounts((prev) => {
      const existing = prev.find((d) => d.presetId === p.id);
      if (existing) return prev.filter((d) => d.presetId !== p.id);
      // Non-stackable presets (PWD / Senior by PH law) replace everything else.
      const base = p.stackable ? prev.filter((d) => {
        const other = props.presets.find((x) => x.id === d.presetId);
        return !other || other.stackable;
      }) : [];
      const idNumber = p.requiresId
        ? (/senior/i.test(p.name) ? ctx?.client?.seniorIdNumber : ctx?.client?.pwdIdNumber) ?? ''
        : '';
      return [
        ...base,
        { key: nextKey(), presetId: p.id, label: p.name, type: p.type, value: p.value, idNumber },
      ];
    });
  }

  function submit() {
    setResult({});
    const payload = {
      branchId: props.branchId,
      clientId: clientId || null,
      appointmentId: props.prefill?.appointmentId ?? null,
      corporateAccountId: corporateAccountId || null,
      partnerId: partnerId || null,
      applyDepositCredit: true,
      tipCents: tip,
      loyaltyPointsToRedeem: Math.max(0, Number(loyaltyPoints) || 0),
      approvalPin,
      lines: lines.map((l) => ({
        type: l.type,
        serviceId: ['SERVICE', 'PREPAID_REDEMPTION', 'PERK'].includes(l.type) ? l.refId : null,
        itemId: l.type === 'PRODUCT' ? l.refId : null,
        packageId: l.type === 'PACKAGE' ? l.refId : null,
        employeeId: l.employeeId || null,
        quantity: l.quantity,
        unitPriceCents: l.type === 'SERVICE' || l.type === 'PRODUCT' || l.type === 'PACKAGE'
          ? l.unitPriceCents
          : 0,
        clientPackageId: l.clientPackageId ?? null,
        birthdayPerk: l.birthdayPerk ?? false,
        description: l.name,
      })),
      discounts: discounts.map((d) => ({
        presetId: d.presetId,
        label: d.label,
        type: d.type,
        value: d.type === 'FIXED' ? Math.round(d.value * 100) : d.value,
        idNumber: d.idNumber ?? '',
        voucherCode: d.voucherCode ?? '',
      })),
      giftCertificateCodes: gcApplied.map((g) => ({
        code: g.code,
        amountCents: Math.round((Number(g.amountPesos) || 0) * 100),
      })),
      payments: payments
        .filter((p) => Number(p.amountPesos) > 0)
        .map((p) => ({
          method: p.method,
          amountCents: Math.round(Number(p.amountPesos) * 100),
          reference: p.reference,
        })),
    };

    startTransition(async () => {
      const res = await checkoutAction(JSON.stringify(payload));
      setResult(res);
      if (res.receiptNo) {
        setLines([]);
        setDiscounts([]);
        setPayments([{ key: nextKey(), method: 'CASH', amountPesos: '', reference: '' }]);
        setTipPesos('');
        setGcApplied([]);
        setLoyaltyPoints('');
        setApprovalPin('');
      }
    });
  }

  const catalog =
    tab === 'services'
      ? props.services.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
      : tab === 'products'
        ? props.items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
        : props.packages.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  const filteredClients = clientQuery
    ? props.clients.filter(
        (c) =>
          c.name.toLowerCase().includes(clientQuery.toLowerCase()) ||
          (c as { mobile?: string }).mobile?.includes(clientQuery.replace(/\D/g, '')),
      ).slice(0, 12)
    : [];

  if (result.receiptNo) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="card-pad">
          <p className="text-4xl">✓</p>
          <h1 className="mt-2 font-display text-xl font-semibold text-cocoa-800">Sale completed</h1>
          <p className="muted mt-1">Receipt {result.receiptNo}</p>
          {result.giftCertificateCodes && result.giftCertificateCodes.length > 0 && (
            <div className="mt-3 rounded-xl bg-sand-100 px-3 py-2 text-sm">
              <p className="font-semibold text-cocoa-700">Gift certificate codes issued</p>
              {result.giftCertificateCodes.map((c) => (
                <p key={c} className="num tracking-widest">{c}</p>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-2">
            <Link href={`/portal/sales/${result.saleId}`} className="btn-primary">
              Open &amp; print receipt
            </Link>
            <button className="btn-secondary" onClick={() => setResult({})}>
              Start another sale
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* ------------------------------------------------------- catalog */}
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(['services', 'products', 'packages'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`btn-sm ${tab === t ? 'btn-primary' : 'btn-secondary'} capitalize`}
            >
              {t}
            </button>
          ))}
          <input
            className="input flex-1"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {catalog.map((entry) => (
            <button
              key={entry.id}
              className="min-h-16 rounded-xl border border-sand-200 bg-white px-3 py-2 text-left transition hover:border-cocoa-400"
              onClick={() =>
                addLine({
                  type: tab === 'services' ? 'SERVICE' : tab === 'products' ? 'PRODUCT' : 'PACKAGE',
                  refId: entry.id,
                  name: entry.name,
                  unitPriceCents: entry.priceCents,
                })
              }
            >
              <span className="block text-sm font-medium leading-tight text-cocoa-800">{entry.name}</span>
              <span className="mt-1 block num text-xs text-cocoa-500">{formatPeso(entry.priceCents)}</span>
              {'stockQty' in entry && (
                <span className="block text-[11px] text-cocoa-400">{entry.stockQty} in stock</span>
              )}
            </button>
          ))}
        </div>

        {/* Prepaid sessions and the member birthday perk, when applicable. */}
        {ctx && (ctx.prepaid.length > 0 || ctx.membership?.birthdayPerkAvailable) && (
          <div className="mt-4 card-pad border-cocoa-200 bg-cocoa-50">
            <p className="section-title mb-2">This client&apos;s perks</p>
            <div className="flex flex-wrap gap-2">
              {ctx.prepaid.map((p) => (
                <button
                  key={`${p.clientPackageId}-${p.serviceId}`}
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    addLine({
                      type: 'PREPAID_REDEMPTION',
                      refId: p.serviceId,
                      name: `${p.serviceName} (prepaid session)`,
                      unitPriceCents: 0,
                      clientPackageId: p.clientPackageId,
                    })
                  }
                >
                  Use prepaid: {p.serviceName} ({p.remaining} left)
                </button>
              ))}
              {ctx.membership?.birthdayPerkAvailable && ctx.membership.birthdayPerkServiceId && (
                <button
                  className="btn-primary btn-sm"
                  onClick={() =>
                    addLine({
                      type: 'PERK',
                      refId: ctx.membership!.birthdayPerkServiceId!,
                      name: 'Birthday massage (member perk)',
                      unitPriceCents: 0,
                      birthdayPerk: true,
                    })
                  }
                >
                  🎂 Redeem birthday massage
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------- basket */}
      <div className="space-y-3">
        {/* client */}
        <div className="card-pad">
          <p className="label">Client</p>
          {ctx?.client ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-cocoa-800">{ctx.client.name}</p>
                <p className="text-xs text-cocoa-500">
                  {ctx.client.loyaltyPoints} pts
                  {ctx.membership ? ` · ${ctx.membership.name}` : ''}
                </p>
              </div>
              <button className="btn-ghost btn-sm" onClick={() => { setClientId(''); setCtx(null); }}>
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                className="input"
                placeholder="Search client, or leave blank for a walk-in"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
              />
              {filteredClients.length > 0 && (
                <ul className="mt-1 max-h-40 overflow-y-auto">
                  {filteredClients.map((c) => (
                    <li key={c.id}>
                      <button
                        className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sand-100"
                        onClick={() => { setClientId(c.id); setClientQuery(''); }}
                      >
                        {c.name}
                        <span className="ml-2 num text-xs text-cocoa-400">
                          {(c as { mobile?: string }).mobile}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {ctx && ctx.alerts.length > 0 && (
            <div className="mt-2 rounded-xl bg-clay-500/10 px-3 py-2 text-xs text-clay-500">
              <p className="font-semibold">Health alerts</p>
              <ul className="list-disc pl-4">
                {ctx.alerts.map((a) => (
                  <li key={a.label}>{a.label}: {a.detail}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* lines */}
        <div className="card-pad">
          <p className="label">Basket</p>
          {lines.length === 0 ? (
            <p className="muted">Tap a service or product to start.</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((l) => (
                <li key={l.key} className="rounded-xl border border-sand-200 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm font-medium text-cocoa-800">{l.name}</span>
                    <span className="num shrink-0 text-sm">
                      {formatPeso(l.unitPriceCents * l.quantity)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <div className="flex items-center gap-1">
                      <button className="btn-secondary btn-sm px-2"
                        onClick={() => setLines((p) => p.map((x) => x.key === l.key ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}>
                        −
                      </button>
                      <span className="num w-6 text-center text-sm">{l.quantity}</span>
                      <button className="btn-secondary btn-sm px-2"
                        onClick={() => setLines((p) => p.map((x) => x.key === l.key ? { ...x, quantity: x.quantity + 1 } : x))}>
                        +
                      </button>
                    </div>
                    {['SERVICE', 'PREPAID_REDEMPTION', 'PERK'].includes(l.type) && (
                      <select
                        className="select min-h-9 flex-1 py-1 text-xs"
                        value={l.employeeId}
                        onChange={(e) =>
                          setLines((p) => p.map((x) => x.key === l.key ? { ...x, employeeId: e.target.value } : x))
                        }
                      >
                        <option value="">Therapist…</option>
                        {props.therapists.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    )}
                    <button className="btn-ghost btn-sm text-clay-500"
                      onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* discounts */}
        <div className="card-pad space-y-2">
          <p className="label">Discounts (tap to apply — they stack in order)</p>
          <div className="flex flex-wrap gap-1.5">
            {props.presets.map((p) => {
              const on = discounts.some((d) => d.presetId === p.id);
              const highlight = p.membersOnly && ctx?.membership;
              return (
                <button
                  key={p.id}
                  onClick={() => togglePreset(p)}
                  className={`btn-sm ${on ? 'btn-primary' : highlight ? 'btn-secondary border-cocoa-500 text-cocoa-700' : 'btn-secondary'}`}
                  title={p.stackable ? 'Stackable' : 'Cannot be combined with other discounts'}
                >
                  {p.name}
                  {!p.stackable && <span className="ml-1 text-[10px] opacity-70">solo</span>}
                </button>
              );
            })}
          </div>

          {discountRows.filter((d) => d.presetId && props.presets.find((p) => p.id === d.presetId)?.requiresId).map((d) => (
            <label key={d.key} className="block">
              <span className="label">{d.label} — ID number (printed on the receipt)</span>
              <input
                className="input"
                value={d.idNumber ?? ''}
                onChange={(e) =>
                  setDiscounts((prev) => prev.map((x) => x.key === d.key ? { ...x, idNumber: e.target.value } : x))
                }
              />
            </label>
          ))}

          <details className="text-sm">
            <summary className="cursor-pointer text-cocoa-600">Manual / voucher discount</summary>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                <input className="input col-span-1" placeholder="Label" value={manualLabel}
                  onChange={(e) => setManualLabel(e.target.value)} />
                <select className="select" value={manualType} onChange={(e) => setManualType(e.target.value as 'PERCENT' | 'FIXED')}>
                  <option value="PERCENT">%</option>
                  <option value="FIXED">₱</option>
                </select>
                {/* step, or the browser marks a one-off 7.5% discount invalid. */}
                <input className="input" type="number" step="0.01" min={0} placeholder="Value"
                  value={manualValue} onChange={(e) => setManualValue(e.target.value)} />
              </div>
              <div className="flex gap-1.5">
                <button className="btn-secondary btn-sm"
                  onClick={() => {
                    if (!manualLabel || !Number(manualValue)) return;
                    setDiscounts((p) => [...p, {
                      key: nextKey(), presetId: null, label: manualLabel,
                      type: manualType, value: Number(manualValue),
                    }]);
                    setManualLabel(''); setManualValue('');
                  }}>
                  Add manual discount
                </button>
                <input className="input" placeholder="Voucher code"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const code = (e.target as HTMLInputElement).value.trim().toUpperCase();
                    if (!code) return;
                    setDiscounts((p) => [...p, {
                      key: nextKey(), presetId: null, label: `Voucher ${code}`,
                      type: 'FIXED', value: 0, voucherCode: code,
                    }]);
                    (e.target as HTMLInputElement).value = '';
                  }} />
              </div>
              {needsPin && (
                <label className="block">
                  <span className="label text-clay-500">
                    Manual discount is above {props.discountApprovalPercent}% — Owner approval PIN required
                  </span>
                  <input className="input" type="password" inputMode="numeric" value={approvalPin}
                    onChange={(e) => setApprovalPin(e.target.value)} />
                </label>
              )}
            </div>
          </details>

          {discountRows.map((d) => (
            <div key={d.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-cocoa-600">{d.label}</span>
              <span className="flex items-center gap-2">
                <span className="num text-cocoa-700">−{formatPeso(d.amountCents)}</span>
                <button className="btn-ghost btn-sm text-clay-500"
                  onClick={() => setDiscounts((p) => p.filter((x) => x.key !== d.key))}>
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>

        {/* totals */}
        <div className="card-pad space-y-1 text-sm">
          <Row label="Subtotal" value={formatPeso(subtotal)} />
          {discountTotal > 0 && <Row label="Discounts" value={`−${formatPeso(discountTotal)}`} />}
          {ctx?.client && ctx.client.loyaltyPoints > 0 && (
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-cocoa-500">
                Redeem loyalty ({ctx.client.loyaltyPoints} pts available)
              </span>
              <input className="input w-24 text-right" type="number" min={0}
                max={ctx.client.loyaltyPoints} value={loyaltyPoints}
                onChange={(e) => setLoyaltyPoints(e.target.value)} />
            </label>
          )}
          {loyaltyRedeemCents > 0 && <Row label="Loyalty redeemed" value={`−${formatPeso(loyaltyRedeemCents)}`} />}
          {props.tipsEnabled && (
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-cocoa-500">Tip</span>
              <input className="input w-24 text-right" type="number" min={0} step="0.01"
                value={tipPesos} onChange={(e) => setTipPesos(e.target.value)} />
            </label>
          )}
          <Row label="Total" value={formatPeso(total)} strong />
          {depositCredit > 0 && (
            <Row label="Reservation fee already paid" value={`−${formatPeso(depositCredit)}`} />
          )}
          {gcTotal > 0 && <Row label="Gift certificate" value={`−${formatPeso(gcTotal)}`} />}
          <Row label="Amount due" value={formatPeso(due)} strong />
        </div>

        {/* gift certificate */}
        <div className="card-pad space-y-2">
          <p className="label">Gift certificate</p>
          <div className="flex gap-1.5">
            <input className="input" placeholder="GC code" value={gcCode}
              onChange={(e) => setGcCode(e.target.value.toUpperCase())} />
            <button className="btn-secondary btn-sm"
              onClick={() => {
                if (!gcCode) return;
                setGcApplied((p) => [...p, { code: gcCode, amountPesos: String(due / 100) }]);
                setGcCode('');
              }}>
              Apply
            </button>
          </div>
          {gcApplied.map((g, i) => (
            <div key={g.code} className="flex items-center gap-1.5 text-sm">
              <span className="num flex-1">{g.code}</span>
              <input className="input w-24 text-right" type="number" step="0.01" value={g.amountPesos}
                onChange={(e) =>
                  setGcApplied((p) => p.map((x, xi) => xi === i ? { ...x, amountPesos: e.target.value } : x))
                } />
              <button className="btn-ghost btn-sm text-clay-500"
                onClick={() => setGcApplied((p) => p.filter((_, xi) => xi !== i))}>
                ×
              </button>
            </div>
          ))}
        </div>

        {/* payments */}
        <div className="card-pad space-y-2">
          <div className="flex items-center justify-between">
            <p className="label mb-0">Payment</p>
            <button className="btn-ghost btn-sm"
              onClick={() => setPayments((p) => [...p, { key: nextKey(), method: 'GCASH', amountPesos: '', reference: '' }])}>
              + Split
            </button>
          </div>
          {payments.map((p, i) => (
            <div key={p.key} className="space-y-1.5">
              <div className="flex gap-1.5">
                <select className="select flex-1" value={p.method}
                  onChange={(e) =>
                    setPayments((prev) => prev.map((x, xi) => xi === i ? { ...x, method: e.target.value } : x))
                  }>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input className="input w-28 text-right" type="number" step="0.01" placeholder="0.00"
                  value={p.amountPesos}
                  onChange={(e) =>
                    setPayments((prev) => prev.map((x, xi) => xi === i ? { ...x, amountPesos: e.target.value } : x))
                  } />
                {payments.length > 1 && (
                  <button className="btn-ghost btn-sm text-clay-500"
                    onClick={() => setPayments((prev) => prev.filter((_, xi) => xi !== i))}>
                    ×
                  </button>
                )}
              </div>
              {(p.method === 'GCASH' || p.method === 'BANK_TRANSFER') && (
                <input className="input" placeholder="Reference number (optional)" value={p.reference}
                  onChange={(e) =>
                    setPayments((prev) => prev.map((x, xi) => xi === i ? { ...x, reference: e.target.value } : x))
                  } />
              )}
              {p.method === 'CORPORATE_CHARGE' && (
                <select className="select" value={corporateAccountId}
                  onChange={(e) => setCorporateAccountId(e.target.value)}>
                  <option value="">Select the company…</option>
                  {(ctx?.corporateAccounts.length ? ctx.corporateAccounts : props.corporates).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          ))}

          <div className="flex gap-1.5">
            <button className="btn-secondary btn-sm flex-1"
              onClick={() => setPayments((p) => p.map((x, i) => i === 0 ? { ...x, amountPesos: String(due / 100) } : x))}>
              Exact {formatPeso(due)}
            </button>
            {[500, 1000, 2000].map((amount) => (
              <button key={amount} className="btn-secondary btn-sm"
                onClick={() => setPayments((p) => p.map((x, i) => i === 0 ? { ...x, amountPesos: String(amount) } : x))}>
                ₱{amount}
              </button>
            ))}
          </div>

          {short > 0 && <p className="text-sm text-clay-500">Short by {formatPeso(short)}</p>}
          {change > 0 && (
            <p className="rounded-xl bg-cocoa-100 px-3 py-2 text-sm font-semibold text-cocoa-700">
              Change: {formatPeso(change)}
            </p>
          )}
        </div>

        {props.partners.length > 0 && (
          <details className="card-pad text-sm">
            <summary className="cursor-pointer text-cocoa-600">Tag to a partner</summary>
            <select className="select mt-2" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">— none —</option>
              {props.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </details>
        )}

        {result.error && (
          <p role="alert" className="rounded-xl bg-clay-500/10 px-3 py-2 text-sm text-clay-500">
            {result.error}
          </p>
        )}

        <button
          className="btn-primary w-full text-base"
          disabled={pending || props.blocked || lines.length === 0 || short > 0}
          onClick={submit}
        >
          {pending ? 'Charging…' : `Charge ${formatPeso(due)}`}
        </button>
        {props.taxRegime === 'NON_VAT_8' && (
          <p className="text-center text-[11px] text-cocoa-400">
            Non-VAT sales invoice · not valid for claim of input tax
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-cocoa-500">{label}</span>
      <span className={`num ${strong ? 'font-semibold text-cocoa-800' : 'text-cocoa-700'}`}>{value}</span>
    </div>
  );
}
