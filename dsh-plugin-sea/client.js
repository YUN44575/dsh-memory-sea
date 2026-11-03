/**
 * 记忆意识海 · 浏览器半
 *
 * 在整页浮层（shell.overlay）里放一颗可拖动的悬浮球，点开就是一个铺满窗口的 iframe，
 * iframe 指向 Host 半挂出来的 /sea/index.html?embed=1 —— 也就是这份界面。
 *
 * 退出：
 *  - 左上角「← 回到 DSH」直接关掉浮层；
 *  - Esc 走**分级退出**：先让 iframe 自己退一级（关浮层 / 关详情 / 退选中），
 *    它退不动了才回一句 sea:exit，这时才关掉整个意识海；
 *  - 聚焦在 DSH 那边时，父窗口把 Esc 转发进 iframe（同一套逻辑）。
 *
 * 悬浮球：按住可拖，位置记在 localStorage；双击回到默认位置。
 * 嵌在 DSH 窗口里时右上角被系统窗口按钮占着，所以「回到 DSH」放左上角。
 *
 * 以后要改界面，改的还是 sea-build/out/index.html；这份客户端代码几乎不用动。
 */
window.__ModuleLoader__.load({
  // 这个 id 必须和「装进 DSH 的那个包名」一致：模板里就是包名。
  // 原来写死 @local/dsh-plugin-sea，从 Git 装（包名 dsh-memory-sea）时会注册成两个不同 factory。
  id: 'dsh-memory-sea',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // pad=16：浮层顶部已经让出了系统标题栏（见下面 layer 的 top），iframe 里就不用再让 54
    const SEA_URL = '/sea/index.html?embed=1&pad=16';
    const FAB_SIZE = 38;
    // 顶部这条是系统标题栏：Electron 的 -webkit-app-region: drag 区域，
    // 鼠标事件被窗口拖拽吃掉，球掉进去就点不动了。所有地方都按这条限位。
    const TOP_SAFE = 56;
    const EDGE = 6;
    const clampX = (x) => Math.max(EDGE, Math.min(window.innerWidth - FAB_SIZE - EDGE, x));
    const clampY = (y) => Math.max(TOP_SAFE, Math.min(window.innerHeight - FAB_SIZE - EDGE, y));
    const POS_KEY = 'sea.fab.pos';

    function defaultPos() {
      const H = (typeof window !== 'undefined' && window.innerHeight) || 800;
      return { x: 14, y: Math.max(TOP_SAFE, H - 130) };
    }

    function loadPos() {
      try {
        const raw = localStorage.getItem(POS_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          if (p && typeof p.x === 'number' && typeof p.y === 'number') {
            return { x: clampX(p.x), y: clampY(p.y) };
          }
        }
      } catch (e) { /* 读不到就用默认 */ }
      return defaultPos();
    }

    function Launcher() {
      const [open, setOpen] = React.useState(false);
      const [pos, setPos] = React.useState(loadPos);
      const frameRef = React.useRef(null);
      const dragRef = React.useRef(null);
      const posRef = React.useRef(pos);
      const movedRef = React.useRef(false);
      posRef.current = pos;

      // 拖动：window 上听 pointermove/up，这样鼠标甩出球外也能继续拖
      React.useEffect(() => {
        const onMove = (e) => {
          const d = dragRef.current;
          if (!d) return;
          if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) {
            d.moved = true;
            movedRef.current = true;
          }
          setPos({ x: clampX(e.clientX - d.dx), y: clampY(e.clientY - d.dy) });
        };
        const onUp = () => {
          const d = dragRef.current;
          if (!d) return;
          dragRef.current = null;
          if (d.moved) {
            try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)); } catch (e) {}
            // 拖完这一下别顺手把海打开
            setTimeout(() => { movedRef.current = false; }, 60);
          }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };
      }, []);

      // 窗口尺寸变了，别把球留在屏幕外
      React.useEffect(() => {
        const onResize = () => {
          setPos((p) => ({ x: clampX(p.x), y: clampY(p.y) }));
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, []);

      // 父窗口的 Esc → 转发给 iframe，让它自己退一级
      React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
          if (e.key !== 'Escape') return;
          const f = frameRef.current;
          try {
            if (f && f.contentWindow) f.contentWindow.postMessage('sea:esc', '*');
          } catch (err) { /* 跨源就忽略 */ }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [open]);

      // iframe 说「我退不动了」→ 关掉整个意识海
      React.useEffect(() => {
        if (!open) return undefined;
        const onMsg = (e) => {
          if (e.data === 'sea:exit') setOpen(false);
        };
        window.addEventListener('message', onMsg);
        return () => window.removeEventListener('message', onMsg);
      }, [open]);

      const button = h(
        'button',
        {
          type: 'button',
          title: '打开记忆意识海（可拖动；双击回到默认位置）',
          'aria-label': '打开记忆意识海',
          onPointerDown: (e) => {
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
            dragRef.current = {
              dx: e.clientX - posRef.current.x,
              dy: e.clientY - posRef.current.y,
              sx: e.clientX,
              sy: e.clientY,
              moved: false,
            };
          },
          onDoubleClick: () => {
            const p = defaultPos();
            setPos(p);
            try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) {}
          },
          onClick: () => {
            if (movedRef.current) return;
            setOpen(true);
          },
          style: {
            position: 'fixed',
            left: pos.x + 'px',
            top: pos.y + 'px',
            zIndex: 60,
            width: FAB_SIZE + 'px',
            height: FAB_SIZE + 'px',
            borderRadius: '999px',
            border: '1px solid rgba(140,180,220,.28)',
            background: 'rgba(10,18,30,.82)',
            color: '#bde4ff',
            fontSize: '17px',
            lineHeight: 1,
            cursor: 'grab',
            touchAction: 'none',
            userSelect: 'none',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 4px 16px rgba(0,0,0,.35)',
          },
        },
        '\u2726',
      );

      if (!open) return button;

      // 改完 index.html 想立刻看到效果：一键重载 iframe（省得退出再进）
      const refreshBtn = h(
        'button',
        {
          type: 'button',
          onClick: () => {
            const f = frameRef.current;
            try {
              if (f && f.contentWindow) f.contentWindow.location.reload();
            } catch (err) { /* 跨源就算了 */ }
          },
          title: '重新加载意识海（改完 index.html 点这个）',
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '34px', height: '34px', borderRadius: '999px',
            border: '1px solid rgba(150,200,240,.26)',
            background: 'rgba(14,20,28,.72)',
            color: '#bfe2ff', fontSize: '15px', lineHeight: 1,
            cursor: 'pointer', backdropFilter: 'blur(8px)',
            boxShadow: '0 6px 22px rgba(0,0,0,.3)', opacity: '.72',
            transition: 'opacity .18s ease',
          },
          onMouseEnter: (e) => { e.currentTarget.style.opacity = '.98'; },
          onMouseLeave: (e) => { e.currentTarget.style.opacity = '.72'; },
        },
        '↻',
      );

      const closeBtn = h(
        'button',
        {
          type: 'button',
          onClick: () => setOpen(false),
          title: '回到 DSH（按 Esc 会先退一级）',
          // 不贴在窗口左上 —— 那儿是 DSH 自己的标题栏与侧边栏，压上去既挡东西
          // 又可能落进系统的窗口拖拽区。右下角是我们的画布，也不与工具栏、底部面板打架。
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 13px',
            borderRadius: '999px',
            border: '1px solid rgba(255,190,150,.26)',
            background: 'rgba(18,13,16,.72)',
            color: '#ffd9c0',
            fontSize: '12px',
            letterSpacing: '.05em',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 6px 22px rgba(0,0,0,.35)',
            opacity: '.72',
            transition: 'opacity .18s ease, background .18s ease',
          },
          onMouseEnter: (e) => {
            e.currentTarget.style.opacity = '.98';
            e.currentTarget.style.background = 'rgba(28,20,22,.9)';
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.opacity = '.72';
            e.currentTarget.style.background = 'rgba(18,13,16,.72)';
          },
        },
        h('span', { style: { fontSize: '14px', lineHeight: 1 } }, '\u2190'),
        h('span', null, '回到 DSH'),
      );

      // 右下角一组小按钮：刷新 + 回到 DSH（时间轴占 bottom 22~76，抬到它上面）
      const ctlBar = h(
        'div',
        {
          style: {
            position: 'fixed',
            right: '22px',
            bottom: '92px',
            zIndex: 9100,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          },
        },
        refreshBtn,
        closeBtn,
      );

      // 浮层不铺满整窗：顶上留出系统标题栏那一条，既不压住窗口右上角的最小化/关闭，
      // 也让"这是 DSH 里的一个面板"这件事看得见。iframe 里的 embed 让位因此改小（见 index.html）。
      const layer = h(
        'div',
        {
          style: {
            position: 'fixed',
            top: TOP_SAFE + 'px',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9000,
            background: '#04070d',
            borderRadius: '10px 10px 0 0',
            overflow: 'hidden',
            boxShadow: '0 -1px 0 rgba(120,170,220,.10), 0 -18px 40px rgba(0,0,0,.45)',
          },
        },
        h('iframe', {
          ref: frameRef,
          src: SEA_URL,
          title: '记忆意识海',
          style: {
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: '0',
            background: '#04070d',
            display: 'block',
          },
        }),
        ctlBar,
      );

      return h(React.Fragment, null, button, layer);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'sea-launcher', order: 9000 },
            Launcher,
          ),
        );
      },
    };
  },
});
