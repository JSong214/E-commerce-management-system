import { useEffect } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

export type PrototypeVariantKey = 'A' | 'B' | 'C';

export interface PrototypeVariantOption {
  key: PrototypeVariantKey;
  label: string;
}

export const PROTOTYPE_VARIANTS: PrototypeVariantOption[] = [
  { key: 'A', label: 'A · 极简工作台（左侧导航 + 经典步骤向导）' },
  { key: 'B', label: 'B · 双栏操作台（顶栏导航 + 左右对照分栏）' },
  { key: 'C', label: 'C · 高密度数据终端（紧凑无卡片 + 平台快切）' },
];

interface PrototypeSwitcherProps {
  current: PrototypeVariantKey;
  onChange: (next: PrototypeVariantKey) => void;
}

/**
 * Dev-only floating variant switcher following .agents/skills/prototype/UI.md.
 * Hidden automatically in production builds.
 */
export function PrototypeSwitcher({ current, onChange }: PrototypeSwitcherProps) {
  const index = PROTOTYPE_VARIANTS.findIndex((v) => v.key === current);
  const currentOption = PROTOTYPE_VARIANTS[index] ?? PROTOTYPE_VARIANTS[0];

  const step = (delta: number) => {
    const nextIdx = (index + delta + PROTOTYPE_VARIANTS.length) % PROTOTYPE_VARIANTS.length;
    onChange(PROTOTYPE_VARIANTS[nextIdx].key);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!import.meta.env.DEV && !import.meta.env.VITEST) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="UI原型方案切换器"
      style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 14px',
        borderRadius: 999,
        background: 'rgba(15, 23, 42, 0.92)',
        color: '#f8fafc',
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.35)',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        backdropFilter: 'blur(8px)',
        fontSize: 13,
      }}
    >
      <button
        type="button"
        aria-label="上一个视觉方案"
        onClick={() => step(-1)}
        style={{
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          width: 28,
          height: 28,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LeftOutlined />
      </button>
      <span style={{ fontWeight: 600, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>
        原型方案：{currentOption.label}
      </span>
      <button
        type="button"
        aria-label="下一个视觉方案"
        onClick={() => step(1)}
        style={{
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          width: 28,
          height: 28,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RightOutlined />
      </button>
    </div>
  );
}
