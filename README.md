# BW Vault

A Bitwarden vault in the [Omarchy](https://omarchy.org/) bar, powered by the official [`bw`](https://github.com/bitwarden/cli) CLI. Click the padlock, type a few letters, press enter — the password is on your clipboard and you never left the window you're pasting into.

Rewritten in Quickshell/QML from the [bw-tui](https://github.com/keboy/bw-tui) Bubble Tea TUI.

![Search and copy](screenshot-list.png)

![Item detail](screenshot-detail.png) ![First run](screenshot-firstrun.png)

*Screenshots are of the fixture vault in `test/`, not a real one — see [Development](#development).*

## How it's put together

`bw` is a Node program and a cold start costs about four seconds. That number shapes everything here.

The session, the item list and every `bw` child live in a **service** the shell mounts once and keeps. The dropdown is a view onto it. Opening the dropdown against a warm list costs nothing measurable — filtering 215 items lands well under a tenth of a second, because no `bw` runs at all. Only the password itself is fetched on demand, because only the password is worth never caching.

What that caching does and does not cover is spelled out in [Security notes](#security-notes). The short version: item *metadata* now outlives the panel, and passwords never do.

## Features

- **Bar dropdown** — lock state at a glance; click for a search box over your vault. Enter copies the password. `ctrl+u` copies the username with no `bw` call at all, because the username is already in the cached list.
- **Item detail** — `ctrl+enter` opens the selected item: username, password (hidden until you press `p`), URI, notes. The only screen that ever draws a secret.
- **Master-password unlock** — in the dropdown. The password travels through the child process environment (`bw --passwordenv`), never argv, and its environment is cleared when the child exits.
- **API key authentication** — authenticates with your [personal API key](https://bitwarden.com/help/personal-api-key/) (`bw login --apikey`), which needs no interactive 2FA and skips new-device verification. Entered once per machine in the setup window; see [Setup](#setup).
- **Session persistence** — the session key is mirrored to the OS keyring (Secret Service via `secret-tool`), so the master password is asked for once per machine and survives a shell restart.
- **Idle cache expiry** — the cached list is forgotten after `cacheTtlMinutes` of no vault activity (15 by default). The session is untouched, so recovering costs one `bw list` and no master password.
- **Auto-lock** — the vault locks itself after `autoLockMinutes` of no vault activity (30 by default, `0` disables). Locking drops the session and the keyring copy, so the master password is needed again.
- **Clipboard auto-wipe** — a copied value is wiped about 20 seconds later, but only if the clipboard still holds it.
- **Native Omarchy theming** — built on `Panel`, `KeyboardPanel`, `TextField` and `Color.*` tokens, so it matches your theme.

### Scope

Read and copy only. It does not create, edit or delete items, and it does not cover attachments, organizations/collections, or multiple accounts. Use the official apps for those.

## Install

```sh
omarchy plugin add https://github.com/alkevintan/bw-vault.git --enable
```

`--enable` puts the padlock in your bar and asks which section. Without it, run `omarchy plugin enable com.aktivesolutions.bw-vault --section right` afterwards.

> If the plugin already has a `plugins[]` entry in `shell.json` from an earlier version, `omarchy plugin enable --section right` will report "Enabled and moved" and change nothing. Remove that entry first; the `bar.layout` entry keeps the service enabled on its own.

## Setup

Once per machine, store your Bitwarden personal API key. The dropdown shows a **Set up API key…** button until one is stored (or run `omarchy-shell com.aktivesolutions.bw-vault setup`). It opens a small window with `client_id` and `client_secret` fields; press **ctrl+o** there to open the web vault in your browser on the Keys page (then View API Key). The window stays open while you copy the two values across, and the secret is piped to `secret-tool` on stdin, so it never appears in the process list.

To remove the stored key: `omarchy-shell com.aktivesolutions.bw-vault clearKey`.

If `bw` is already logged in by some other means, you can skip this entirely: the dropdown will ask for your master password and unlock against the existing login.

## Usage

Bind the dropdown in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + B", "Bitwarden vault", "omarchy-shell bw-vault-bar toggle")
```

Or click the shield in the bar. **Right-clicking** it locks the vault.

Locking is worth its own binding too — `ctrl+l` inside the dropdown only reaches you while the dropdown is open:

```lua
o.bind("SUPER + ALT + B", "Lock vault", "omarchy-shell com.aktivesolutions.bw-vault lock")
```

It can also be opened with the search line already filled in — useful from a script, or a per-site keybinding:

```sh
omarchy-shell bw-vault-bar search github
```

`search` only filters metadata that is already in the shell process. Nothing in the IPC surface reads, fetches or copies a secret: a password always costs a keystroke on a panel someone is looking at.

### Keys

**Search list**

| Key | Action |
|-----|--------|
| `type` | Filter items |
| `↑` `↓` | Move through results |
| `enter` | Copy the password (one `bw get`, about four seconds — the panel says it's fetching) |
| `ctrl+u` | Copy the username (instant; already in the cached list) |
| `ctrl+enter` | Open item detail |
| `ctrl+l` | Lock the vault |
| `ctrl+t` | Cycle the auto-lock timeout: off → 5 → 15 → 30 → 60 → 120 min → off. Lasts until the shell restarts; the `autoLockMinutes` setting is the permanent value |
| `esc` | Close |

Clicking a row copies its password; right-clicking a row opens its detail.

**Item detail**

| Key | Action |
|-----|--------|
| `p` | Reveal / hide the password |
| `c` | Copy the username |
| `y` | Copy the password |
| `ctrl+l` | Lock the vault |
| `esc` / `←` | Back to the list |

**Unlock**

Type your master password and press enter.

### Settings

Set these through Omarchy's bar widget settings, or directly on the widget's `shell.json` entry.

| Setting | Default | What |
|---|---|---|
| `maxResults` | `8` | Rows shown in the dropdown |
| `cacheTtlMinutes` | `15` | Forget the cached item list after this many idle minutes. `0` keeps it until you lock |
| `autoLockMinutes` | `30` | Lock the vault after this many idle minutes. `0` never auto-locks |
| `lockOnRightClick` | `true` | Right-clicking the bar icon locks the vault |
| `showCount` | `false` | Show the item count next to the bar icon |

## Upgrading from 1.x

Version 2.0 removes the fullscreen overlay. Two things change for you:

1. **Your keybinding.** `omarchy-shell shell toggle com.aktivesolutions.bw-vault` no longer resolves to anything. Use `omarchy-shell bw-vault-bar toggle`.
2. **First-run API key entry** moved from the overlay's floating card to a separate setup window. A key already in your keyring is picked up as-is; nothing to redo.

Item metadata is now cached between opens where 1.x dropped it on every close — see [Security notes](#security-notes) if that matters to you.

## Requirements

- [Omarchy](https://omarchy.org/) 4 (Quattro)
- [`bw`](https://bitwarden.com/help/bitwarden-cli/) — the Bitwarden CLI
- `libsecret` (`secret-tool`) — OS keyring access
- `wl-clipboard` (`wl-copy`, `wl-paste`) — clipboard

All three are usually already present on Omarchy. If one is missing, add it with your usual package tooling — the plugin never installs anything itself, and never invokes a package manager.

## Troubleshooting

- `bw: command not found` → install the [Bitwarden CLI](https://bitwarden.com/help/bitwarden-cli/).
- `secret-tool: command not found` → install `libsecret`.
- The padlock isn't in the bar → `omarchy plugin list`, and see the note under [Install](#install).
- The dropdown says "Not set up" → click **Set up API key…**.
- Everything feels slow → that's `bw`. Check `cacheTtlMinutes` hasn't been set to something tiny; each expiry costs one four-second `bw list`.

## Remove

```sh
omarchy plugin disable com.aktivesolutions.bw-vault
omarchy plugin remove com.aktivesolutions.bw-vault
# before removing, if you want the keyring entries gone:
omarchy-shell com.aktivesolutions.bw-vault clearKey
```

## Security notes

- The client_id and client_secret are stored in your OS keyring via `secret-tool`, never in a plaintext file, and are passed to `bw login --apikey` through the child process environment rather than argv. The master password only ever lives in a child's environment (`BW_VAULT_MASTER_PASSWORD`).
- Credentials handed to `bw login` / `bw unlock` have that environment cleared when the child exits, on both the success and failure paths. Before 2.0 the master password stayed set on the Process until the next unlock overwrote it.
- **Item metadata is cached between opens, and that is a real change from 1.x.** `parseList()` strips passwords out of `bw list` output before anything reaches a property, so what the service holds is names, usernames, ids and URIs — a map of your vault, not its contents. It lives in the always-loaded shell process until you lock, or until `cacheTtlMinutes` of idleness passes. If you would rather have the old behaviour at the cost of a four-second wait per open, set `cacheTtlMinutes` to 1; the session is unaffected either way.
- Item passwords are fetched on demand (`bw get item <id>`). The password is handed to the widget through a signal and is never assigned to a property on the shared service. The widget holds it only while the detail screen is showing it, and drops it on the way back to the list.
- The detail screen is the only place a secret is drawn, and it is masked until you press `p`. A bar dropdown sits in the open — that is worth remembering before revealing one in a meeting.
- A `bw list` started before a lock cannot repopulate the cache after it: in-flight children carry the generation they started in and drop their results if it has moved.
- The session key is stored in the OS keyring. If that fails, it is held in memory only and lost on shell restart.
- This plugin runs unsandboxed in your shell process, like all Omarchy plugins. It has access to your session and can run arbitrary commands. Review the source before trusting it.

## Development

```sh
omarchy plugin validate .
omarchy restart shell
```

```
manifest.json        # plugin manifest (id: com.aktivesolutions.bw-vault)
Service.qml          # session, item metadata, every bw child. Mounted once by the shell
BarWidget.qml        # bar icon + dropdown: unlock, search, copy, detail
VaultModel.js        # bw CLI command building + JSON parsing (pure JS)
SetupWindow.qml      # one-time API key entry window
test/demo            # run the dropdown against a fixture vault, in its own shell
test/demo-vault.json # the fixture vault
test/fixtures/       # stub `bw` and `secret-tool`
```

### Running it without a real vault

```sh
test/demo              # starts locked, on the first-run screen
test/demo --unlocked   # starts with the fixture vault open
```

This launches a second Quickshell instance with its own minimal bar, so the running Omarchy shell is untouched. `PATH` is prefixed with `test/fixtures`, whose `bw` and `secret-tool` stubs answer from `test/demo-vault.json` and a temp directory — **`secret-tool` is stubbed as well as `bw`, because otherwise a fixture unlock would write its fake session over your real one in the keyring.** No real vault, keyring or network is involved.

Drive it over its own IPC socket rather than by typing into it:

```sh
qs ipc -p <config-dir-printed-at-startup> call bw-vault-bar search git
BW_DEMO_SCRIPT=detail:github test/demo --unlocked   # open straight onto an item
```

The screenshots in this README were taken that way.

Live state, with no secrets in it:

```sh
omarchy-shell com.aktivesolutions.bw-vault state   # the service
omarchy-shell bw-vault-bar status                  # the dropdown
```

Three Omarchy quirks that will cost you an hour if you meet them cold:

- A **new** `.qml` file in a plugin directory fails to load with `File name case mismatch` until the shell restarts — the QML engine caches the directory listing at startup. Hot-reload only covers files that already existed.
- A **new** `ipcTarget` also needs a shell restart to register, and after a hot-reload the *stale* instance keeps the old target: you get `Handler was registered but will not be used`, and IPC calls land on a widget that is no longer on screen.
- `omarchy plugin enable --section right` silently does nothing if the plugin already has a `plugins[]` entry in `shell.json`.

After editing, `omarchy restart shell` rather than trusting hot-reload.

## License

MIT — see [LICENSE](LICENSE).
