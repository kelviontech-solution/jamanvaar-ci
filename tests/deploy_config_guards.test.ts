import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

// Both guards come from real failures found deploying to the Oracle VM on 2026-10-19/20:
// qr-guest crash-looped on start, and the backend image failed to build.
describe('deployment config guards', () => {
  it('quotes every nginx regex location that contains a {n,m} quantifier', () => {
    // nginx treats an unquoted "{" in a regex as the start of the location block and cuts the
    // pattern there ("pcre2_compile() failed: missing closing parenthesis"), so the container
    // exits at startup. A regex containing { or } must be wrapped in quotes.
    const offenders = read('apps/qr-guest/nginx.conf')
      .split('\n')
      .filter((line) => /^\s*location\s+~\*?\s+[^"'\s][^\s]*[{}]/.test(line));
    expect(offenders).toEqual([]);
  });

  it('runs the backend packaging smoke test only after the Prisma client is in the runtime stage', () => {
    // The smoke test loads QrReceiptService, which imports @prisma/client. Running it before the
    // generated client is copied in fails the image build with "Cannot find module '.prisma/client/default'".
    const dockerfile = read('cloud/api/Dockerfile');
    const prismaCopy = dockerfile.indexOf('COPY --from=builder /repo/node_modules/.prisma');
    const smokeRun = dockerfile.indexOf('RUN node tooling/qa/receipt-pdf-smoke.cjs');
    expect(prismaCopy).toBeGreaterThan(-1);
    expect(smokeRun).toBeGreaterThan(-1);
    expect(smokeRun).toBeGreaterThan(prismaCopy);
  });
});
