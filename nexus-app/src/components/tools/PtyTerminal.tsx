import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

/**
 * PtyTerminal — a real, interactive terminal backed by a Rust PTY (ConPTY on
 * Windows). Unlike the legacy one-shot SystemTerminal, this streams stdin/stdout
 * both ways, so interactive programs work — including the `aether` REPL with its
 * arrow-key menus, autocomplete, and live rendering.
 *
 * Protocol mirrors src-tauri/src/commands/pty.rs.
 */
export const PtyTerminal: React.FC<{ initialCommand?: string; cwd?: string }> = ({
  initialCommand,
  cwd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = "pty-" + Math.random().toString(36).slice(2, 10);

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      allowProposedApi: true,
      theme: {
        background: "#0a0e14",
        foreground: "#c5e8f0",
        cursor: "#22d3ee",
        cursorAccent: "#0a0e14",
        selectionBackground: "#1f3a44",
        black: "#0a0e14",
        red: "#ff5f87",
        green: "#5ef1a4",
        yellow: "#ffd95f",
        blue: "#5fb0ff",
        magenta: "#c792ea",
        cyan: "#22d3ee",
        white: "#c5e8f0",
        brightBlack: "#5a7682",
        brightRed: "#ff7aa2",
        brightGreen: "#7df7bb",
        brightYellow: "#ffe48a",
        brightBlue: "#8ac8ff",
        brightMagenta: "#d9b3f0",
        brightCyan: "#67e8f9",
        brightWhite: "#eafcff",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    if (!containerRef.current) return;
    term.open(containerRef.current);
    try {
      fit.fit();
    } catch {
      /* container not laid out yet */
    }

    let unlistenData: UnlistenFn | undefined;
    let unlistenExit: UnlistenFn | undefined;
    let killed = false;

    (async () => {
      unlistenData = await listen<string>(`pty:data:${id}`, (e) => {
        term.write(e.payload);
      });
      unlistenExit = await listen(`pty:exit:${id}`, () => {
        term.write("\r\n\x1b[2m[process exited — close and reopen to restart]\x1b[0m\r\n");
      });

      try {
        await invoke("pty_spawn", {
          id,
          cwd: cwd ?? null,
          cols: term.cols,
          rows: term.rows,
        });
        if (initialCommand) {
          await invoke("pty_write", { id, data: initialCommand + "\r" });
        }
      } catch (err) {
        term.write(`\r\n\x1b[31mFailed to start terminal: ${String(err)}\x1b[0m\r\n`);
      }
    })();

    // Forward keystrokes and resize events to the PTY.
    const onData = term.onData((data) => {
      invoke("pty_write", { id, data }).catch(() => {});
    });
    const onResize = term.onResize(({ cols, rows }) => {
      invoke("pty_resize", { id, cols, rows }).catch(() => {});
    });

    // Refit on container resize.
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(containerRef.current);

    // Focus for immediate typing.
    setTimeout(() => term.focus(), 50);

    return () => {
      killed = true;
      ro.disconnect();
      onData.dispose();
      onResize.dispose();
      unlistenData?.();
      unlistenExit?.();
      invoke("pty_kill", { id }).catch(() => {});
      term.dispose();
      void killed;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        // Clicking anywhere focuses the terminal.
        const ta = (e.currentTarget.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null);
        ta?.focus();
      }}
      style={{
        width: "100%",
        height: "100%",
        padding: "6px 8px",
        background: "#0a0e14",
        overflow: "hidden",
      }}
    />
  );
};

export default PtyTerminal;
