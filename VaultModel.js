// VaultModel.js — Backing logic for the BW Vault overlay.
//
// Talks to the official `bw` CLI the way bw-tui did: reads go through the
// CLI, and the session token is kept in memory and mirrored to the OS keyring
// (Secret Service via secret-tool) so the master password is only needed
// once per machine.
//
// Authentication uses the personal API key (bw login --apikey). This is the
// recommended CLI auth when 2FA uses a method the CLI can't drive, and it
// avoids the interactive new-device verification prompt entirely. The flow
// is: `bw login --apikey` with BW_CLIENTID/BW_CLIENTSECRET, then `bw unlock`
// with the master password to obtain the session key.
//
// This file is pure JS. The QML side owns all Process lifecycle; the model
// only builds commands and parses output. Secrets (master password, session
// token, item passwords) are not retained by this module. List/detail reads go
// through bin/bw-vault-query, which reduces raw Bitwarden JSON before it enters
// the long-lived QML process.

.pragma library

const KEYRING_SERVICE = "com.aktivesolutions.bw-vault"
const KEYRING_ACCOUNT = "bw-session"
const PASSWORD_ENV = "BW_VAULT_MASTER_PASSWORD"

// buildCommand(args) — a `bw` invocation. The held session never travels on
// argv: command lines are world-readable through /proc/<pid>/cmdline, so
// --session would expose an active vault token to every local user. Reads
// instead carry the session through the child's BW_SESSION environment
// variable — see sessionEnvironment(). login / unlock / status establish or
// classify the session rather than use it, so they run without one.
function buildCommand(args) {
  return ["bw"].concat(args || [])
}

// Process `environment` map for commands that consume a held session. The
// token rides in BW_SESSION (what bw itself exports after `bw unlock --raw`),
// which stays inside the child's environment block instead of argv.
function sessionEnvironment(session) {
  var env = nonInteractiveEnvironment()
  if (session) {
    env.BW_SESSION = String(session)
  }
  return env
}

// Every `bw` child runs headless, so no invocation may ever wait on a prompt.
// This matters most for reads: with an expired --session, `bw list items` falls
// back to asking for the master password on the TTY, and a Quickshell child has
// no TTY — so without this it hangs or fails opaquely instead of exiting
// non-zero the way loadItems()'s speculative path needs it to.
//
// Quickshell merges `environment` into the inherited one rather than replacing
// it, so PATH / HOME / XDG_* still reach the child.
function nonInteractiveEnvironment() {
  var env = ({})
  env.BW_NOINTERACTION = "true"
  return env
}

// Process `environment` map. The master password travels through the child's
// environment (bw --passwordenv) instead of argv, so it never shows up in
// process listings or shell history.
function passwordEnvironment(password) {
  var env = nonInteractiveEnvironment()
  env[PASSWORD_ENV] = String(password || "")
  return env
}

// -- Session persistence -----------------------------------------------------
//
// secret-tool is the Secret Service CLI on Arch (libsecret). Storing the
// Bitwarden session mirrors what the desktop app does with the OS keyring.
// Failures are non-fatal: a session that cannot be persisted is simply held
// in memory for the process lifetime.

function sessionStoreCommand() {
  return ["secret-tool", "store", "--label=bw-vault session", "service", KEYRING_SERVICE, "account", KEYRING_ACCOUNT]
}

function sessionLookupCommand() {
  return ["secret-tool", "lookup", "service", KEYRING_SERVICE, "account", KEYRING_ACCOUNT]
}

function sessionClearCommand() {
  return ["secret-tool", "clear", "service", KEYRING_SERVICE, "account", KEYRING_ACCOUNT]
}

// -- Personal API key persistence --------------------------------------------
//
// The client_id / client_secret live in the same OS keyring as the session, as
// two separate entries under the shared service, so the unlock screen can
// pre-fill them after the first login. Rotating the key in the web app and
// logging in again overwrites the stored secret.

const API_KEY_ID_ACCOUNT = "bw-client-id"
const API_KEY_SECRET_ACCOUNT = "bw-client-secret"

function apiKeyIdLookupCommand() {
  return ["secret-tool", "lookup", "service", KEYRING_SERVICE, "account", API_KEY_ID_ACCOUNT]
}

function apiKeySecretLookupCommand() {
  return ["secret-tool", "lookup", "service", KEYRING_SERVICE, "account", API_KEY_SECRET_ACCOUNT]
}

function apiKeyIdStoreCommand() {
  return ["secret-tool", "store", "--label=bw-vault client id", "service", KEYRING_SERVICE, "account", API_KEY_ID_ACCOUNT]
}

function apiKeySecretStoreCommand() {
  return ["secret-tool", "store", "--label=bw-vault client secret", "service", KEYRING_SERVICE, "account", API_KEY_SECRET_ACCOUNT]
}

// -- Commands ----------------------------------------------------------------

// statusCommand() — where bw stands globally. Only ever called without a
// session: a held session is tested by using it (see loadItems), so status is
// the fallback that classifies locked vs unauthenticated.
function statusCommand() {
  return buildCommand(["status"])
}

// Personal API key login. The client id/secret travel through the process
// environment (bw reads BW_CLIENTID/BW_CLIENTSECRET), never argv. This is
// fully non-interactive and bypasses both 2FA and new-device verification.
function apikeyLoginCommand() {
  // --passwordenv points bw at BW_VAULT_MASTER_PASSWORD (set in
  // apikeyLoginEnvironment) rather than a TTY prompt, so login can never block
  // waiting on one. Note that on the --apikey path the login authenticates from
  // BW_CLIENTID / BW_CLIENTSECRET and leaves the vault locked; the master password
  // is normally consumed by the `bw unlock` that runUnlock() fires straight after.
  // UNVERIFIED: this flag has not been reproduced as the fix for fresh-machine
  // login against an empty BITWARDENCLI_APPDATA_DIR — do not read this comment as
  // documenting that cause.
  return buildCommand(["login", "--apikey", "--passwordenv", PASSWORD_ENV])
}

// Environment for login: client id/secret + master password off argv, and
// non-interactive mode so the CLI never waits on a TTY prompt.
function apikeyLoginEnvironment(clientId, clientSecret, password) {
  var env = passwordEnvironment(password)
  env.BW_CLIENTID = String(clientId || "")
  env.BW_CLIENTSECRET = String(clientSecret || "")
  return env
}

function unlockCommand() {
  return buildCommand(["unlock", "--passwordenv", PASSWORD_ENV, "--raw"])
}

function listCommand(helperPath) {
  return [String(helperPath || ""), "list"]
}

function getCommand(helperPath, id) {
  return [String(helperPath || ""), "get", String(id || "")]
}

function lockCommand() {
  return buildCommand(["lock"])
}

// -- Output parsing ----------------------------------------------------------

// bw status JSON: { serverUrl, lastSync, status: "unauthenticated"|"locked"|"unlocked" }
function parseStatus(raw) {
  var st = null
  try { st = JSON.parse(raw) } catch (e) { return null }
  if (!st || typeof st.status !== "string") return null
  return {
    authenticated: st.status !== "unauthenticated",
    locked: st.status === "locked",
    unlocked: st.status === "unlocked"
  }
}

var ITEM_TYPES = {
  "1": "login",
  "2": "secureNote",
  "3": "card",
  "4": "identity"
}

function itemTypeName(type) {
  return ITEM_TYPES[String(type)] || "item"
}

// Parse the already-minimized helper output. The list view never carries
// passwords or notes.
function parseList(raw) {
  var arr = null
  try { arr = JSON.parse(raw) } catch (e) { return [] }
  if (!Array.isArray(arr)) return []
  var out = []
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i]
    if (!it || typeof it !== "object") continue
    var uris = []
    if (Array.isArray(it.uris)) {
      for (var j = 0; j < it.uris.length; j++) {
        var u = it.uris[j]
        if (u && u.uri) uris.push(u.uri)
      }
    }
    var name = String(it.name || "")
    var username = String(it.username || "")
    out.push({
      id: String(it.id || ""),
      name: name,
      username: username,
      // Folded once here so matchesQuery doesn't lowercase both fields for every
      // item on every keystroke.
      searchKey: (name + " " + username).toLowerCase(),
      type: itemTypeName(it.type),
      uris: uris
    })
  }
  return out
}

// Detail read includes the password; callers must drop it after use.
function parseItem(raw) {
  var it = null
  try { it = JSON.parse(raw) } catch (e) { return null }
  if (!it || typeof it !== "object") return null
  var uris = []
  if (Array.isArray(it.uris)) {
    for (var j = 0; j < it.uris.length; j++) {
      var u = it.uris[j]
      if (u && u.uri) uris.push(u.uri)
    }
  }
  return {
    id: String(it.id || ""),
    name: String(it.name || ""),
    username: String(it.username || ""),
    password: String(it.password || ""),
    type: itemTypeName(it.type),
    notes: String(it.notes || ""),
    uris: uris
  }
}

// `query` must already be lowercased and trimmed — rebuildFilter() normalizes it
// once per keystroke instead of once per item. Items come from parseList(), so
// searchKey is always present.
function matchesQuery(item, query) {
  if (!query) return true
  return item.searchKey.indexOf(query) !== -1
}
