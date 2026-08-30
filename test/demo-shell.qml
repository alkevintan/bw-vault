import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons

// NOTE: qs.Ui is deliberately not imported here. It exports a type called
// BarWidget, which would collide with the plugin's own BarWidget.qml in this
// directory and make the reference below ambiguous.
//
// Minimal host for BarWidget.qml, so the dropdown can be driven without the
// Omarchy shell. It stands in for the two objects the widget is handed at
// runtime — the bar and the shell — and mounts the service itself, which the
// real shell would have done from the manifest.
ShellRoot {
  id: host

  Service {
    id: vaultService
    manifest: ({
      id: "com.aktivesolutions.bw-vault",
      __sourceDir: String(Quickshell.env("BW_VAULT_PLUGIN_DIR") || "")
    })
  }

  // The `shell` side of what a bar widget expects.
  QtObject {
    id: shellStub
    function serviceFor(id) { return vaultService }
    function summon(id, payload) {}
    function hide(id) {}
  }

  PanelWindow {
    id: win
    anchors.top: true
    anchors.left: true
    anchors.right: true
    // Sit under the real bar rather than on top of it, so a screenshot shows
    // the demo and the desktop rather than two bars fighting.
    margins.top: Style.bar.sizeHorizontal + Style.space(8)
    implicitHeight: Style.bar.sizeHorizontal
    color: Color.bar.background
    WlrLayershell.namespace: "bw-vault-demo"
    WlrLayershell.layer: WlrLayer.Top
    exclusionMode: ExclusionMode.Ignore

    // The `bar` side. Only the surface the Ui components actually read.
    Item {
      id: barStub
      anchors.fill: parent

      readonly property var shell: shellStub
      readonly property string position: "top"
      readonly property bool vertical: false
      readonly property int barSize: Style.bar.sizeHorizontal
      readonly property int sizeHorizontal: Style.bar.sizeHorizontal
      readonly property string fontFamily: Style.font.family
      readonly property color foreground: Color.bar.text
      readonly property color barForeground: Color.bar.text
      readonly property color urgent: Color.bar.active
      readonly property bool foregroundAnimationEnabled: true
      property var activePopout: null
      readonly property var clickTargets: []

      function showTooltip(item, text) {}
      function hideTooltip(item) {}
      function targetBelongsToWindow(t, w) { return true }
      function requestPopout(owner) { activePopout = owner }
      function releasePopout(owner) { if (activePopout === owner) activePopout = null }
      function moduleWidgets() { return [widget] }

      Text {
        anchors.left: parent.left
        anchors.leftMargin: Style.space(10)
        anchors.verticalCenter: parent.verticalCenter
        text: "bw-vault demo — fixture vault, no real credentials"
        color: Qt.darker(Color.bar.text, 1.6)
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }

      // Screenshot driver. `BW_DEMO_SCRIPT=list:git` opens the dropdown with a
      // query; `BW_DEMO_SCRIPT=detail:git` goes one step further and opens the
      // selected item. Keeps screenshots reproducible and keyboard-free — the
      // alternative is synthesising keystrokes into whatever happens to be
      // focused, which is a good way to type into someone else's terminal.
      Timer {
        running: String(Quickshell.env("BW_DEMO_SCRIPT") || "") !== ""
        interval: 1200
        repeat: false
        onTriggered: {
          var parts = String(Quickshell.env("BW_DEMO_SCRIPT")).split(":")
          widget.query = parts.length > 1 ? parts[1] : ""
          widget.open()
          widget.rebuild()
          if (parts[0] === "detail") detailTimer.restart()
          else if (parts[0] === "unlock") unlockTimer.restart()
        }
      }

      // Exercises the real unlock chain — submitUnlock -> unlockWithStored ->
      // bw unlock -> session stored -> list — without a keyboard. The fixture
      // accepts any non-empty password.
      Timer {
        id: unlockTimer
        interval: 500
        repeat: false
        onTriggered: {
          widget.masterPassword = "demo-master-password"
          widget.submitUnlock()
        }
      }

      Timer {
        id: detailTimer
        interval: 500
        repeat: false
        onTriggered: widget.fetchSelected("detail")
      }

      BarWidget {
        id: widget
        anchors.right: parent.right
        anchors.rightMargin: Style.space(10)
        anchors.verticalCenter: parent.verticalCenter
        bar: barStub
        moduleName: "com.aktivesolutions.bw-vault"
        settings: ({ maxResults: 8, cacheTtlMinutes: 15, showCount: true })
      }
    }
  }
}
