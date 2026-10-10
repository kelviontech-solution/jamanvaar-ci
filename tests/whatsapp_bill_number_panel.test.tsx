import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  WhatsAppBillNumberView,
  describeBillNumber,
  sanitizeBillNumberInput
} from '../apps/restaurant-system/pos-admin/src/components/receipts/WhatsAppBillNumberPanel';
import type { WhatsAppBillSettings } from '../apps/restaurant-system/pos-admin/src/cloud/cloudClient';

const base: WhatsAppBillSettings = { number: null, status: 'NOT_SET', message: null, displayNumber: null, verifiedName: null, quality: null, templateStatus: null, checkedAt: null };
const noop = () => undefined;
const render = (settings: WhatsAppBillSettings, input = settings.number ?? '', extra: { busy?: boolean; error?: string } = {}) =>
  renderToStaticMarkup(
    React.createElement(WhatsAppBillNumberView, {
      settings, input, busy: extra.busy ?? false, error: extra.error ?? '',
      onInput: noop, onSave: noop, onRecheck: noop, onCreateTemplate: noop, onClear: noop
    })
  );

describe('WhatsApp number for bills — admin panel', () => {
  it('only digits can ever be typed or pasted, max 10, and a pasted +91 prefix is dropped', () => {
    expect(sanitizeBillNumberInput('kje5465')).toBe('5465');
    expect(sanitizeBillNumberInput('+91 94285-21735')).toBe('9428521735');
    expect(sanitizeBillNumberInput('94285217351234')).toBe('9428521735');
    expect(sanitizeBillNumberInput('abc')).toBe('');
  });

  it('first visit: no number, explains the default and offers Save & check only', () => {
    const html = render(base, '');
    expect(html).toContain('No number set');
    expect(html).toContain('default WhatsApp number');
    expect(html).toContain('Save &amp; check');
    expect(html).not.toContain('Check again');
    expect(html).not.toContain('Remove');
  });

  it('a ready number says so, with the verified business name and the template state', () => {
    const html = render({ ...base, number: '9428521735', status: 'READY', verifiedName: 'Jamanvaar', templateStatus: 'APPROVED' });
    expect(html).toContain('Ready — bills are sent from +91 9428521735');
    expect(html).toContain('Jamanvaar');
    expect(html).toContain('template: approved');
    expect(html).toContain('Check again');
    expect(html).not.toContain('Create bill template');
  });

  it('a missing template is explained in plain words and can be created in one click', () => {
    const html = render({ ...base, number: '9428521735', status: 'READY', templateStatus: 'MISSING' });
    expect(html).toContain('not created yet');
    expect(html).toContain('Create bill template');
  });

  it('a pending template shows the wait, with no button', () => {
    const html = render({ ...base, number: '9428521735', status: 'READY', templateStatus: 'PENDING' });
    expect(html).toContain('waiting for Meta approval');
    expect(html).not.toContain('Create bill template');
  });

  it('a rejected template offers Submit again', () => {
    expect(render({ ...base, number: '9428521735', status: 'READY', templateStatus: 'REJECTED' })).toContain('Submit again');
  });

  it('a number that is not on the Meta account tells the admin exactly what to do next', () => {
    const html = render({ ...base, number: '9876543210', status: 'NOT_FOUND' });
    expect(html).toContain('not on your WhatsApp Business account yet');
    expect(html).toContain('WhatsApp Manager');
    expect(html).toContain('Check again');
    expect(html).not.toContain('template:');
  });

  it('every non-ready state has a non-empty title and next step; none leaks a raw code', () => {
    for (const status of ['NOT_FOUND', 'NO_CREDENTIALS', 'TOKEN_INVALID', 'OWNED_BY_OTHER', 'UNREACHABLE', 'NOT_CONNECTED', 'BAD_NUMBER', 'NOT_SET'] as const) {
      const d = describeBillNumber({ ...base, number: '9876543210', status });
      expect(d.title.length).toBeGreaterThan(5);
      expect(d.help.length).toBeGreaterThan(5);
      expect(`${d.title} ${d.help}`).not.toContain(status);
    }
  });

  it('shows a server error, and while busy the Save button reads Checking…', () => {
    const html = render({ ...base, number: '9876543210', status: 'UNREACHABLE' }, '9876543210', { busy: true, error: 'Could not reach the WhatsApp service' });
    expect(html).toContain('Could not reach the WhatsApp service');
    expect(html).toContain('Checking…');
  });

  it('the number box is a numeric telephone field limited to 10 characters', () => {
    const html = render(base, '');
    expect(html).toContain('type="tel"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('maxLength="10"');
  });
});
