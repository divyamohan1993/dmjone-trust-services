/** Smoke: does our RFC-3161 TimeStampReq actually work against real TSAs? */
import { requestTimestampToken } from '@dmjone/crypto';

const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const tsas = ['http://timestamp.digicert.com', 'http://freetsa.org/tsr', 'http://timestamp.sectigo.com'];

for (const url of tsas) {
  try {
    const token = await requestTimestampToken(data, { url, timeoutMs: 12000 });
    console.log(`${url.padEnd(34)} -> ${token ? 'TOKEN RECEIVED ✓' : 'null'}`);
  } catch (e) {
    console.log(`${url.padEnd(34)} -> ERROR ${(e as Error).message}`);
  }
}
