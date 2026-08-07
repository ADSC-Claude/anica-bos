import { handle, requireApi, assert } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { encryptBackup, passphraseProblem, samePassphrase } from '@/lib/backup-crypto';

export const dynamic = 'force-dynamic';

/**
 * Owner-only full backup: every table, including client health information —
 * this is the one export that contains it. Restore with
 * `npm run restore -- <file>`.
 *
 * POST rather than GET, and always encrypted. Both follow from what this file
 * is: the entire spa in one download, health records included. A GET is a link
 * that can be prefetched by a browser, sat in history, and shared without being
 * opened; and a passphrase does not belong in a URL. The client consent form
 * now states that health information leaves the spa only inside an encrypted
 * backup, so there is deliberately no way from here to produce a readable one.
 */
export const POST = handle(async (req) => {
  const user = await requireApi('settings.critical');

  const form = await req.formData().catch(() => null);
  assert(form, 400, 'Invalid request.');

  const passphrase = String(form.get('passphrase') ?? '');
  const confirm = String(form.get('passphraseConfirm') ?? '');

  const problem = passphraseProblem(passphrase);
  assert(!problem, 400, problem ?? '');
  assert(
    samePassphrase(passphrase, confirm),
    400,
    'The two passphrases do not match. A backup nobody can open is not a backup.',
  );

  const [
    branches, settings, accounts, users, employees, employeeSkills, employeeSchedules,
    employeeCommissionRules, attendances, loans, loanPayments, payrollPeriods, payslips,
    payslipLines, incentiveSchemes, incentiveResults, serviceCategories, services,
    serviceRecipes, resources, clients, clientFieldDefinitions, clientFieldValues,
    clientFeedback, clientFollowUps, corporateAccounts, corporateAccountClients,
    corporateStatements, corporatePayments, partners, appointments, appointmentServices,
    receiptSeries, sales, saleLines, saleDiscounts, payments, commissions, discountPresets,
    loyaltyTransactions, packages, packageItems, clientPackages, clientPackageEntitlements,
    giftCertificates, gcRedemptions, voucherBatches, vouchers, voucherRedemptions, promos,
    itemCategories, units, items, suppliers, supplierItems, supplierPriceChanges,
    stockMovements, purchaseOrders, purchaseOrderLines, stockTakes, stockTakeLines,
    expenseCategories, expenses, pettyCashTxns, pettyCashRequests, eodClosings,
    journalEntries, journalLines, notifications, announcements, announcementReads,
    directMessages, shiftNotes, shiftNoteComments, emailLogs, holidays, kpiTargets, permits,
    auditLogs, loginEvents,
  ] = await Promise.all([
    prisma.branch.findMany(), prisma.setting.findMany(), prisma.account.findMany(),
    prisma.user.findMany(), prisma.employee.findMany(), prisma.employeeSkill.findMany(),
    prisma.employeeSchedule.findMany(), prisma.employeeCommissionRule.findMany(),
    prisma.attendance.findMany(), prisma.employeeLoan.findMany(), prisma.loanPayment.findMany(),
    prisma.payrollPeriod.findMany(), prisma.payslip.findMany(), prisma.payslipLine.findMany(),
    prisma.incentiveScheme.findMany(), prisma.incentiveResult.findMany(),
    prisma.serviceCategory.findMany(), prisma.service.findMany(), prisma.serviceRecipe.findMany(),
    prisma.resource.findMany(), prisma.client.findMany(),
    prisma.clientFieldDefinition.findMany(), prisma.clientFieldValue.findMany(),
    prisma.clientFeedback.findMany(), prisma.clientFollowUp.findMany(),
    prisma.corporateAccount.findMany(), prisma.corporateAccountClient.findMany(),
    prisma.corporateStatement.findMany(), prisma.corporatePayment.findMany(),
    prisma.partner.findMany(), prisma.appointment.findMany(), prisma.appointmentService.findMany(),
    prisma.receiptSeries.findMany(), prisma.sale.findMany(), prisma.saleLine.findMany(),
    prisma.saleDiscount.findMany(), prisma.payment.findMany(), prisma.commission.findMany(),
    prisma.discountPreset.findMany(), prisma.loyaltyTransaction.findMany(),
    prisma.package.findMany(), prisma.packageItem.findMany(), prisma.clientPackage.findMany(),
    prisma.clientPackageEntitlement.findMany(), prisma.giftCertificate.findMany(),
    prisma.giftCertificateRedemption.findMany(), prisma.voucherBatch.findMany(),
    prisma.voucher.findMany(), prisma.voucherRedemption.findMany(), prisma.promo.findMany(),
    prisma.itemCategory.findMany(), prisma.unit.findMany(), prisma.item.findMany(),
    prisma.supplier.findMany(), prisma.supplierItem.findMany(), prisma.supplierPriceChange.findMany(),
    prisma.stockMovement.findMany(), prisma.purchaseOrder.findMany(),
    prisma.purchaseOrderLine.findMany(), prisma.stockTake.findMany(), prisma.stockTakeLine.findMany(),
    prisma.expenseCategory.findMany(), prisma.expense.findMany(), prisma.pettyCashTxn.findMany(),
    prisma.pettyCashRequest.findMany(), prisma.eodClosing.findMany(),
    prisma.journalEntry.findMany(), prisma.journalLine.findMany(), prisma.notification.findMany(),
    prisma.announcement.findMany(), prisma.announcementRead.findMany(),
    prisma.directMessage.findMany(), prisma.shiftNote.findMany(), prisma.shiftNoteComment.findMany(),
    prisma.emailLog.findMany(), prisma.holiday.findMany(), prisma.kpiTarget.findMany(),
    prisma.permit.findMany(), prisma.auditLog.findMany(), prisma.loginEvent.findMany(),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: user.email,
    schemaVersion: 1,
    data: {
      branches, settings, accounts, users, employees, employeeSkills, employeeSchedules,
      employeeCommissionRules, attendances, loans, loanPayments, payrollPeriods, payslips,
      payslipLines, incentiveSchemes, incentiveResults, serviceCategories, services,
      serviceRecipes, resources, clients, clientFieldDefinitions, clientFieldValues,
      clientFeedback, clientFollowUps, corporateAccounts, corporateAccountClients,
      corporateStatements, corporatePayments, partners, appointments, appointmentServices,
      receiptSeries, sales, saleLines, saleDiscounts, payments, commissions, discountPresets,
      loyaltyTransactions, packages, packageItems, clientPackages, clientPackageEntitlements,
      giftCertificates, gcRedemptions, voucherBatches, vouchers, voucherRedemptions, promos,
      itemCategories, units, items, suppliers, supplierItems, supplierPriceChanges,
      stockMovements, purchaseOrders, purchaseOrderLines, stockTakes, stockTakeLines,
      expenseCategories, expenses, pettyCashTxns, pettyCashRequests, eodClosings,
      journalEntries, journalLines, notifications, announcements, announcementReads,
      directMessages, shiftNotes, shiftNoteComments, emailLogs, holidays, kpiTargets, permits,
      auditLogs, loginEvents,
    },
  };

  const now = new Date();
  const envelope = await encryptBackup(JSON.stringify(payload, null, 1), passphrase, now);

  await audit(user, {
    module: 'settings',
    action: 'full_backup',
    entityType: 'Backup',
    summary:
      'Downloaded a full, encrypted data backup (includes client health information)',
    sensitive: true,
  });

  const date = now.toISOString().slice(0, 10);
  return new Response(JSON.stringify(envelope), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="anica-backup-${date}.json.enc"`,
      'Cache-Control': 'no-store',
    },
  });
});
