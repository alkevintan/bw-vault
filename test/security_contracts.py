#!/usr/bin/env python3

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent.parent
service = (ROOT / "Service.qml").read_text()
widget = (ROOT / "BarWidget.qml").read_text()
model = (ROOT / "VaultModel.js").read_text()
helper = (ROOT / "bin" / "bw-vault-query").read_text()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


require(
    'command: ["wl-copy", "--sensitive"]' in service,
    "credential copies must carry wl-copy --sensitive",
)

text_blocks = len(re.findall(r"^\s*Text \{", widget, re.MULTILINE))
plain_text_guards = widget.count("textFormat: Text.PlainText")
require(text_blocks == plain_text_guards, "every QML Text block must force PlainText")

require("if (getProc.running)" in service, "fetchItem must reject overlapping requests")
require(
    "signal itemFetched(string token, var item, string password)" in service,
    "password must travel separately from cached item metadata",
)

require(
    "onScreenChanged: Qt.callLater(function() { root.focusCurrentScreen() })" in widget,
    "screen changes must explicitly transfer keyboard focus",
)
require(
    'if (root.screen === "detail") keyCatcher.forceActiveFocus()' in widget,
    "detail shortcuts require PanelKeyCatcher focus",
)
require(
    'blocked: root.screen !== "detail" &&' in widget,
    "a stale hidden-field focus must not block detail keys",
)

for forbidden_collector in ("sessionLookupOut", "apiKeySecretLookupOut", "getOut"):
    require(forbidden_collector not in service, f"secret collector remains: {forbidden_collector}")

parse_list = model.split("function parseList", 1)[1].split("function parseItem", 1)[0]
require("notes:" not in parse_list, "list cache must not retain notes")
require("password:" not in parse_list, "list cache must not retain passwords")

require(
    'buildCommand(["list", "items"])' not in model,
    "raw list query must stay in short-lived helper",
)
require(
    'buildCommand(["get", "item"' not in model,
    "raw item query must stay in short-lived helper",
)
require("bw list items | jq -c" in helper, "helper must minimize list output before QML")
require("bw get item \"$2\" | jq -c" in helper, "helper must minimize detail output before QML")

for process_name in ("listProc", "getProc", "lockProc"):
    require(
        f"{process_name}.environment = VaultModel.nonInteractiveEnvironment()" in service,
        f"{process_name} must clear its BW_SESSION environment",
    )

require(
    'if (!waitForCliLock) service.fetchGlobalStatus()' in service,
    "lock must not query status until the CLI lock child exits",
)
require(
    "if (requestGeneration === service.generation) service.fetchGlobalStatus()" in service,
    "the lock child must refresh status only for the active generation",
)
require(
    "property bool clearAfterExit: false" in service and "sessionStore.clearAfterExit = true" in service,
    "locking must serialize session-store termination before keyring clear",
)

print("Security contract tests passed")
