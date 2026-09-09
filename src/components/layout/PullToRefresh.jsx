import { useRef, useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const THRESHOLD = 72;
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
    /*
     * Find the app's existing scroll container.
     * We do not create another scroll container.
     */
    let scroller =
      wrapperRef.current?.parentElement;

    while (scroller) {
      const style =
        getComputedStyle(scroller);

      if (
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll'
      ) {
        break;
      }

      scroller =
        scroller.parentElement;
    }

    if (!scroller) {
      scroller =
        document.documentElement;
    }

    const onTouchStart = (e) => {
      if (
        refreshingRef.current ||
        !e.touches?.length
      ) {
        return;
      }

      /*
       * Never hijack a tap that starts on a button,
       * link, tab, input, etc.
       */
      interactiveTouchRef.current =
        isInteractiveTarget(e.target);

      pullingRef.current = false;
      pullYRef.current = 0;
      setPullY(0);

      if (
        interactiveTouchRef.current
      ) {
        startY.current = null;
        return;
      }

      /*
       * Pull-to-refresh only begins when the page
       * is already at the very top.
       */
      if (
        scroller.scrollTop === 0
      ) {
        startY.current =
          e.touches[0].clientY;
      } else {
        startY.current = null;
      }
    };

    const onTouchMove = (e) => {
      if (
        startY.current === null ||
        interactiveTouchRef.current ||
        refreshingRef.current ||
        !e.touches?.length
      ) {
        return;
      }

      const delta =
        e.touches[0].clientY -
        startY.current;

      /*
       * Only respond to a downward pull.
       */
      if (
        delta <= 0 ||
        scroller.scrollTop !== 0
      ) {
        return;
      }

      /*
       * Don't hijack a normal tap.
       */
      if (
        !pullingRef.current &&
        delta < ACTIVATION_DISTANCE
      ) {
        return;
      }

      pullingRef.current = true;

      /*
       * Once the gesture is clearly a pull,
       * stop the browser from scrolling the page.
       */
      e.preventDefault();

      const next =
        Math.min(
          delta * 0.5,
          THRESHOLD + 20
        );

      pullYRef.current =
        next;

      setPullY(next);
    };

    const onTouchEnd = () => {
      if (
        refreshingRef.current
      ) {
        return;
      }

      /*
       * Normal taps are completely ignored.
       */
      if (
        interactiveTouchRef.current
      ) {
        interactiveTouchRef.current =
          false;

        pullingRef.current =
          false;

        startY.current =
          null;

        pullYRef.current =
          0;

        setPullY(0);

        return;
      }

      /*
       * A successful pull now performs an ACTUAL
       * browser page reload.
       */
      if (
        pullingRef.current &&
        pullYRef.current >= THRESHOLD
      ) {
        refreshingRef.current =
          true;

        setRefreshing(true);

        pullYRef.current =
          0;

        setPullY(0);

        /*
         * Give React one frame to render the spinner
         * before reloading the document.
         */
        window.requestAnimationFrame(() => {
          window.location.reload();
        });

        return;
      }

      /*
       * Pull wasn't far enough.
       */
      pullYRef.current =
        0;

      setPullY(0);

      pullingRef.current =
        false;

      interactiveTouchRef.current =
        false;

      startY.current =
        null;
    };

    const onTouchCancel = () => {
      startY.current =
        null;

      pullYRef.current =
        0;

      pullingRef.current =
        false;

      interactiveTouchRef.current =
        false;

      setPullY(0);
    };

    scroller.addEventListener(
      'touchstart',
      onTouchStart,
      { passive: true }
    );

    scroller.addEventListener(
      'touchmove',
      onTouchMove,
      { passive: false }
    );

    scroller.addEventListener(
      'touchend',
      onTouchEnd
    );

    scroller.addEventListener(
      'touchcancel',
      onTouchCancel
    );

    return () => {
      scroller.removeEventListener(
        'touchstart',
        onTouchStart
      );

      scroller.removeEventListener(
        'touchmove',
        onTouchMove
      );

      scroller.removeEventListener(
        'touchend',
        onTouchEnd
      );

      scroller.removeEventListener(
        'touchcancel',
        onTouchCancel
      );
    };
  }, []);

  const progress =
    Math.min(
      pullY / THRESHOLD,
      1
    );

  return (
    <div ref={wrapperRef}>

      <div
        className="
          flex
          items-center
          justify-center
          overflow-hidden
          transition-all
          duration-200
        "
        style={{
          height:
            refreshing
              ? 48
              : pullY > 0
                ? pullY
                : 0,
        }}
      >

        <RefreshCw
          className={cn(
            'w-5 h-5 text-primary transition-all',
            refreshing &&
              'animate-spin'
          )}
          style={{
            opacity:
              refreshing
                ? 1
                : progress,

            transform:
              `rotate(${
                progress * 180
              }deg)`,
          }}
        />

      </div>

      {children}

    </div>
  );
}
