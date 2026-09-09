import { Link } from 'react-router-dom';


function Footer() {
  return (
    <footer
      className="
        mt-8
        border-t
        border-border
        pt-6
        pb-[calc(5.5rem+env(safe-area-inset-bottom))]
        sm:pb-4
      "
    >

      <div
        className="
          flex
          flex-col
          sm:flex-row
          items-center
          justify-between
          gap-4
        "
      >

        {/* BRAND */}

        <div className="flex items-center gap-2">

          <img
            src="/washek-fitness-logo.jpg"
            alt="WASHEK"
            className="
              w-6
              h-6
              rounded-lg
              object-contain
            "
          />

          <span
            className="
              font-heading
              font-semibold
              text-xs
              text-muted-foreground
            "
          >
            WASHEK
          </span>

        </div>


        {/* FOOTER LINKS */}

        <nav
          aria-label="Footer navigation"
          className="
            flex
            items-center
            justify-center
            gap-1
            pb-1
          "
        >

          <Link
            to="/about"
            className="
              inline-flex
              min-h-11
              min-w-24
              items-center
              justify-center
              rounded-lg
              px-4
              py-2
              text-sm
              font-medium
              text-muted-foreground
              transition-colors
              hover:bg-muted/50
              hover:text-foreground
              active:bg-muted
            "
          >
            About
          </Link>


          <Link
            to="/contact"
            className="
              inline-flex
              min-h-11
              min-w-24
              items-center
              justify-center
              rounded-lg
              px-4
              py-2
              text-sm
              font-medium
              text-muted-foreground
              transition-colors
              hover:bg-muted/50
              hover:text-foreground
              active:bg-muted
            "
          >
            Contact
          </Link>

        </nav>

      </div>

    </footer>
  );
}


export default Footer;
