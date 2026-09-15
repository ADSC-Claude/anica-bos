import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTAKE_METHODS, intakeMethod, intakeMethodLabel } from '../src/lib/intake-method';

test('the details sheet is a way of sending, beside the form, Messenger and Excel', () => {
  assert.deepEqual([...INTAKE_METHODS], ['FORM', 'MESSENGER', 'EXCEL', 'SHEET']);
  assert.equal(intakeMethod('SHEET'), 'SHEET');
  assert.equal(intakeMethod('EXCEL'), 'EXCEL');
});

test('anything off the list is the form', () => {
  assert.equal(intakeMethod('VIBER'), 'FORM');
  assert.equal(intakeMethod(''), 'FORM');
  assert.equal(intakeMethod(undefined), 'FORM');
});

test('the staff side reads the method as words', () => {
  assert.equal(intakeMethodLabel('SHEET'), 'the details sheet');
  assert.equal(intakeMethodLabel('MESSENGER'), 'Messenger');
  assert.equal(intakeMethodLabel('EXCEL'), 'an Excel file');
  assert.equal(intakeMethodLabel('nonsense'), 'the form');
});
