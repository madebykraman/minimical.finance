import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paths=[
 "app/api/client-portal/auth/route.ts",
 "app/api/client-portal/data/route.ts",
 "app/api/client-portal/logout/route.ts",
 "app/api/client-portal/[slug]/document/[id]/route.ts",
 "app/api/client-portal/[slug]/invoice/[id]/pdf/route.ts",
 "app/api/client-portal/[slug]/receipt/[paymentId]/route.ts",
 "app/api/client-portal/[slug]/statement/route.ts",
 "app/api/client-portal/[slug]/profile/route.ts"
];
test("all protected portal routes use the same session cookie",()=>{
 const auth=readFileSync(paths[0],"utf8"); assert.match(auth,/portal_session/);
 for(const p of paths.slice(1)) {
   const s=readFileSync(p,"utf8");
   assert.match(s,/portal_session/);
   assert.doesNotMatch(s,/finos_portal_session/);
 }
});
