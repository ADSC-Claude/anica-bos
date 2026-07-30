/**
 * Checkout engine.
 *
 * One call turns a basket into: a numbered receipt, therapist commissions,
 * loyalty points, inventory deductions, package/GC/voucher movements, the
 * finance income entry and its double-entry journal — with no re-entry
 * anywhere else in the system.
 *
 * Deliberately free of `server-only` so the seed script can drive it directly
 * and produce a demo database that is internally consistent.
 */
import type {
  DiscountType,
  PaymentMethod,
  SaleLineType,
  TaxRegime,
  Prisma,
} from '@prisma/client';
import { prisma } from './db';
import { discountAmount } from './money';
import { businessDate, dateKeyToBusinessDate, isBirthdayMonth } from './datetime';
import { PAYMENT_ACCOUNT, postJournal } from './accounting';
import { giftCertificateCode } from './codes';

export type CheckoutLineInput = {
  type: SaleLineType;
  serviceId?: string | null;
  itemId?: string | null;
  packageId?: string | null;
  employeeId?: string | null;
  quantity?: number;
  /** Overrides the catalog price when the receptionist edits it. */
  unitPriceCents?: number | null;
  /** Redeem a prepaid session from this client package. */
  clientPackageId?: string | null;
  /** Redeem the member birthday perk (₱0 line, commission still credited). */
  birthdayPerk?: boolean;
  description?: string;
};

export type CheckoutDiscountInput = {
  presetId?: string | null;
  label: string;
  type: DiscountType;
  value: number;
  idNumber?: string;
  voucherCode?: string;
  approvedByUserId?: string | null;
};

export type CheckoutPaymentInput = {
  method: PaymentMethod;
  amountCents: number;
  reference?: string;
};

export type CheckoutInput = {
  branchId: string;
  cashierId: string;
  cashierName?: string;
  clientId?: string | null;
  appointmentId?: string | null;
  corporateAccountId?: string | null;
  partnerId?: string | null;
  employeeRateEmployeeId?: string | null;
  lines: CheckoutLineInput[];
  discounts?: CheckoutDiscountInput[];
  payments: CheckoutPaymentInput[];
  tipCents?: number;
  /** Gift certificates presented as payment. */
  giftCertificateCodes?: { code: string; amountCents: number }[];
  /** Apply a verified reservation deposit from the linked appointment. */
  applyDepositCredit?: boolean;
  loyaltyPointsToRedeem?: number;
  /** Manila date key; defaults to today. */
  businessDateKey?: string;
  /** Gift certificates being SOLD on this receipt. */
  giftCertificatesSold?: { faceValueCents: number; serviceId?: string | null }[];
};

export type CheckoutResult = {
  saleId: string;
  receiptNo: string;
  totalCents: number;
  changeCents: number;
  loyaltyEarned: number;
  giftCertificateCodes: string[];
};

export class CheckoutError extends Error {}

const CENTS = (n: number) => Math.round(n);

/** Commission rule resolution: employee override → service rule → global default. */
async function resolveCommission(
  tx: Prisma.TransactionClient,
  opts: {
    employeeId: string;
    serviceId: string | null;
    defaultPercent: number;
    serviceCommissionType: DiscountType | null;
    serviceCommissionValue: number | null;
  },
): Promise<{ type: DiscountType; value: number }> {
  const override = await tx.employeeCommissionRule.findFirst({
    where: {
      employeeId: opts.employeeId,
      OR: [{ serviceId: opts.serviceId }, { serviceId: null }],
    },
    orderBy: { serviceId: 'desc' }, // service-specific rule wins over the blanket one
  });
  if (override) return { type: override.type, value: override.value };
  if (opts.serviceCommissionType && opts.serviceCommissionValue !== null) {
    return { type: opts.serviceCommissionType, value: opts.serviceCommissionValue };
  }
  return { type: 'PERCENT', value: opts.defaultPercent };
}

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  if (!input.lines.length) throw new CheckoutError('Add at least one item before charging.');

  const bizDate = input.businessDateKey
    ? dateKeyToBusinessDate(input.businessDateKey)
    : businessDate();

  // Refuse to post into a day the receptionist has already closed.
  const closed = await prisma.eodClosing.findUnique({
    where: { branchId_businessDate: { branchId: input.branchId, businessDate: bizDate } },
    select: { id: true },
  });
  if (closed) {
    throw new CheckoutError(
      'That business day has already been closed (EOD). Ask the Owner or Manager to reopen it.',
    );
  }

  const settingRows = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'payroll.commissionPercent',
          'loyalty.enabled',
          'loyalty.pesosPerPoint',
          'loyalty.pointValueCents',
          'tax.regime',
          'tax.vatPercent',
          'inventory.autoDeductRecipes',
          'membership.validityDays',
        ],
      },
      branchId: null,
    },
  });
  const s = Object.fromEntries(settingRows.map((r) => [r.key, r.value])) as Record<string, unknown>;
  const defaultCommissionPercent = Number(s['payroll.commissionPercent'] ?? 25);
  const loyaltyEnabled = s['loyalty.enabled'] !== false;
  const pesosPerPoint = Number(s['loyalty.pesosPerPoint'] ?? 100);
  const pointValueCents = Number(s['loyalty.pointValueCents'] ?? 100);
  const taxRegime = (s['tax.regime'] ?? 'NON_VAT_8') as TaxRegime;
  const vatPercent = Number(s['tax.vatPercent'] ?? 12);
  const autoDeduct = s['inventory.autoDeductRecipes'] !== false;
  const membershipValidityDays = Number(s['membership.validityDays'] ?? 365);

  return prisma.$transaction(
    async (tx) => {
      // ---------------------------------------------------------------- lines
      const serviceIds = input.lines.map((l) => l.serviceId).filter(Boolean) as string[];
      const itemIds = input.lines.map((l) => l.itemId).filter(Boolean) as string[];
      const packageIds = input.lines.map((l) => l.packageId).filter(Boolean) as string[];

      const [services, items, packages] = await Promise.all([
        serviceIds.length
          ? tx.service.findMany({ where: { id: { in: serviceIds } }, include: { recipes: true } })
          : Promise.resolve([]),
        itemIds.length ? tx.item.findMany({ where: { id: { in: itemIds } } }) : Promise.resolve([]),
        packageIds.length
          ? tx.package.findMany({ where: { id: { in: packageIds } }, include: { items: true } })
          : Promise.resolve([]),
      ]);
      const serviceById = new Map(services.map((x) => [x.id, x]));
      const itemById = new Map(items.map((x) => [x.id, x]));
      const packageById = new Map(packages.map((x) => [x.id, x]));

      type Built = {
        input: CheckoutLineInput;
        type: SaleLineType;
        description: string;
        quantity: number;
        unitPriceCents: number;
        basePriceCents: number;
        lineTotalCents: number;
        cogsCents: number;
        employeeId: string | null;
        serviceId: string | null;
        itemId: string | null;
        packageId: string | null;
      };

      const built: Built[] = [];
      const stockDeductions: { itemId: string; qty: number; unitCostCents: number; reason: string }[] = [];

      for (const line of input.lines) {
        const qty = Math.max(1, line.quantity ?? 1);
        let description = line.description ?? '';
        let base = 0;
        let unit = 0;
        let cogs = 0;

        if (line.type === 'SERVICE' || line.type === 'PREPAID_REDEMPTION' || line.type === 'PERK') {
          const svc = line.serviceId ? serviceById.get(line.serviceId) : null;
          if (!svc) throw new CheckoutError('One of the services is no longer in the catalog.');
          description = description || svc.name;
          base = svc.priceCents;
          unit =
            line.type === 'SERVICE'
              ? (line.unitPriceCents ?? svc.priceCents)
              : 0; // prepaid sessions and perks bill at ₱0
          if (autoDeduct) {
            for (const r of svc.recipes) {
              stockDeductions.push({
                itemId: r.itemId,
                qty: r.quantity * qty,
                unitCostCents: 0,
                reason: `Service consumption — ${svc.name}`,
              });
            }
          }
        } else if (line.type === 'PRODUCT') {
          const item = line.itemId ? itemById.get(line.itemId) : null;
          if (!item) throw new CheckoutError('One of the products is no longer in inventory.');
          if (!item.sellable) throw new CheckoutError(`${item.name} is not a retail product.`);
          description = description || item.name;
          base = item.retailPriceCents;
          unit = line.unitPriceCents ?? item.retailPriceCents;
          cogs = item.costCents * qty;
          stockDeductions.push({
            itemId: item.id,
            qty,
            unitCostCents: item.costCents,
            reason: 'Retail sale',
          });
        } else if (line.type === 'PACKAGE') {
          const pkg = line.packageId ? packageById.get(line.packageId) : null;
          if (!pkg) throw new CheckoutError('That package is no longer available.');
          description = description || pkg.name;
          base = pkg.priceCents;
          unit = line.unitPriceCents ?? pkg.priceCents;
        } else if (line.type === 'GIFT_CERTIFICATE') {
          base = line.unitPriceCents ?? 0;
          unit = base;
          description = description || 'Gift certificate';
        }

        built.push({
          input: line,
          type: line.type,
          description,
          quantity: qty,
          unitPriceCents: CENTS(unit),
          basePriceCents: CENTS(base),
          lineTotalCents: CENTS(unit * qty),
          cogsCents: CENTS(cogs),
          employeeId: line.employeeId ?? null,
          serviceId: line.serviceId ?? null,
          itemId: line.itemId ?? null,
          packageId: line.packageId ?? null,
        });
      }

      const subtotalCents = built.reduce((a, b) => a + b.lineTotalCents, 0);

      // ------------------------------------------------------------ discounts
      const rawDiscounts = input.discounts ?? [];
      if (rawDiscounts.length > 1) {
        const presetIds = rawDiscounts.map((d) => d.presetId).filter(Boolean) as string[];
        if (presetIds.length) {
          const presets = await tx.discountPreset.findMany({
            where: { id: { in: presetIds } },
            select: { id: true, name: true, stackable: true },
          });
          const blocking = presets.find((p) => !p.stackable);
          if (blocking) {
            throw new CheckoutError(
              `${blocking.name} cannot be combined with other discounts. Remove the others first.`,
            );
          }
        }
      }

      let running = subtotalCents;
      const appliedDiscounts: {
        presetId: string | null;
        label: string;
        type: DiscountType;
        value: number;
        amountCents: number;
        sequence: number;
        idNumber: string;
        voucherCode: string;
        approvedByUserId: string | null;
      }[] = [];

      rawDiscounts.forEach((d, i) => {
        const amount = discountAmount(running, d.type, d.value);
        running -= amount;
        appliedDiscounts.push({
          presetId: d.presetId ?? null,
          label: d.label,
          type: d.type,
          value: d.value,
          amountCents: amount,
          sequence: i,
          idNumber: d.idNumber ?? '',
          voucherCode: d.voucherCode ?? '',
          approvedByUserId: d.approvedByUserId ?? null,
        });
      });

      // Loyalty redemption behaves as a final discount line.
      let loyaltyRedeemed = 0;
      if (loyaltyEnabled && input.loyaltyPointsToRedeem && input.clientId) {
        const client = await tx.client.findUnique({
          where: { id: input.clientId },
          select: { loyaltyPoints: true },
        });
        const points = Math.min(input.loyaltyPointsToRedeem, client?.loyaltyPoints ?? 0);
        const value = Math.min(running, points * pointValueCents);
        const usablePoints = Math.floor(value / pointValueCents);
        if (usablePoints > 0) {
          loyaltyRedeemed = usablePoints;
          const amount = usablePoints * pointValueCents;
          running -= amount;
          appliedDiscounts.push({
            presetId: null,
            label: `Loyalty points (${usablePoints} pts)`,
            type: 'FIXED',
            value: amount,
            amountCents: amount,
            sequence: appliedDiscounts.length,
            idNumber: '',
            voucherCode: '',
            approvedByUserId: null,
          });
        }
      }

      const discountCents = appliedDiscounts.reduce((a, b) => a + b.amountCents, 0);
      const tipCents = Math.max(0, CENTS(input.tipCents ?? 0));
      const netCents = subtotalCents - discountCents;
      const totalCents = netCents + tipCents;

      // -------------------------------------------------------- credits & pay
      const payments: CheckoutPaymentInput[] = input.payments.map((p) => ({
        ...p,
        amountCents: CENTS(p.amountCents),
      }));

      // Reservation deposit already collected online.
      let depositCreditCents = 0;
      let appointment: Awaited<ReturnType<typeof tx.appointment.findUnique>> = null;
      if (input.appointmentId) {
        appointment = await tx.appointment.findUnique({ where: { id: input.appointmentId } });
        if (
          appointment &&
          input.applyDepositCredit !== false &&
          appointment.depositStatus === 'PAID' &&
          !appointment.depositAppliedSaleId
        ) {
          depositCreditCents = Math.min(appointment.depositPaidCents, totalCents);
          if (depositCreditCents > 0) {
            payments.unshift({ method: 'DEPOSIT_CREDIT', amountCents: depositCreditCents });
          }
        }
      }

      // Gift certificates presented as payment.
      const gcApplications: { id: string; amountCents: number }[] = [];
      for (const gcInput of input.giftCertificateCodes ?? []) {
        const gc = await tx.giftCertificate.findUnique({
          where: { code: gcInput.code.trim().toUpperCase() },
        });
        if (!gc) throw new CheckoutError(`Gift certificate ${gcInput.code} was not found.`);
        if (gc.status === 'FULLY_USED' || gc.balanceCents <= 0) {
          throw new CheckoutError(`Gift certificate ${gc.code} has already been fully used.`);
        }
        if (gc.expiresAt && gc.expiresAt < new Date()) {
          throw new CheckoutError(`Gift certificate ${gc.code} expired on ${gc.expiresAt.toDateString()}.`);
        }
        const apply = Math.min(gc.balanceCents, CENTS(gcInput.amountCents));
        if (apply <= 0) continue;
        gcApplications.push({ id: gc.id, amountCents: apply });
        payments.push({ method: 'GIFT_CERTIFICATE', amountCents: apply, reference: gc.code });
      }

      const paidCents = payments.reduce((a, b) => a + b.amountCents, 0);
      if (paidCents < totalCents) {
        throw new CheckoutError(
          `Payments are short by ₱${((totalCents - paidCents) / 100).toFixed(2)}.`,
        );
      }
      const overpay = paidCents - totalCents;
      const cashPaid = payments
        .filter((p) => p.method === 'CASH')
        .reduce((a, b) => a + b.amountCents, 0);
      if (overpay > cashPaid) {
        throw new CheckoutError('Only cash may be overpaid — change cannot be given on other methods.');
      }
      const changeCents = overpay;

      if (payments.some((p) => p.method === 'CORPORATE_CHARGE')) {
        if (!input.corporateAccountId) {
          throw new CheckoutError('Select the corporate account before charging to it.');
        }
        const account = await tx.corporateAccount.findUnique({
          where: { id: input.corporateAccountId },
        });
        if (!account || !account.active) throw new CheckoutError('That corporate account is inactive.');
        if (account.creditLimitCents > 0) {
          const charged = await tx.payment.aggregate({
            _sum: { amountCents: true },
            where: {
              method: 'CORPORATE_CHARGE',
              sale: { corporateAccountId: account.id, status: 'PAID' },
            },
          });
          const settled = await tx.corporatePayment.aggregate({
            _sum: { amountCents: true },
            where: { accountId: account.id },
          });
          const outstanding =
            (charged._sum.amountCents ?? 0) - (settled._sum.amountCents ?? 0);
          const requested = payments
            .filter((p) => p.method === 'CORPORATE_CHARGE')
            .reduce((a, b) => a + b.amountCents, 0);
          if (outstanding + requested > account.creditLimitCents) {
            throw new CheckoutError(
              `${account.name} would exceed its credit limit. Outstanding ₱${(outstanding / 100).toFixed(2)} of ₱${(account.creditLimitCents / 100).toFixed(2)}.`,
            );
          }
        }
      }

      // ------------------------------------------------------------- receipt #
      const series = await tx.receiptSeries.findFirst({
        where: { branchId: input.branchId, active: true },
        orderBy: { prefix: 'asc' },
      });
      if (!series) throw new CheckoutError('No active receipt series configured for this branch.');
      if (series.next > series.rangeEnd) {
        throw new CheckoutError(
          'The BIR receipt series for this branch is exhausted. Register a new series in Settings.',
        );
      }
      const sequence = series.next;
      const receiptNo = `${series.prefix}-${String(sequence).padStart(6, '0')}`;
      await tx.receiptSeries.update({
        where: { id: series.id },
        data: { next: { increment: 1 } },
      });

      // ------------------------------------------------------------------ VAT
      let vatableSalesCents = 0;
      let vatExemptSalesCents = 0;
      let vatAmountCents = 0;
      if (taxRegime === 'VAT_REGISTERED') {
        // PH prices are VAT-inclusive; back out the VAT from the net amount.
        const exempt = appliedDiscounts.some((d) => d.idNumber) ? netCents : 0;
        const vatable = netCents - exempt;
        vatAmountCents = Math.round(vatable - vatable / (1 + vatPercent / 100));
        vatableSalesCents = vatable - vatAmountCents;
        vatExemptSalesCents = exempt;
      }

      // ------------------------------------------------------------- the sale
      const sale = await tx.sale.create({
        data: {
          branchId: input.branchId,
          seriesId: series.id,
          receiptNo,
          sequence,
          clientId: input.clientId ?? null,
          appointmentId: input.appointmentId ?? null,
          corporateAccountId: input.corporateAccountId ?? null,
          partnerId: input.partnerId ?? null,
          employeeRateEmployeeId: input.employeeRateEmployeeId ?? null,
          cashierId: input.cashierId,
          subtotalCents,
          discountCents,
          depositCreditCents,
          tipCents,
          totalCents,
          paidCents,
          changeCents,
          taxRegime,
          vatableSalesCents,
          vatExemptSalesCents,
          vatAmountCents,
          businessDate: bizDate,
        },
      });

      // lines + commissions
      let cogsTotal = 0;
      const commissionByEmployee = new Map<string, number>();

      for (const [index, b] of built.entries()) {
        const line = await tx.saleLine.create({
          data: {
            saleId: sale.id,
            type: b.type,
            serviceId: b.serviceId,
            itemId: b.itemId,
            packageId: b.packageId,
            employeeId: b.employeeId,
            description: b.description,
            quantity: b.quantity,
            unitPriceCents: b.unitPriceCents,
            basePriceCents: b.basePriceCents,
            lineTotalCents: b.lineTotalCents,
            cogsCents: b.cogsCents,
            sortRank: index,
          },
        });
        cogsTotal += b.cogsCents;

        // Commission is always computed on the UNDISCOUNTED base price, and is
        // credited even for ₱0 perk / prepaid redemptions.
        const commissionable =
          b.employeeId &&
          (b.type === 'SERVICE' || b.type === 'PREPAID_REDEMPTION' || b.type === 'PERK');
        if (commissionable && b.employeeId) {
          const svc = b.serviceId ? serviceById.get(b.serviceId) : null;
          const rule = await resolveCommission(tx, {
            employeeId: b.employeeId,
            serviceId: b.serviceId,
            defaultPercent: defaultCommissionPercent,
            serviceCommissionType: svc?.commissionType ?? null,
            serviceCommissionValue: svc?.commissionValue ?? null,
          });
          const basis = b.basePriceCents * b.quantity;
          const amount = discountAmount(
            basis,
            rule.type,
            rule.type === 'FIXED' ? rule.value * b.quantity : rule.value,
          );
          if (amount > 0) {
            await tx.commission.create({
              data: {
                employeeId: b.employeeId,
                saleId: sale.id,
                saleLineId: line.id,
                basisCents: basis,
                rateType: rule.type,
                rateValue: rule.value,
                amountCents: amount,
                businessDate: bizDate,
              },
            });
            commissionByEmployee.set(
              b.employeeId,
              (commissionByEmployee.get(b.employeeId) ?? 0) + amount,
            );
          }
        }

        // Prepaid session redemption.
        if (b.type === 'PREPAID_REDEMPTION' && b.input.clientPackageId && b.serviceId) {
          const ent = await tx.clientPackageEntitlement.findUnique({
            where: {
              clientPackageId_serviceId: {
                clientPackageId: b.input.clientPackageId,
                serviceId: b.serviceId,
              },
            },
            include: { clientPackage: true },
          });
          if (!ent) throw new CheckoutError('That package does not include the selected service.');
          if (ent.clientPackage.status !== 'ACTIVE') {
            throw new CheckoutError('That package is no longer active.');
          }
          if (ent.clientPackage.expiresAt < new Date()) {
            throw new CheckoutError('That package has expired and can no longer be redeemed.');
          }
          if (ent.usedSessions + b.quantity > ent.totalSessions) {
            throw new CheckoutError('Not enough prepaid sessions left on that package.');
          }
          await tx.clientPackageEntitlement.update({
            where: { id: ent.id },
            data: { usedSessions: { increment: b.quantity } },
          });
          const remaining = await tx.clientPackageEntitlement.aggregate({
            _sum: { totalSessions: true, usedSessions: true },
            where: { clientPackageId: ent.clientPackageId },
          });
          if (
            (remaining._sum.totalSessions ?? 0) - (remaining._sum.usedSessions ?? 0) <= 0
          ) {
            await tx.clientPackage.update({
              where: { id: ent.clientPackageId },
              data: { status: 'USED_UP' },
            });
          }
        }

        // Member birthday perk.
        if (b.type === 'PERK' && b.input.birthdayPerk && input.clientId) {
          const membership = await tx.clientPackage.findFirst({
            where: {
              clientId: input.clientId,
              status: 'ACTIVE',
              expiresAt: { gte: new Date() },
              package: { type: 'MEMBERSHIP' },
            },
            include: { client: true },
          });
          if (!membership) throw new CheckoutError('This client has no active membership.');
          if (!isBirthdayMonth(membership.client.birthday)) {
            throw new CheckoutError('The birthday perk is only redeemable during the birthday month.');
          }
          const year = new Date().getUTCFullYear();
          if (membership.birthdayPerkUsedYear === year) {
            throw new CheckoutError('The birthday perk has already been used this membership year.');
          }
          await tx.clientPackage.update({
            where: { id: membership.id },
            data: { birthdayPerkUsedYear: year },
          });
        }

        // Package / membership purchase creates the client entitlement.
        if (b.type === 'PACKAGE' && b.packageId && input.clientId) {
          const pkg = packageById.get(b.packageId)!;
          const validityDays =
            pkg.type === 'MEMBERSHIP' ? membershipValidityDays : pkg.validityDays;
          const expiresAt = new Date(Date.now() + validityDays * 86_400_000);
          for (let i = 0; i < b.quantity; i++) {
            const cp = await tx.clientPackage.create({
              data: {
                clientId: input.clientId,
                packageId: pkg.id,
                saleId: sale.id,
                expiresAt,
              },
            });
            if (pkg.items.length) {
              await tx.clientPackageEntitlement.createMany({
                data: pkg.items.map((pi) => ({
                  clientPackageId: cp.id,
                  serviceId: pi.serviceId,
                  totalSessions: pi.sessions,
                })),
              });
            }
          }
        }
      }

      // Gift certificates sold on this receipt.
      const soldCodes: string[] = [];
      for (const gc of input.giftCertificatesSold ?? []) {
        let code = giftCertificateCode();
        // Extremely unlikely, but never issue a duplicate code.
        while (await tx.giftCertificate.findUnique({ where: { code }, select: { id: true } })) {
          code = giftCertificateCode();
        }
        await tx.giftCertificate.create({
          data: {
            code,
            faceValueCents: gc.faceValueCents,
            balanceCents: gc.faceValueCents,
            serviceId: gc.serviceId ?? null,
            soldSaleId: sale.id,
            buyerClientId: input.clientId ?? null,
            expiresAt: new Date(Date.now() + 365 * 86_400_000),
          },
        });
        soldCodes.push(code);
      }

      // Gift certificates redeemed.
      for (const app of gcApplications) {
        const gc = await tx.giftCertificate.update({
          where: { id: app.id },
          data: { balanceCents: { decrement: app.amountCents } },
        });
        await tx.giftCertificate.update({
          where: { id: app.id },
          data: {
            status: gc.balanceCents <= 0 ? 'FULLY_USED' : 'PARTIALLY_USED',
          },
        });
        await tx.giftCertificateRedemption.create({
          data: { gcId: app.id, saleId: sale.id, amountCents: app.amountCents },
        });
      }

      // Vouchers redeemed (applied above as discounts).
      for (const d of appliedDiscounts.filter((x) => x.voucherCode)) {
        const voucher = await tx.voucher.findUnique({ where: { code: d.voucherCode } });
        if (!voucher) throw new CheckoutError(`Voucher ${d.voucherCode} was not found.`);
        if (voucher.status !== 'ACTIVE' && voucher.status !== 'PARTIALLY_USED') {
          throw new CheckoutError(`Voucher ${d.voucherCode} is ${voucher.status.toLowerCase()}.`);
        }
        if (voucher.expiresAt && voucher.expiresAt < new Date()) {
          throw new CheckoutError(`Voucher ${d.voucherCode} has expired.`);
        }
        if (voucher.usesCount + 1 > voucher.usesAllowed) {
          throw new CheckoutError(`Voucher ${d.voucherCode} has no uses left.`);
        }
        const usesCount = voucher.usesCount + 1;
        await tx.voucher.update({
          where: { id: voucher.id },
          data: {
            usesCount,
            status: usesCount >= voucher.usesAllowed ? 'FULLY_USED' : 'PARTIALLY_USED',
          },
        });
        await tx.voucherRedemption.create({
          data: { voucherId: voucher.id, saleId: sale.id, amountCents: d.amountCents },
        });
      }

      await tx.saleDiscount.createMany({
        data: appliedDiscounts.map((d) => ({ ...d, saleId: sale.id })),
      });
      await tx.payment.createMany({
        data: payments.map((p) => ({
          saleId: sale.id,
          method: p.method,
          amountCents: p.amountCents,
          reference: p.reference ?? '',
        })),
      });

      // ------------------------------------------------------------ inventory
      const merged = new Map<string, { qty: number; unitCostCents: number; reason: string }>();
      for (const d of stockDeductions) {
        const prev = merged.get(d.itemId);
        merged.set(d.itemId, {
          qty: (prev?.qty ?? 0) + d.qty,
          unitCostCents: d.unitCostCents || prev?.unitCostCents || 0,
          reason: d.reason,
        });
      }
      for (const [itemId, d] of merged) {
        const item = await tx.item.update({
          where: { id: itemId },
          data: { stockQty: { decrement: d.qty } },
        });
        const unitCost = d.unitCostCents || item.costCents;
        // Consumable usage is COGS too — this is what makes the P&L real.
        const usageCogs = Math.round(unitCost * d.qty);
        if (!itemIds.includes(itemId)) cogsTotal += usageCogs;
        await tx.stockMovement.create({
          data: {
            branchId: input.branchId,
            itemId,
            type: itemIds.includes(itemId) ? 'SALE' : 'USAGE',
            quantity: -d.qty,
            unitCostCents: unitCost,
            reason: d.reason,
            refType: 'sale',
            refId: sale.id,
            userId: input.cashierId,
            userName: input.cashierName ?? '',
          },
        });
      }

      await tx.sale.update({ where: { id: sale.id }, data: { cogsCents: cogsTotal } });

      // -------------------------------------------------------------- loyalty
      let loyaltyEarned = 0;
      if (loyaltyEnabled && input.clientId) {
        loyaltyEarned = Math.floor(netCents / 100 / pesosPerPoint);
        const delta = loyaltyEarned - loyaltyRedeemed;
        if (loyaltyEarned > 0) {
          await tx.loyaltyTransaction.create({
            data: {
              clientId: input.clientId,
              saleId: sale.id,
              points: loyaltyEarned,
              reason: `Earned on ${receiptNo}`,
            },
          });
        }
        if (loyaltyRedeemed > 0) {
          await tx.loyaltyTransaction.create({
            data: {
              clientId: input.clientId,
              saleId: sale.id,
              points: -loyaltyRedeemed,
              reason: `Redeemed on ${receiptNo}`,
            },
          });
        }
        if (delta !== 0) {
          await tx.client.update({
            where: { id: input.clientId },
            data: { loyaltyPoints: { increment: delta } },
          });
        }
      }

      // ---------------------------------------------------------- appointment
      if (appointment) {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: {
            status: 'COMPLETED',
            completedAt: appointment.completedAt ?? new Date(),
            depositAppliedSaleId: depositCreditCents > 0 ? sale.id : appointment.depositAppliedSaleId,
          },
        });
      }

      // -------------------------------------------------------------- journal
      const revenueLines: { code: string; credit: number }[] = [];
      const serviceRevenue = built
        .filter((b) => b.type === 'SERVICE' || b.type === 'PREPAID_REDEMPTION' || b.type === 'PERK')
        .reduce((a, b) => a + b.lineTotalCents, 0);
      const productRevenue = built
        .filter((b) => b.type === 'PRODUCT')
        .reduce((a, b) => a + b.lineTotalCents, 0);
      const packageRevenue = built
        .filter((b) => b.type === 'PACKAGE' || b.type === 'GIFT_CERTIFICATE')
        .reduce((a, b) => a + b.lineTotalCents, 0);

      // Revenue is credited gross of discount (the contra account carries the
      // discount) and net of output VAT.
      const vatShare = (portion: number) =>
        subtotalCents === 0 ? 0 : Math.round((vatAmountCents * portion) / subtotalCents);
      const svcVat = vatShare(serviceRevenue);
      const prodVat = vatShare(productRevenue);
      const pkgVat = vatAmountCents - svcVat - prodVat;

      if (serviceRevenue) revenueLines.push({ code: '4000', credit: serviceRevenue - svcVat });
      if (productRevenue) revenueLines.push({ code: '4100', credit: productRevenue - prodVat });
      if (packageRevenue) revenueLines.push({ code: '4200', credit: packageRevenue - pkgVat });

      const paymentDebits = new Map<string, number>();
      for (const p of payments) {
        const code = PAYMENT_ACCOUNT[p.method];
        // Change given back reduces the cash actually received.
        const amount =
          p.method === 'CASH' ? p.amountCents - changeCents : p.amountCents;
        paymentDebits.set(code, (paymentDebits.get(code) ?? 0) + amount);
      }

      await postJournal(tx, {
        branchId: input.branchId,
        source: 'SALES',
        entryDate: bizDate,
        reference: receiptNo,
        memo: `POS sale ${receiptNo}`,
        saleId: sale.id,
        createdBy: input.cashierName ?? input.cashierId,
        lines: [
          ...[...paymentDebits].map(([code, amount]) => ({ code, debit: amount })),
          ...(discountCents ? [{ code: '4900', debit: discountCents, memo: 'Sales discounts' }] : []),
          ...revenueLines.map((r) => ({ code: r.code, credit: r.credit })),
          ...(vatAmountCents ? [{ code: '2200', credit: vatAmountCents, memo: 'Output VAT' }] : []),
          ...(tipCents ? [{ code: '2300', credit: tipCents, memo: 'Tips payable' }] : []),
        ],
      });

      if (cogsTotal > 0) {
        await postJournal(tx, {
          branchId: input.branchId,
          source: 'GENERAL',
          entryDate: bizDate,
          reference: `${receiptNo}-COGS`,
          memo: `Cost of goods sold / consumables for ${receiptNo}`,
          saleId: sale.id,
          createdBy: input.cashierName ?? input.cashierId,
          lines: [
            { code: '5000', debit: cogsTotal },
            { code: '1200', credit: cogsTotal },
          ],
        });
      }

      return {
        saleId: sale.id,
        receiptNo,
        totalCents,
        changeCents,
        loyaltyEarned,
        giftCertificateCodes: soldCodes,
      };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/**
 * Voids a sale. Financial records are never hard-deleted: the receipt number
 * is retained, stock and loyalty are reversed with explicit movements, and a
 * reversing journal entry is posted.
 */
export async function voidSale(opts: {
  saleId: string;
  reason: string;
  userId: string;
  userName: string;
  approverId: string;
}): Promise<void> {
  if (!opts.reason.trim()) throw new CheckoutError('A reason is required to void a sale.');

  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: opts.saleId },
      include: {
        lines: true,
        payments: true,
        commissions: true,
        loyaltyTxns: true,
        gcRedemptions: true,
        voucherUses: true,
        journalEntries: { include: { lines: { include: { account: true } } } },
      },
    });
    if (!sale) throw new CheckoutError('Sale not found.');
    if (sale.status !== 'PAID') throw new CheckoutError('That sale has already been voided.');

    const closed = await tx.eodClosing.findUnique({
      where: {
        branchId_businessDate: { branchId: sale.branchId, businessDate: sale.businessDate },
      },
      select: { id: true },
    });
    if (closed) {
      throw new CheckoutError('That business day is closed. Reopen the EOD before voiding.');
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: 'VOIDED',
        voidReason: opts.reason,
        voidedAt: new Date(),
        voidedById: opts.approverId,
      },
    });

    // Reverse commissions.
    await tx.commission.deleteMany({ where: { saleId: sale.id, payslipId: null } });

    // Reverse loyalty.
    if (sale.clientId) {
      const net = sale.loyaltyTxns.reduce((a, b) => a + b.points, 0);
      if (net !== 0) {
        await tx.client.update({
          where: { id: sale.clientId },
          data: { loyaltyPoints: { decrement: net } },
        });
        await tx.loyaltyTransaction.create({
          data: {
            clientId: sale.clientId,
            saleId: sale.id,
            points: -net,
            reason: `Reversed — ${sale.receiptNo} voided`,
          },
        });
      }
    }

    // Return stock.
    const movements = await tx.stockMovement.findMany({
      where: { refType: 'sale', refId: sale.id },
    });
    for (const m of movements) {
      await tx.item.update({
        where: { id: m.itemId },
        data: { stockQty: { increment: -m.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          branchId: sale.branchId,
          itemId: m.itemId,
          type: 'RETURN',
          quantity: -m.quantity,
          unitCostCents: m.unitCostCents,
          reason: `Void of ${sale.receiptNo}`,
          refType: 'sale_void',
          refId: sale.id,
          userId: opts.userId,
          userName: opts.userName,
        },
      });
    }

    // Restore gift certificate balances and voucher uses.
    for (const r of sale.gcRedemptions) {
      await tx.giftCertificate.update({
        where: { id: r.gcId },
        data: { balanceCents: { increment: r.amountCents }, status: 'PARTIALLY_USED' },
      });
    }
    for (const v of sale.voucherUses) {
      await tx.voucher.update({
        where: { id: v.voucherId },
        data: { usesCount: { decrement: 1 }, status: 'ACTIVE' },
      });
    }

    // Restore prepaid sessions and package entitlements.
    for (const line of sale.lines) {
      if (line.type === 'PREPAID_REDEMPTION' && line.serviceId) {
        const ent = await tx.clientPackageEntitlement.findFirst({
          where: {
            serviceId: line.serviceId,
            clientPackage: { clientId: sale.clientId ?? undefined },
            usedSessions: { gt: 0 },
          },
          orderBy: { id: 'desc' },
        });
        if (ent) {
          await tx.clientPackageEntitlement.update({
            where: { id: ent.id },
            data: { usedSessions: { decrement: line.quantity } },
          });
          await tx.clientPackage.update({
            where: { id: ent.clientPackageId },
            data: { status: 'ACTIVE' },
          });
        }
      }
    }
    await tx.clientPackage.updateMany({
      where: { saleId: sale.id },
      data: { status: 'CANCELLED' },
    });
    await tx.giftCertificate.updateMany({
      where: { soldSaleId: sale.id },
      data: { status: 'CANCELLED', balanceCents: 0 },
    });

    // Reverse the journal — never delete the original entry.
    for (const entry of sale.journalEntries) {
      await postJournal(tx, {
        branchId: sale.branchId,
        source: entry.source,
        entryDate: sale.businessDate,
        reference: `${entry.reference}-VOID`,
        memo: `Void of ${sale.receiptNo}: ${opts.reason}`,
        saleId: sale.id,
        createdBy: opts.userName,
        lines: entry.lines.map((l) => ({
          code: l.account.code,
          debit: l.creditCents,
          credit: l.debitCents,
        })),
      });
    }

    if (sale.appointmentId) {
      await tx.appointment.update({
        where: { id: sale.appointmentId },
        data: { depositAppliedSaleId: null },
      });
    }
  }, { timeout: 30_000 });
}
