// 只解释并标注原生时间线；关键帧仍由原有引擎记录、插值和保存。
import { startTimelineActions } from "./xoi-timeline-actions.js?v=20261017-1";
export function startKeyframeGuide() {
  const timelineActions=startTimelineActions();
  let timeline, observer, scheduled = 0, helpButton, seconds, dialog;
  const guarded = new Map();
  const setText = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  const setAttribute = (node, key, value) => { if (node && node.getAttribute(key) !== value) node.setAttribute(key, value); };
  function guard(button) {
    if (!button || guarded.has(button)) return;
    const listener = event => { if (event.key === " " || event.key === "Enter") event.stopPropagation(); };
    button.addEventListener("keydown", listener); guarded.set(button, listener);
  }
  function label(button, text) {
    if (!button) return;
    // 保留原生 SVG 和 React 事件，不替换按钮节点。
    const textNodes = [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    const last = textNodes.at(-1);
    if (last && last.textContent !== ` ${text}`) last.textContent = ` ${text}`;
    for (const node of textNodes.slice(0, -1)) if (node.textContent) node.textContent = "";
    setAttribute(button, "aria-label", text); guard(button);
  }
  function getTime() {
    const frame = Number(timeline?.querySelector(".time-readout strong")?.textContent) || 0;
    const fps = Number(timeline?.querySelector(".time-readout span")?.textContent.match(/([\d.]+)\s*FPS/)?.[1]) || 24;
    return { frame, fps, time: `${(frame / fps).toFixed(2)} 秒` };
  }
  function updateTrack(kind, time) {
    const track = timeline.querySelector(`.${kind}-track`);
    const button = timeline.querySelector(`.${kind}-keyframe-button`);
    if (!track || !button) return;
    const keys = track.querySelectorAll(".keyframe");
    const current = Boolean(track.querySelector(".keyframe.is-current"));
    const objectName = timeline.querySelector(".object-track-label span")?.textContent || "物体";
    const isPerson = document.querySelector(".right-sidebar .inspector-head small")?.textContent === "PERSON";
    const subject = kind === "camera" ? "镜头位置" : isPerson ? "人物状态" : "物体状态";
    label(button, `${current ? "更新" : "记录"}${subject}`);
    const detail = kind === "camera" ? "主摄像机的位置、旋转和焦距" : `“${objectName}”的位置、旋转、缩放和姿势`;
    setAttribute(button, "title", `${current ? "覆盖" : "记录"}${time.time}（第 ${time.frame} 帧）的${detail}。移动或摆姿后，需要再次点击记录。`);
    const trackLabel = timeline.querySelector(`.${kind}-track-label`);
    setAttribute(trackLabel, "data-xoi-keys", `${keys.length} 点`);
    const hint = keys.length === 0 ? "先摆好起点，再点右侧记录" : keys.length === 1 ? "移到后面的时间 → 调整位置 → 再记录" : "已记录多个时间点，可回到开头播放预览";
    setAttribute(trackLabel, "title", `${keys.length} 个关键帧 · ${hint}`);
    let note = track.querySelector(".xoi-track-note");
    if (!note) { note = document.createElement("span"); note.className = "xoi-track-note"; track.append(note); }
    setText(note, keys.length < 2 ? hint : "");
    note.hidden = keys.length >= 2;
  }
  function sync() {
    scheduled = 0;
    if (!timeline?.isConnected) return;
    const time = getTime();
    setText(seconds, time.time);
    updateTrack("camera", time); updateTrack("object", time);
    timelineActions.sync();
    const play = timeline.querySelector(".play-button");
    setAttribute(play, "aria-label", play?.classList.contains("is-playing") ? "暂停预览" : "播放预览");
    setAttribute(play, "title", "播放预览 · 两个不同时间点的关键帧之间会自动过渡"); guard(play);
    const select = timeline.querySelector(".timeline-key-editor select");
    if (select) {
      setAttribute(select, "title", "控制这个关键帧到下一个关键帧的过渡方式");
      for (const option of select.options) setText(option, { smooth:"缓入缓出", linear:"匀速", hold:"停住后跳转" }[option.value] || option.textContent);
    }
  }
  function schedule() { if (!scheduled) scheduled = requestAnimationFrame(sync); }
  function showHelp() {
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.className = "xoi-keyframe-help";
      dialog.setAttribute("aria-labelledby", "xoi-keyframe-help-title");
      dialog.innerHTML = `<header><div><small>时间线入门</small><h2 id="xoi-keyframe-help-title">关键帧，就是记住某一刻的状态</h2></div><button type="button" aria-label="关闭关键帧说明">关闭</button></header>
        <p class="xoi-keyframe-intro">例如：0 秒在左边，2 秒在右边。分别记录这两刻，播放时就会从左边移动到右边。</p>
        <div class="xoi-keyframe-examples"><section><h3>让人物移动</h3><ol><li><b>记起点</b>：选中人物，回到开头，摆好位置，点「记录人物状态」。</li><li><b>记终点</b>：先在时间线上点击 2 秒附近，再移动人物（W）或调整右侧位置，点「记录人物状态」。</li><li><b>看效果</b>：回到开头，点播放预览。改变姿势也按同样的方法记录。</li></ol></section>
        <section><h3>让镜头移动</h3><ol><li><b>记起点</b>：选中「主摄像机」，调整右侧位置、旋转、焦距，点「记录镜头位置」。</li><li><b>记终点</b>：先移到 2 秒附近，再调整主摄像机，点「记录镜头位置」。</li><li><b>看效果</b>：回到开头播放，看右侧摄像机预览窗。人物可以保持原地。</li></ol></section></div>
        <footer><p><b>先换时间，再调整，再记录。</b>调整后先记录，再切换时间，避免丢失这一刻的修改。同一时间再点记录，会更新该点。</p><p>拖动空白画面是在改变编辑观察视角；镜头运动需要调整场景里的「主摄像机」。两个点的位置相同，就不会产生位移。</p><p>选择前一个关键帧：<b>缓入缓出</b>是柔和起停，<b>匀速</b>是速度一致，<b>停住后跳转</b>是到下一个点才切换。走路姿势需要另外选择动作，位置关键帧负责移动路线。</p></footer>`;
      dialog.querySelector("header button").addEventListener("click", () => dialog.close());
      dialog.addEventListener("keydown", event => event.stopPropagation());
      dialog.addEventListener("click", event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
      document.body.append(dialog);
    }
    if (!dialog.open) dialog.showModal();
  }
  function setup() {
    const next = document.querySelector(".timeline");
    if (!next) return;
    if (timeline !== next) { observer?.disconnect(); timeline = next; observer = new MutationObserver(schedule); observer.observe(timeline, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:["class"] }); }
    if (!timeline.querySelector(".xoi-keyframe-help-button")) {
      helpButton = document.createElement("button"); helpButton.type = "button"; helpButton.className = "xoi-keyframe-help-button";
      helpButton.textContent = "怎么让它动？"; helpButton.setAttribute("aria-haspopup", "dialog");
      helpButton.addEventListener("click", showHelp); guard(helpButton);
      timeline.querySelector(".timeline-body")?.append(helpButton);
    }
    const readout = timeline.querySelector(".time-readout");
    if (readout && !readout.querySelector(".xoi-time-seconds")) { seconds = document.createElement("small"); seconds.className = "xoi-time-seconds"; readout.append(seconds); }
    sync();
  }
  return { setup, dispose() {
    timelineActions.dispose();
    observer?.disconnect(); if (scheduled) cancelAnimationFrame(scheduled);
    for (const [button, listener] of guarded) button.removeEventListener("keydown", listener);
    guarded.clear(); helpButton?.remove(); seconds?.remove(); dialog?.remove();
    document.querySelectorAll(".xoi-track-note").forEach(node => node.remove());
  } };
}
