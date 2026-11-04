import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// First-run API key entry, in a real window rather than the dropdown.
//
// The dropdown cannot host this: you copy client_id and client_secret out of a
// browser one at a time, and a bar panel dismisses on any click outside it, so
// the trip back for the second value would close the form and lose the first.
// A FloatingWindow is an ordinary toplevel — it stays put while you go to the
// browser and come back.
//
// The secret goes to Service.storeApiKey(), which pipes it to `secret-tool` on
// stdin. It is cleared from the field as soon as it is handed over.
FloatingWindow {
  id: win

  // Service.qml, which owns the keyring writes.
  property var svc: null

  title: "BW Vault setup"
  color: Color.background
  implicitWidth: 460
  implicitHeight: 330
  minimumSize: Qt.size(420, 300)

  // Where the personal API key lives. Self-hosted servers have their own host;
  // this is the official web vault, straight to the Keys page.
  readonly property string keysUrl: "https://vault.bitwarden.com/#/settings/security/security-keys"

  function openKeysPage() { Qt.openUrlExternally(win.keysUrl) }

  readonly property bool canSave: idField.text.trim() !== "" && secretField.text !== ""

  function save() {
    if (!win.canSave || !win.svc) return
    win.svc.storeApiKey(idField.text.trim(), secretField.text)
    idField.text = ""
    secretField.text = ""
    win.visible = false
  }

  // Never leave a half-typed secret sitting in a hidden window.
  onVisibleChanged: {
    if (visible) {
      Qt.callLater(function() { idField.forceActiveFocus() })
    } else {
      idField.text = ""
      secretField.text = ""
    }
  }

  FocusScope {
    anchors.fill: parent
    focus: true
    Keys.onEscapePressed: win.visible = false
    Keys.onPressed: function(event) {
      if ((event.modifiers & Qt.ControlModifier) && event.key === Qt.Key_O) {
        win.openKeysPage()
        event.accepted = true
      }
    }

    Column {
      anchors.fill: parent
      anchors.margins: Style.space(20)
      spacing: Style.space(12)

      Text {
        width: parent.width
        text: "Set up BW Vault"
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.display
        font.bold: true
      }

      Text {
        width: parent.width
        text: "Paste your Bitwarden personal API key. Press ctrl+o to open the web vault, then choose View API Key. This window stays open while you switch to the browser."
        color: Qt.darker(Color.foreground, 1.45)
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
        wrapMode: Text.WordWrap
      }

      TextField {
        id: idField
        width: parent.width
        placeholderText: "client_id"
        onAccepted: secretField.forceActiveFocus()
      }

      TextField {
        id: secretField
        width: parent.width
        placeholderText: "client_secret"
        password: true
        onAccepted: win.save()
      }

      Row {
        spacing: Style.space(8)

        Button {
          text: "Save"
          bordered: true
          enabled: win.canSave
          opacity: win.canSave ? 1 : 0.5
          onClicked: win.save()
        }

        Button {
          text: "Open web vault (ctrl+o)"
          onClicked: win.openKeysPage()
        }

        Button {
          text: "Cancel"
          onClicked: win.visible = false
        }
      }

      Text {
        width: parent.width
        text: "Stored in your OS keyring, never on disk. Afterwards the dropdown only asks for your master password."
        color: Qt.darker(Color.foreground, 1.7)
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        wrapMode: Text.WordWrap
      }
    }
  }
}
