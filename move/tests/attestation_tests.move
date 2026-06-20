#[test_only]
module recall::attestation_tests;

use recall::attestation::{Self, RunAttestation};
use sui::clock;
use sui::test_scenario as ts;

// 32-byte keccak256 (the golden hash from the shared canonical core).
const HASH32: vector<u8> = x"afc1b94c625f1a2394e33e58f528bc6d55b2b79e9a89da0394c37259ee5a2428";

#[test]
fun attest_creates_frozen_readable_record() {
    let agent = @0xA;
    let submitter = @0xB; // submitter (tx sender) is intentionally NOT the agent
    let mut sc = ts::begin(submitter);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));

    attestation::attest(
        agent, b"walrus-ecosystem", 2,
        HASH32, b"blob123",
        &clk, ts::ctx(&mut sc),
    );
    clk.destroy_for_testing();

    // next tx: the frozen object is readable by anyone, fields intact,
    // and submitter is recorded separately from the claimed agent.
    ts::next_tx(&mut sc, submitter);
    let att = ts::take_immutable<RunAttestation>(&sc);
    assert!(attestation::agent(&att) == agent, 0);
    assert!(attestation::submitter(&att) == submitter, 1);
    assert!(attestation::run_id(&att) == 2, 2);
    assert!(attestation::artifact_hash(&att) == HASH32, 3);
    ts::return_immutable(att);
    ts::end(sc);
}

#[test, expected_failure(abort_code = attestation::EBadHashLength)]
fun attest_rejects_non_32_byte_hash() {
    let agent = @0xA;
    let mut sc = ts::begin(agent);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    // b"deadbeef" is only 8 bytes — not a keccak256 digest.
    attestation::attest(
        agent, b"walrus-ecosystem", 2,
        b"deadbeef", b"blob123",
        &clk, ts::ctx(&mut sc),
    );
    clk.destroy_for_testing();
    ts::end(sc);
}
