/**
 * Task 0 spike probe — exercises the MemWal account/delegate-key path that
 * issues #300/#302 historically broke on (SuiClient cross-realm instanceof).
 *
 * Static analysis already PASSED the version-compat GATE (see ../DECISIONS.md):
 *   - single deduped @mysten/sui@2.19.0 across MemWal 0.0.7 + dApp Kit 2.1.3
 *   - main entry (remember/recall/restore) does NOT import @mysten/sui at all
 *   - account ops accept an injected SuiClient (the #300/#302 fix)
 *
 * This probe is the LIVE confirmation. It needs a provisioned delegate key +
 * account id (manual prep: memory.walrus.xyz playground). Without them it
 * fails LOUD with instructions rather than a confusing crash.
 *
 * Run: MEMWAL_KEY=0x.. MEMWAL_ACCOUNT_ID=0x.. MEMWAL_RELAYER=https://.. npx tsx check.ts
 */
import { MemWal } from '@mysten-incubation/memwal';

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(
      `\n[SPIKE BLOCKED] Missing env ${name}.\n` +
        `This probe needs a MemWal delegate key + account id from the playground\n` +
        `(memory.walrus.xyz). The static version-compat GATE already passed — see\n` +
        `DECISIONS.md. Run once the account is provisioned:\n` +
        `  MEMWAL_KEY=0x.. MEMWAL_ACCOUNT_ID=0x.. MEMWAL_RELAYER=https://.. npx tsx check.ts\n`,
    );
    process.exit(2);
  }
  return v;
}

async function main() {
  const key = reqEnv('MEMWAL_KEY');
  const accountId = reqEnv('MEMWAL_ACCOUNT_ID');
  const serverUrl = process.env.MEMWAL_RELAYER ?? 'https://relayer.memwal.ai/';
  const namespace = process.env.NAMESPACE ?? 'walrus-ecosystem';

  console.log('compat:', {
    sdk: '0.0.7',
    relayer: serverUrl,
    namespace,
  });

  // Construction: delegate-key only, no SuiClient. If this throws a
  // "SuiClient not found"-style error, MODE-A is dead and MODE-B is forced.
  const memwal = MemWal.create({ key, accountId, serverUrl, namespace });
  console.log('MemWal.create OK — no SuiClient needed on the memory path.');

  // Round-trip: remember -> wait (accounts for indexing latency #303) -> recall.
  const probeText = `recall spike probe ${accountId.slice(0, 8)}`;
  const job = await memwal.rememberAndWait(probeText);
  console.log('rememberAndWait OK:', job);

  const recalled = await memwal.recall({ query: 'spike probe', topK: 5, namespace });
  console.log('recall OK, hits:', recalled?.results?.length ?? recalled);
  console.log('\n[SPIKE PASS] MemWal memory path works against the relayer.');
}

main().catch((e) => {
  console.error('SPIKE FAIL:', e);
  process.exit(1);
});
