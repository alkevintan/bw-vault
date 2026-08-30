import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const source = fs
  .readFileSync(new URL("VaultModel.js", root), "utf8")
  .replace(/^\.pragma library\s*$/m, "");

const model = {};
vm.createContext(model);
vm.runInContext(source, model, { filename: "VaultModel.js" });

const rawList = JSON.stringify([
  {
    id: "item-1",
    name: '<img src="https://should-not-load.invalid/pixel"> Example',
    type: 1,
    username: "ada",
    uris: [{ uri: "https://example.test" }],
    password: "must-not-survive",
    notes: "recovery-code-must-not-survive",
  },
]);

const parsed = model.parseList(rawList);
assert.equal(parsed.length, 1);
assert.deepEqual(Object.keys(parsed[0]).sort(), [
  "id",
  "name",
  "searchKey",
  "type",
  "uris",
  "username",
]);
assert.equal(JSON.stringify(parsed).includes("must-not-survive"), false);
assert.equal(parsed[0].name.startsWith("<img"), true);
assert.equal(model.matchesQuery(parsed[0], "exa"), true);
assert.equal(model.matchesQuery(parsed[0], "missing"), false);

const detail = model.parseItem(
  JSON.stringify({
    id: "item-1",
    name: "Example",
    type: 1,
    username: "ada",
    password: "one-request-only",
    notes: "shown only in detail",
    uris: [{ uri: "https://example.test" }],
    ignoredSecret: "must-not-be-mapped",
  }),
);
assert.equal(detail.password, "one-request-only");
assert.equal("ignoredSecret" in detail, false);

assert.deepEqual(Array.from(model.listCommand("/plugin/bin/bw-vault-query")), [
  "/plugin/bin/bw-vault-query",
  "list",
]);
assert.deepEqual(Array.from(model.getCommand("/plugin/bin/bw-vault-query", "item-1")), [
  "/plugin/bin/bw-vault-query",
  "get",
  "item-1",
]);

console.log("VaultModel tests passed");
