/**
 * 积分扣除 Toast 提示
 * 统一的紫色渐变金币样式
 */

import { formatPoints } from "./points";
let styleInjected = false;

function injectStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'points-toast-style';
  style.textContent = `
    @keyframes pointsSlideIn {
      0% { transform: translateX(120%) scale(0.8); opacity: 0; }
      50% { transform: translateX(-8%) scale(1.02); }
      100% { transform: translateX(0) scale(1); opacity: 1; }
    }
    @keyframes pointsSlideOut {
      0% { transform: translateX(0) scale(1); opacity: 1; }
      100% { transform: translateX(120%) scale(0.8); opacity: 0; }
    }
    @keyframes pointsShine {
      0% { left: -100%; }
      100% { left: 200%; }
    }
    @keyframes pointsCoinSpin {
      0% { transform: rotateY(0deg); }
      100% { transform: rotateY(360deg); }
    }
    @keyframes pointsPulse {
      0%, 100% { box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4), 0 0 0 0 rgba(102, 126, 234, 0.4); }
      50% { box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4), 0 0 0 8px rgba(102, 126, 234, 0); }
    }
    .points-toast-wrapper {
      position: fixed; top: 24px; right: 24px; z-index: 99999;
      animation: pointsSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: none;
    }
    .points-toast-wrapper.exiting {
      animation: pointsSlideOut 0.4s cubic-bezier(0.55, 0, 1, 0.45) forwards;
    }
    .points-toast-card {
      background: linear-gradient(135deg, #667eea 0%, #8b5cf6 50%, #a855f7 100%);
      border-radius: 16px; padding: 16px 24px; min-width: 200px;
      position: relative; overflow: hidden;
      box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
      animation: pointsPulse 2s ease-in-out infinite;
    }
    .points-toast-card::before {
      content: ''; position: absolute; top: -50%; left: -100%;
      width: 60%; height: 200%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
      transform: skewX(-25deg);
      animation: pointsShine 0.8s ease-out;
    }
    .points-toast-content {
      display: flex; align-items: center; gap: 14px;
      position: relative; z-index: 1;
    }
    .points-toast-icon {
      width: 44px; height: 44px; border-radius: 12px;
      background: rgba(255,255,255,0.2); backdrop-filter: blur(10px);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; flex-shrink: 0;
      animation: pointsCoinSpin 0.6s ease-out;
    }
    .points-toast-info { display: flex; flex-direction: column; gap: 2px; }
    .points-toast-deduct {
      color: #fff; font-size: 18px; font-weight: 700;
      text-shadow: 0 2px 4px rgba(0,0,0,0.2);
      letter-spacing: 0.5px;
    }
    .points-toast-balance {
      color: rgba(255,255,255,0.85); font-size: 13px; font-weight: 500;
    }
  `;
  document.head.appendChild(style);
  styleInjected = true;
}

export function showPointsToast(points: number, balance: number) {
  injectStyle();

  // 移除已有的
  const existing = document.getElementById('vue-points-toast');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'vue-points-toast';
  wrapper.className = 'points-toast-wrapper';
  wrapper.innerHTML = `
    <div class="points-toast-card">
      <div class="points-toast-content">
        <div class="points-toast-icon">🪙</div>
        <div class="points-toast-info">
          <div class="points-toast-deduct">消耗 ${formatPoints(points)}</div>
          <div class="points-toast-balance">余额 ${formatPoints(balance)}</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  setTimeout(() => {
    wrapper.classList.add('exiting');
    setTimeout(() => wrapper.remove(), 400);
  }, 3000);
}
