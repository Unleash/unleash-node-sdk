import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nock from 'nock';
import { expect, test } from 'vitest';
import { createHttpClient } from '../request';

// Self-signed cert material (generated for tests)
const CA_CERT = `-----BEGIN CERTIFICATE-----
MIIDBTCCAe2gAwIBAgIUeFOY3tdfg0MmV+dkG2yw6KqtIn8wDQYJKoZIhvcNAQEL
BQAwEjEQMA4GA1UEAwwHVGVzdCBDQTAeFw0yNTEyMDQxNzA3NTdaFw0zNTEyMDIx
NzA3NTdaMBIxEDAOBgNVBAMMB1Rlc3QgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQCxurWTtqXc1alB9Cvo3VCu/iOO2akTONi5YDANSj4t+J040Kbm
EBvMqBBvHH6C8Z1gi6QbyjwvbF96rIAI1OtMHjd7rcyi7VEUGXbYcSdKJCxWoZdl
zkUdCgs8lRGz6//vztZKmGmJWNsrogype7VIULRvo0tu1OIJDciYkrxCsZuc+jf5
FTWIYGgGsS+sY/n8CISzwGazjpwQay0JJnFJdIZn2aeNLWX+rdKIiZ+Sq4w+ewrz
j9kymJvlsIbrT5qc/5ZsNIO1An6+ne+gaQnEZ8oe3MiFadaudDwU/RCCUmtG9ajd
wvmQAGjKCBNtk2UCle+rU6WBGb/la4pqSZmrAgMBAAGjUzBRMB0GA1UdDgQWBBRd
oWMZTl/w97Qt/z0FkmbxMgpyczAfBgNVHSMEGDAWgBRdoWMZTl/w97Qt/z0Fkmbx
MgpyczAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQA+0HpdPz1X
3Ao9hnbQClo9OBM0ezbHZwdlRqhwxR8a0O4NalOjw53b/kB+qfl4kDPgVGpN8Wgi
hnyagkrI5Do36Kzt/unmhmZ46WpzC+CK0AkgaHeOgb/aQJ74soX7SLFRB/rN2UAr
tgo1PaSS3LBrgw7n/2Vb92Que4oIwHglTY2AYhNLJCnOY2AjfHMrAMxebGYgiGmd
llk0GjiOWEFxu+0+F83GvEO2rc4XVMyiAyJfCaroOh/wsklBLsOJGeyVliOIJ8Uz
PUsNNptz6KpuK0DyptYi4jH77C1YR/rC/w+TgfKPRhXjqzu+KOvSyZXtC4MuvejH
ELB9z6JpDKiK
-----END CERTIFICATE-----`;

const SERVER_CERT = `-----BEGIN CERTIFICATE-----
MIICrTCCAZUCFG+lHOaXbnNLzenTbaDGRBrsk14qMA0GCSqGSIb3DQEBCwUAMBIx
EDAOBgNVBAMMB1Rlc3QgQ0EwHhcNMjUxMjA0MTcwNzU3WhcNMzUxMjAyMTcwNzU3
WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAw
ggEKAoIBAQDr7x83qmgQ9rfz4WnwGqk8+hDLxU+k/X1xlEnBEXLYlDOmI3KA5q9M
2vGoN0WMUwJqVPv/mXs1uln9sYjO7Ey1hYFH6YneZNyVRebuGKT7N37bQHv1NZ8s
Jl70YGvzmEGVt3dh0QU4KJgk1IREpoAjHtII1D99m/NtQ7tt8ZJdOLutm0uyyHs2
nqSmKIl/g722+nkroQA/eotcd7tmxgVrqUONB1zgF5lgATyzATqwzvwejFZ+FG9d
XXAT/JhwH2bv7qJIiRLyU7On6Ena745yD0QJ6lnx6+z1exbMvDDo2V5jIXUdCOhH
Nbo8UEUaSnvrwshKvrWs3etteQAd4KMvAgMBAAEwDQYJKoZIhvcNAQELBQADggEB
AFtbMcLdhjmoww+d97oaAgDyDLby64f4A9XRzBsFKZA0Zd++ChJ0h2+jH1jLDdYq
oLNYor6mS4cP6giEX6N3wK+tOvojsw+iuH/ybSPqrDjKt8Q2B7DNig9LXZfVOg7E
ecbZIeYgZ1hyVSBluYB4hqjrgNbp8j/G1NTQBd+S7jE/VWZ2qIZSSCzXdDhgwIJm
6GqSoq8hT48a0Da2b8JoiR1MU8AzK4QbzAP0BdyeapY6xZeGogNk2ctVZmh2CmKI
kMJ/rqMRkOW+8bzTJbRCBy3uu8YNqF+7gf8O3A4PKA5T98gl1v9R0CXzb6V4uYIK
29osXfxHPP1KiX3O5RbVniA=
-----END CERTIFICATE-----`;

const SERVER_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDr7x83qmgQ9rfz
4WnwGqk8+hDLxU+k/X1xlEnBEXLYlDOmI3KA5q9M2vGoN0WMUwJqVPv/mXs1uln9
sYjO7Ey1hYFH6YneZNyVRebuGKT7N37bQHv1NZ8sJl70YGvzmEGVt3dh0QU4KJgk
1IREpoAjHtII1D99m/NtQ7tt8ZJdOLutm0uyyHs2nqSmKIl/g722+nkroQA/eotc
d7tmxgVrqUONB1zgF5lgATyzATqwzvwejFZ+FG9dXXAT/JhwH2bv7qJIiRLyU7On
6Ena745yD0QJ6lnx6+z1exbMvDDo2V5jIXUdCOhHNbo8UEUaSnvrwshKvrWs3ett
eQAd4KMvAgMBAAECggEAK8C099Q8p0SxmWMIi9PN5bZ0De3h1rWBoWIACXNManiV
WW6CagAdqzGBFhJl7d9o98IZ120libGsxZy6Q7FTimgfMPBQtnLa6z3C1Q2x7rp8
Znl/Y1pV0dCt1EDbVBm8s+CJnZSvFJqGmHHms3pzEdBB4AxIV+lnS7B/XiSp4Wps
TSwCLLq2q4bNDKGGjo6U9Bx/NXfutbjSmo8bnFV1PhFV/HTj3e+HzeC0fEdeEOAY
X8kN82Q+5gFa4Mk7V4nkeDa44adpBGGtnnN4YV6g536npLRdTkaSGXSbYASPfcGB
cGXOKdnkH4IYxg8F5W5BY4v221b1OzDT1VJHThyriQKBgQD6AB1I2CuGSUNPKT58
vMMk71E6o+ne+1cpaeHY6mT5C9oHQ+F81o3QyejEa2mzxWLisC4U5E83XksaYtiS
ZztsL6R3WML4tECSV/Vb2f0JsKNWQrwHzxgP2cfu9vTtSJvXtWHSqS6GNBjnorp1
KUedE5Labg84A62wXM4HOZRs9wKBgQDxmJcfXpSrk+DC9VsjTtMEVq+b/ck4VqGy
Jp6POLW77kNRRQ26pwut8/TCRwa6AUXMyDpuoDjqpPyOn+suEk0ZQot2uiOXSutq
BapOEaab7Fk7UTOxIZkTtz3lgJOH81ZjTc7UtSvI+VCydALx+07qOSBYCeng48bA
tl1WrlqFiQKBgQC0yZpj0DeBb7+mIlxW1iaEsi/aqSh6IOZCQ5iYRcDpPMHZmSQa
JAoAH9MdH9QbtbUx21gnsYb7sku7dBnLna2iKb3UtLKiKa+8ZLFBUB2lgUBNJAtX
1lI/PC1SSPKMGYLhdgCc182WLVyJPet6yHRKShpbrVWCG17id+ph3SjRtwKBgHRp
vXANKAAhCm2GwnqZ8c4mYwn8WOg/vjxUpZSHk/JRVbikWIA3G8afRbITfWdFU7fg
R1+k7qgKBfRHlJAnm2TvjroP6TRukk8NGcnycWCymzCc6RaSBOveIQIkWXJpy5eg
F2ihP87ga4UBp6WoHZd5HV+urzaBKvUTKpio/M9ZAoGBAM4Gp7oLipRfHMJNL3Nh
WhHbmOB6smNjwzCmcn8IKMirz3CeLlKnoi/okZG/vJ1s6Qkt6BAEkCNKsXhvOIlB
825TbjFb25EeD5wKsrs5qeRr6zh57jia87MZcYZvOjDG3DkXP/i4vzsO0szbtEh/
JMWeYwPwkb3p+TnOtBElk5Mh
-----END PRIVATE KEY-----`;

const clientIdentity = {
  appName: 'app',
  instanceId: 'instance',
  connectionId: 'connection',
} as const;

const requestOptions = {
  interval: 0,
} as const;

const REQUEST_MODULE_PATH = join(process.cwd(), 'lib', 'request.js');

test('GET returns non-2xx statuses without throwing', async () => {
  const url = 'http://status-behavior.test';
  // make-fetch-happen may retry GETs; allow multiple matches
  nock(url).get('/client/features').times(3).reply(503, 'sorry');

  const client = await createHttpClient({ ...clientIdentity });
  const res = await client.get({
    url: `${url}/client/features`,
    ...requestOptions,
  });

  expect(res.status).toBe(503);
  expect(res.ok).toBe(false);
});

test('GET rejects on timeout with a timeout-specific error code/message', async () => {
  const url = 'http://timeout-behavior.test';
  // make-fetch-happen may retry GETs on timeout; allow multiple matches
  nock(url).get('/client/features').times(3).delayConnection(5000).reply(200, 'OK');

  const client = await createHttpClient({ ...clientIdentity, timeout: 3000 });
  await expect(
    client.get({
      url: `${url}/client/features`,
      ...requestOptions,
    }),
  ).rejects.toSatisfy((err: unknown) => {
    const e = err as { code?: string; message?: string };
    return (
      (typeof e.code === 'string' && /TIMEDOUT/i.test(e.code)) ||
      (typeof e.message === 'string' && /timeout/i.test(e.message))
    );
  });
}, 15_000);

test('POST rejects on timeout with a timeout-specific error code/message', async () => {
  const url = 'http://timeout-behavior-post.test';
  nock(url).post('/client/metrics').delayConnection(200).reply(200, '');

  const client = await createHttpClient({ ...clientIdentity, timeout: 50 });
  await expect(
    client.post({
      url: `${url}/client/metrics`,
      json: {},
      ...requestOptions,
    }),
  ).rejects.toSatisfy((err: unknown) => {
    const e = err as { code?: string; message?: string };
    return Boolean(
      (typeof e.code === 'string' && /TIMEDOUT/i.test(e.code)) ||
        (typeof e.message === 'string' && /timeout/i.test(e.message)),
    );
  });
});

test('HTTPS request fails with self-signed cert when no extra trust is provided', async () => {
  const server = createServer({ key: SERVER_KEY, cert: SERVER_CERT }, (_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', (err?: Error) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'EPERM') {
      // Environment does not allow binding; skip in this environment.
      return;
    }
    throw err;
  }
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `https://localhost:${port}/client/features`;

  const client = await createHttpClient({ ...clientIdentity });
  await expect(
    client.get({
      url,
      ...requestOptions,
    }),
  ).rejects.toSatisfy((err: unknown) => {
    const e = err as {
      code?: string;
      message?: string;
      cause?: { code?: string; message?: string };
    };
    const code = e.code || e.cause?.code || (typeof e.message === 'string' && e.message);
    return typeof code === 'string' && /SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code);
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('HTTPS request succeeds when NODE_EXTRA_CA_CERTS contains the CA', async () => {
  const server = createServer({ key: SERVER_KEY, cert: SERVER_CERT }, (_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', (err?: Error) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'EPERM') {
      return;
    }
    throw err;
  }
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `https://localhost:${port}/client/features`;

  const caDir = mkdtempSync(join(tmpdir(), 'unleash-ca-'));
  const caPath = join(caDir, 'ca.crt');
  writeFileSync(caPath, CA_CERT);

  const script = `
    const { createHttpClient } = require(${JSON.stringify(REQUEST_MODULE_PATH)});
    (async () => {
      const client = await createHttpClient({
        appName: ${JSON.stringify(clientIdentity.appName)},
        instanceId: ${JSON.stringify(clientIdentity.instanceId)},
        connectionId: ${JSON.stringify(clientIdentity.connectionId)},
      });
      const res = await client.get({
        url: ${JSON.stringify(url)},
        interval: 0,
      });
      console.log('status', res.status);
    })().catch((err) => {
      console.error(err && (err.code || err.message) || err);
      process.exit(1);
    });
  `;

  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        ['-e', script],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_EXTRA_CA_CERTS: caPath,
          },
        },
        (error, stdout, stderr) => {
          resolve({ code: error ? (error.code as number | null) : 0, stdout, stderr });
        },
      );
    },
  );

  await new Promise<void>((resolve) => server.close(() => resolve()));

  expect(result.code).toBe(0);
  expect(result.stdout).toContain('status 200');
});

test('HTTPS request succeeds when rejectUnauthorized is disabled', async () => {
  const server = createServer({ key: SERVER_KEY, cert: SERVER_CERT }, (_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', (err?: Error) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'EPERM') {
      return;
    }
    throw err;
  }
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `https://localhost:${port}/client/features`;

  const client = await createHttpClient({
    ...clientIdentity,
    httpOptions: {
      rejectUnauthorized: false,
    },
  });
  const res = await client.get({
    url,
    ...requestOptions,
  });

  expect(res.status).toBe(200);

  await new Promise<void>((resolve) => server.close(() => resolve()));
});
