"""
Regression tests for IPC response construction.

Guards two bugs that surfaced in the GUI:
  1. KernelResponse(...) raised "missing required positional argument:
     'message_type'" when handlers built error responses without it
     (e.g. messaging disabled). message_type now defaults to "response".
  2. The plugin-list payload merged get_status() (which has a dict "plugins"
     key) over the plugin LIST, so the UI's filtered.map() blew up. The list
     must win.
"""

from main import KernelResponse


def test_kernel_response_message_type_defaults():
    # Must not raise — message_type is optional now.
    r = KernelResponse(id="x", success=False, error="nope")
    assert r.message_type == "response"
    assert r.success is False
    assert r.error == "nope"


def test_plugin_list_payload_keeps_list():
    # Mirrors _handle_plugin's merge: status also carries a "plugins" dict.
    plugin_data = [{"name": "a"}, {"name": "b"}]
    status = {"total": 2, "loaded": 1, "errored": 0, "plugins_dir": "/x",
              "plugins": {"a": {}, "b": {}}}  # dict, must NOT win
    data = {**status, "plugins": plugin_data}
    assert isinstance(data["plugins"], list)
    assert data["plugins"] == plugin_data
    assert data["plugins_dir"] == "/x"
