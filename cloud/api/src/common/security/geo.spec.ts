import { describe, expect, it } from 'vitest';
import { describeLocation } from './geo';

describe('describeLocation (BUG-094)', () => {
  it('uses city and country from the proxy or CDN in front of the API', () => {
    expect(describeLocation('203.0.113.9', { 'cf-ipcity': 'Ahmedabad', 'cf-ipcountry': 'IN' })).toBe('Ahmedabad, IN');
    expect(describeLocation('203.0.113.9', { 'x-vercel-ip-city': 'Pune', 'x-vercel-ip-country': 'IN' })).toBe('Pune, IN');
  });

  it('decodes a percent-encoded city name', () => {
    expect(describeLocation('203.0.113.9', { 'x-vercel-ip-city': 'S%C3%A3o%20Paulo', 'x-vercel-ip-country': 'BR' })).toBe('São Paulo, BR');
  });

  it('falls back to the country alone', () => {
    expect(describeLocation('203.0.113.9', { 'cf-ipcountry': 'IN' })).toBe('IN');
  });

  it('ignores the placeholder values CDNs send when they do not know', () => {
    expect(describeLocation('203.0.113.9', { 'cf-ipcountry': 'XX' })).toBeNull();
    expect(describeLocation('203.0.113.9', { 'cf-ipcountry': 'T1' })).toBeNull();
  });

  it('labels private, loopback and link-local addresses as the local network', () => {
    for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.1.2.3', '192.168.1.20', '172.16.0.4', '172.31.255.1', 'fe80::1', 'fc00::1']) {
      expect(describeLocation(ip, {})).toBe('Local network');
    }
  });

  it('does not treat public addresses next to private ranges as local', () => {
    expect(describeLocation('172.32.0.1', {})).toBeNull();
    expect(describeLocation('8.8.8.8', {})).toBeNull();
  });

  it('is null when nothing is known', () => {
    expect(describeLocation(null, {})).toBeNull();
    expect(describeLocation(undefined, undefined)).toBeNull();
  });

  it('strips anything unexpected from a header value', () => {
    expect(describeLocation('203.0.113.9', { 'cf-ipcity': '<script>x</script>Pune', 'cf-ipcountry': 'IN' })).toBe('scriptxscriptPune, IN');
  });
});
