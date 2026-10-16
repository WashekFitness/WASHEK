import { useRef, useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { queryClientInstance } from '@/lib/query-client';

const THRESHOLD = 65;
const ACTIVATION_DISTANCE = 8;

function isInteractiveTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        'button',
        'a',
        'input',
        'textarea',
        'select',
        'option',
        '[role="button"]',
        '[role="tab"]',
        '[contenteditable="true"]',
      ].join(',')
    )
  );
}

export default function PullToRefresh({
  children,
  onRefresh,
}) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(null);
  const pullYRef = useRef(0);
  const pullingRef = useRef(false);
  const interactiveTouchRef = useRef(false);
  const refreshingRef = useRef(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    // Locate the nearest scrolling parent container
    let scroller = wrapperRef.current?.parentElement;

    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      if (
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll'
      ) {
        break;
      }
      scroller = scroller.parentElement;
    }

    if (!scroller) {
      scroller = document.documentElement;
    }

    const checkInnerScroll = (target) => {
      let cur = target;
      while (cur && cur !== scroller && cur !== document.body) {
        if (cur.scrollHeight > cur.clientHeight && cur.scrollTop > 0) {
          return true;
        }
        cur = cur.parentElement;
      }
      return false;
    };

    const handleStart = (clientY, target) => {
      if (refreshingRef.current) return;

      if (isInteractiveTarget(target) || checkInnerScroll(target)) {
        interactiveTouchRef.current = true;
        startY.current = null;
        return;
      }

      interactiveTouchRef.current = false;
      pullingRef.current = false;
      pullYRef.current = 0;
      setPullY(0);

      // Only begin if scroll container is at the very top
      if (scroller.scrollTop <= 2) {
        startY.current = clientY;
      } else {
        startY.current = null;
      }
    };

    const handleMove = (clientY, e) => {
      if (
        startY.current === null ||
        interactiveTouchRef.current ||
        refreshingRef.current
      ) {
        return;
      }

      const delta = clientY - startY.current;

      if (delta <= 0 || scroller.scrollTop > 2) {
        return;
      }

      if (!pullingRef.current && delta < ACTIVATION_DISTANCE) {
        return;
      }

      pullingRef.current = true;
      if (e?.cancelable) {
        e.preventDefault();
      }

      const next = Math.min(delta * 0.45, THRESHOLD + 28);
      pullYRef.current = next;
      setPullY(next);
    };

    const handleEnd = async () => {
      if (refreshingRef.current) return;

      if (interactiveTouchRef.current) {
        interactiveTouchRef.current = false;
        pullingRef.current = false;
        startY.current = null;
        pullYRef.current = 0;
        setPullY(0);
        return;
      }

      if (pullingRef.current && pullYRef.current >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        pullYRef.current = 0;
        setPullY(0);

        try {
          if (typeof onRefresh === 'function') {
            await onRefresh();
          } else {
            try {
              await queryClientInstance.invalidateQueries();
            } catch (err) {
              console.debug('[PullToRefresh] Query invalidation note:', err);
            }
            window.location.reload();
          }
        } catch (err) {
          console.debug('[PullToRefresh] Refresh handler note:', err);
          window.location.reload();
        } finally {
          setTimeout(() => {
            refreshingRef.current = false;
            setRefreshing(false);
          }, 600);
        }
        return;
      }

      pullYRef.current = 0;
      setPullY(0);
      pullingRef.current = false;
      interactiveTouchRef.current = false;
      startY.current = null;
    };

    // Touch event listeners
    const onTouchStart = (e) => {
      if (!e.touches?.length) return;
      handleStart(e.touches[0].clientY, e.target);
    };

    const onTouchMove = (e) => {
      if (!e.touches?.length) return;
      handleMove(e.touches[0].clientY, e);
    };

    const onTouchEnd = () => handleEnd();
    const onTouchCancel = () => handleEnd();

    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd);
    scroller.addEventListener('touchcancel', onTouchCancel);

    return () => {
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [onRefresh]);

  const progress = Math.min(pullY / THRESHOLD, 1);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200 pointer-events-none select-none z-50"
        style={{
          height: refreshing ? 52 : pullY > 0 ? pullY : 0,
        }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-md">
          <RefreshCw
            className={cn(
              'w-4 h-4 text-primary transition-transform duration-100',
              refreshing && 'animate-spin'
            )}
            style={{
              opacity: refreshing ? 1 : Math.max(0.3, progress),
              transform: refreshing ? undefined : `rotate(${progress * 240}deg)`,
            }}
          />
          <span className="text-xs font-semibold text-foreground tracking-wide">
            {refreshing ? 'Refreshing…' : progress >= 1 ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      </div>

      {children}
    </div>
  );
}
