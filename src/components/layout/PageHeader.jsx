import {
  useNavigate,
  useLocation,
} from 'react-router-dom';

import {
  ChevronLeft,
} from 'lucide-react';

import {
  Button,
} from '@/components/ui/button';

import { cn } from '@/lib/utils';


const ROOT_PAGES = [
  '/',
  '/program',
  '/nutrition',
  '/profile',
  '/kael',
];


export default function PageHeader({
  title,
  subtitle,
}) {
  const navigate =
    useNavigate();

  const location =
    useLocation();

  const isRoot =
    ROOT_PAGES.includes(
      location.pathname
    );


  return (
    <div
      className="
        relative
        z-30
        flex
        items-center
        gap-3
        mb-2
        pt-2
        pointer-events-auto
      "
    >

      {isRoot ? (

        <div
          className="
            relative
            z-30
            flex
            items-center
            gap-2.5
            pointer-events-auto
          "
        >

          <div className="relative p-0.5 rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/25 shadow-sm shadow-primary/15 shrink-0">
            <img
              src="/washek-fitness-logo.jpg"
              alt="WASHEK"
              className="
                w-7
                h-7
                rounded-[10px]
                object-contain
                shrink-0
                pointer-events-none
              "
            />
          </div>

          <span className="
            font-heading
            font-extrabold
            text-sm
            tracking-widest
            uppercase
            text-foreground
          ">
            WASHEK
          </span>

        </div>

      ) : (

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            `
              relative
              z-40
              h-10
              w-10
              shrink-0
              -ml-2
              rounded-xl
              hover:bg-slate-100/90
              dark:hover:bg-white/[0.08]
              pointer-events-auto
              touch-manipulation
            `
          )}
          onClick={() =>
            navigate(-1)
          }
          aria-label="Go back"
        >
          <ChevronLeft
            className="
              w-5
              h-5
              pointer-events-none
            "
          />
        </Button>

      )}


      {title && (
        <div
          className="
            relative
            z-30
            flex-1
            min-w-0
            pointer-events-auto
          "
        >

          <h1 className="
            font-heading
            text-2xl
            sm:text-3xl
            font-extrabold
            tracking-tight
            text-foreground
            leading-tight
          ">
            {title}
          </h1>


          {subtitle && (
            <p className="
              text-xs
              sm:text-sm
              text-muted-foreground
              mt-0.5
              leading-relaxed
            ">
              {subtitle}
            </p>
          )}

        </div>
      )}

    </div>
  );
}
