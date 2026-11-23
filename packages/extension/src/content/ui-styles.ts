// Styles for the in-page UI. They live inside Pinprompt's shadow root, so the page's CSS cannot
// reach them and they cannot reach the page. Colors come from the logo.
export function uiStyles(fonts: { sans: string; mono: string }): string {
  return `
:host {
  all: initial;
  --font-sans: ${fonts.sans};
  --font-mono: ${fonts.mono};
  --ground: #121110;
  --raised: #1a1917;
  --line: #3a3633;
  --line-soft: #2a2724;
  --paper: #efebe4;
  --muted: #a8a196;
  --accent: #e8479f;
  --accent-light: #ff7ad0;
  --accent-dark: #c21d86;
  --ok: #8fd9a8;
  --warn: #f2c46b;
  --danger: #f08a8a;
  --line-faint: #22201d;
  --key: #26241f;
  --sep: #57534e;
  --thumb: #f7f6f4;
  --scrim: rgba(18, 17, 16, 0.55);
  --accent-gradient: linear-gradient(160deg, var(--accent-light), var(--accent-dark));
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.4;
  color: var(--paper);
}
* { box-sizing: border-box; margin: 0; }
button { font: inherit; line-height: inherit; color: inherit; cursor: pointer; border: 0; background: none; padding: 0; }
.interactive { pointer-events: auto; }
[hidden] { display: none !important; }

/* hover, region and pin outlines */
.box { position: fixed; border: 2px solid var(--accent); background: rgba(232, 71, 159, 0.08); border-radius: 8px; pointer-events: none; }
.box.region { border-style: dashed; background: rgba(232, 71, 159, 0.06); }
.box.soft { border: 1.5px solid rgba(232, 71, 159, 0.55); background: transparent; }
.box.drag { border-color: var(--paper); border-style: dashed; background: rgba(246, 242, 235, 0.14); }
.chip { position: fixed; font-family: var(--font-mono); font-size: 11.5px; color: #fff; background: var(--ground); border-radius: 6px; padding: 4px 8px; white-space: nowrap; pointer-events: none; max-width: 70vw; overflow: hidden; text-overflow: ellipsis; }
.chip b { color: var(--accent-light); font-weight: 500; }
.hint { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); background: var(--ground); border-radius: 999px; padding: 8px 14px; font-size: 13px; display: flex; gap: 10px; align-items: center; box-shadow: 0 8px 24px rgba(10, 10, 10, 0.22); pointer-events: none; white-space: nowrap; }
.hint .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.hint .sep { color: var(--sep); }
kbd { font-family: var(--font-mono); font-size: 11px; padding: 2px 6px; border-radius: 5px; background: var(--key); border: 1px solid var(--line); color: var(--paper); }

/* numbered pin markers */
.marker { font-variant-numeric: tabular-nums; position: fixed; width: 28px; height: 28px; border-radius: 50% 50% 50% 4px; background: var(--accent-gradient); color: #fff; font-size: 13px; font-weight: 700; display: grid; place-items: center; box-shadow: 0 0 0 2.5px #fff, 0 4px 12px rgba(194, 29, 134, 0.35); pointer-events: auto; cursor: pointer; }
.marker.empty { background: var(--ground); color: var(--accent-light); }
.tip { position: fixed; width: 280px; background: var(--ground); border-radius: 12px; padding: 12px 14px; font-size: 13.5px; line-height: 1.45; box-shadow: 0 14px 40px rgba(10, 10, 10, 0.3); pointer-events: none; white-space: pre-wrap; }
.who { font-family: var(--font-mono); font-size: 11px; color: var(--muted); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.who b { color: var(--accent-light); font-weight: 500; }

/* composer */
.composer { position: fixed; width: 380px; max-width: calc(100vw - 24px); background: var(--ground); border-radius: 14px; box-shadow: 0 18px 50px rgba(10, 10, 10, 0.35); padding: 14px; pointer-events: auto; }
.composer .meta { display: flex; gap: 8px; align-items: center; font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); }
.composer .meta b { color: var(--accent-light); font-weight: 500; }
.composer .meta .route { margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
.composer .meta .path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.composer textarea { display: block; width: 100%; margin-top: 10px; min-height: 84px; max-height: 50vh; resize: none; border-radius: 10px; background: var(--raised); border: 1px solid var(--line); padding: 10px 12px; font: inherit; font-size: 14px; line-height: 1.45; color: var(--paper); outline: none; }
.composer textarea:focus { border-color: var(--accent); }
.composer .foot { margin-top: 10px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.composer .foot .spacer { flex: 1; }
.composer .note { margin-top: 8px; font-size: 12px; color: var(--warn); }
.btn { border-radius: 8px; padding: 7px 12px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.btn.ghost { color: var(--muted); border: 1px solid var(--line); }
.btn.ghost:hover:enabled { color: var(--paper); border-color: var(--muted); }
.btn.danger { color: var(--danger); }
.btn.danger:hover { background: rgba(240, 138, 138, 0.1); }
.btn.primary, .bubble .copy { color: #fff; background: var(--accent-gradient); }
.btn.primary:hover:enabled, .bubble .copy:hover { filter: brightness(1.08); }
.btn:active:enabled, .bubble .copy:active, .icon-btn:active { transform: translateY(1px); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn:focus-visible, .marker:focus-visible, .bubble-main:focus-visible, .bubble .copy:focus-visible, .icon-btn:focus-visible, .row:focus-visible { outline: 2px solid var(--accent-light); outline-offset: 2px; }

/* the bubble: the bare logo tile when empty, a pill with the count and Copy once there are pins */
.bubble { position: fixed; display: flex; align-items: center; gap: 6px; padding: 4px; border-radius: 14px; background: var(--ground); box-shadow: 0 10px 30px rgba(10, 10, 10, 0.28); pointer-events: auto; user-select: none; touch-action: none; }
.bubble.active { box-shadow: 0 0 0 2px var(--accent), 0 10px 30px rgba(10, 10, 10, 0.28); }
.bubble-main { display: flex; align-items: center; gap: 2px; border-radius: 8px; height: 36px; }
.bubble img { width: 36px; height: 36px; display: block; flex: none; -webkit-user-drag: none; }
.bubble .count { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 24px; text-align: center; }
.bubble .copy { height: 36px; border-radius: 9px; padding: 0 12px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.bubble.solo { padding: 0; background: none; border-radius: 10px; }
.bubble.solo .bubble-main { height: auto; border-radius: 10px; }
.bubble.solo img { width: 44px; height: 44px; }
.bubble.solo.active { box-shadow: 0 0 0 2px var(--accent), 0 10px 30px rgba(10, 10, 10, 0.28); }

/* the tray */
.tray { position: fixed; width: 380px; max-width: calc(100vw - 24px); max-height: min(70vh, 640px); display: flex; flex-direction: column; background: var(--ground); border-radius: 16px; box-shadow: 0 22px 60px rgba(10, 10, 10, 0.4); overflow: hidden; pointer-events: auto; }
.tray .top { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); }
.tray .top b { font-size: 15px; }
.tray .top .sub { color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tray .top .icons { margin-left: auto; display: flex; gap: 6px; flex: none; }
.icon-btn { width: 28px; height: 28px; flex: none; border-radius: 8px; border: 1px solid var(--line); display: grid; place-items: center; color: var(--muted); }
.icon-btn:hover { color: var(--paper); border-color: var(--muted); }
.icon-btn.danger:hover { color: var(--danger); border-color: var(--danger); }
.tray .list { overflow-y: auto; }
.row { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line-faint); align-items: flex-start; width: 100%; text-align: left; }
.row:hover { background: var(--raised); }
.row .num { flex: none; width: 24px; height: 24px; border-radius: 50% 50% 50% 4px; background: var(--accent-gradient); color: #fff; font-size: 12px; font-weight: 700; display: grid; place-items: center; }
.row .num.empty { background: var(--raised); color: var(--accent-light); border: 1px solid var(--line); }
.row .text { flex: 1; min-width: 0; }
.row .text p { font-size: 13.5px; line-height: 1.4; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.row .text p.missing { color: var(--accent-light); }
.row .thumb { width: 56px; height: 40px; border-radius: 6px; border: 1px solid var(--line); background: var(--thumb); object-fit: cover; flex: none; }
.tray .empty-state { padding: 18px 16px; color: var(--muted); font-size: 13.5px; }
.tray .bottom { padding: 12px 16px; display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--line-soft); }
.tray .bottom .btn { height: 34px; display: inline-flex; align-items: center; }
.tray .bottom small { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }

/* toast */
.toast { position: fixed; background: var(--ground); border-radius: 12px; padding: 10px 10px 10px 14px; font-size: 13.5px; display: flex; gap: 10px; align-items: center; box-shadow: 0 14px 40px rgba(10, 10, 10, 0.3); pointer-events: auto; max-width: calc(100vw - 24px); }
.toast .ok { flex: none; width: 18px; height: 18px; border-radius: 50%; background: var(--ok); color: var(--ground); display: grid; place-items: center; font-size: 11px; font-weight: 700; }
.toast .ok.warn { background: var(--warn); }

/* settings dialog: the extension's settings page in a frame, so permission prompts still work */
.scrim { position: fixed; inset: 0; background: var(--scrim); pointer-events: auto; display: grid; place-items: center; padding: 16px; }
.dialog { width: 520px; max-width: 100%; background: var(--ground); border-radius: 16px; box-shadow: 0 30px 80px rgba(10, 10, 10, 0.45); overflow: hidden; display: flex; flex-direction: column; }
.dialog .top { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); }
.dialog .top img { width: 24px; height: 24px; }
.dialog .top b { font-size: 15px; }
.dialog .top .icon-btn { margin-left: auto; }
.dialog iframe { display: block; width: 100%; height: min(72vh, 600px); border: 0; background: var(--ground); }
`;
}
