import test from "node:test";
import assert from "node:assert/strict";
import { hashPortalPassword, verifyPortalPassword, hashPortalSession } from "../lib/portal/auth";

test("portal passwords are salted and verifiable",()=>{
 const stored=hashPortalPassword("A-strong-portal-password-2026");
 assert.match(stored,/^scrypt\$16384\$8\$1\$/);
 assert.equal(verifyPortalPassword("A-strong-portal-password-2026",stored),true);
 assert.equal(verifyPortalPassword("wrong-password",stored),false);
});
test("portal sessions are one-way hashes",()=>{
 const hash=hashPortalSession("session-token");
 assert.equal(hash.length,64);
 assert.notEqual(hash,"session-token");
});
