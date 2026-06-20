/// Immutable per-run anchor for the Recall research agent.
///
/// Each agent run produces a canonical JSON artifact (hashed off-chain with
/// keccak256 in the shared core). `attest` freezes that hash plus the Walrus
/// blob id on-chain so anyone can later verify a stored memory artifact matches
/// the anchored hash. Move never recomputes the JSON — the hash is passed in.
module recall::attestation;

use sui::clock::Clock;
use sui::event;

/// keccak256 digests are always 32 bytes; reject anything else so the
/// "✓ Verified on-chain" badge can never anchor a non-keccak256 value.
const EBadHashLength: u64 = 0;

/// keccak256 produces a 32-byte digest.
const HASH_LEN: u64 = 32;

/// Frozen, publicly readable record of one agent run.
public struct RunAttestation has key, store {
    id: UID,
    /// The logical agent identity this run is attributed to (caller-supplied).
    agent: address,
    /// The account that actually submitted the transaction (`ctx.sender()`).
    /// Recorded so a forged `agent` cannot hide who anchored the record.
    submitter: address,
    namespace: vector<u8>,
    run_id: u64,
    artifact_hash: vector<u8>,
    walrus_blob_id: vector<u8>,
    created_at_ms: u64,
}

/// Emitted on every successful attestation.
public struct Attested has copy, drop {
    agent: address,
    submitter: address,
    run_id: u64,
    artifact_hash: vector<u8>,
}

/// Anchor one run's artifact hash + Walrus blob id as a frozen object.
public fun attest(
    agent: address,
    namespace: vector<u8>,
    run_id: u64,
    artifact_hash: vector<u8>,
    walrus_blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(artifact_hash.length() == HASH_LEN, EBadHashLength);
    let submitter = ctx.sender();
    let att = RunAttestation {
        id: object::new(ctx),
        agent,
        submitter,
        namespace,
        run_id,
        artifact_hash,
        walrus_blob_id,
        created_at_ms: clock.timestamp_ms(),
    };
    event::emit(Attested { agent, submitter, run_id, artifact_hash });
    transfer::freeze_object(att);
}

// === Read-only accessors ===

public fun agent(att: &RunAttestation): address { att.agent }

public fun submitter(att: &RunAttestation): address { att.submitter }

public fun run_id(att: &RunAttestation): u64 { att.run_id }

public fun artifact_hash(att: &RunAttestation): vector<u8> { att.artifact_hash }

public fun walrus_blob_id(att: &RunAttestation): vector<u8> { att.walrus_blob_id }

public fun created_at_ms(att: &RunAttestation): u64 { att.created_at_ms }
