import { useState } from 'react';
import {
  Link,
} from 'react-router-dom';

import {
  ArrowLeft,
  Mail,
  Send,
} from 'lucide-react';

import {
  Input,
} from '@/components/ui/input';

import {
  Textarea,
} from '@/components/ui/textarea';

import {
  Button,
} from '@/components/ui/button';

import {
  useToast,
} from '@/components/ui/use-toast';

import {
  supabaseApi,
} from '@/lib/supabaseApi';


export default function Contact() {
  const {
    toast,
  } = useToast();


  const [
    form,
    setForm,
  ] = useState({
    name: '',
    email: '',
    message: '',
  });


  const [
    submitting,
    setSubmitting,
  ] = useState(false);


  const handleSubmit =
    async (
      event
    ) => {
      event.preventDefault();

      if (
        submitting
      ) {
        return;
      }


      const name =
        form.name.trim();

      const email =
        form.email.trim();

      const message =
        form.message.trim();


      if (!name) {
        toast({
          title:
            'Name required',

          description:
            'Please enter your name.',

          variant:
            'destructive',
        });

        return;
      }


      if (!email) {
        toast({
          title:
            'Email required',

          description:
            'Please enter your email address.',

          variant:
            'destructive',
        });

        return;
      }


      if (!message) {
        toast({
          title:
            'Message required',

          description:
            'Please enter a message.',

          variant:
            'destructive',
        });

        return;
      }


      setSubmitting(
        true
      );


      try {
        /*
         * IMPORTANT:
         *
         * send-contact-email expects:
         *   name
         *   email
         *   message
         *
         * Do NOT send:
         *   to
         *   subject
         *   body
         *
         * The Edge Function supplies the destination and
         * subject itself.
         */

        await supabaseApi.email.send({
          name,
          email,
          message,
        });


        setForm({
          name: '',
          email: '',
          message: '',
        });


        toast({
          title:
            'Message sent',

          description:
            'Thanks for reaching out — Adrian will get back to you soon.',
        });

      } catch (
        error
      ) {
        console.error(
          '[CONTACT] Email failed:',
          error
        );


        toast({
          title:
            'Something went wrong',

          description:
            error?.message ||
            'Please try emailing washekfitness@gmail.com directly.',

          variant:
            'destructive',
        });

      } finally {
        setSubmitting(
          false
        );
      }
    };


  return (
    <div
      className="
        relative
        z-0
        w-full
        px-5
        pb-4
        max-w-2xl
        mx-auto
      "
    >

      {/* Header */}

      <div
        className="
          relative
          z-30
          flex
          items-center
          gap-3
          mb-6
          pt-2
          pointer-events-auto
        "
      >

        <Link
          to="/"
          aria-label="Back to home"
          className="
            relative
            z-40
            flex
            items-center
            justify-center
            w-11
            h-11
            shrink-0
            -ml-2
            rounded-xl
            text-muted-foreground
            hover:text-foreground
            hover:bg-muted/60
            active:bg-muted
            transition-colors
            pointer-events-auto
            touch-manipulation
          "
        >

          <ArrowLeft
            className="
              w-5
              h-5
              pointer-events-none
            "
          />

        </Link>


        <Link
          to="/"
          className="
            relative
            z-30
            flex
            items-center
            gap-2
            pointer-events-auto
          "
        >

          <img
            src="/washek-fitness-logo.jpg"
            alt="WASHEK"
            className="
              w-8
              h-8
              rounded-xl
              object-contain
              pointer-events-none
            "
          />

          <span className="
            font-heading
            font-bold
            text-sm
          ">
            WASHEK
          </span>

        </Link>

      </div>


      <h1 className="
        font-heading
        text-3xl
        font-bold
        tracking-tight
        mb-3
      ">
        Contact Us
      </h1>


      <p className="
        text-muted-foreground
        mb-8
      ">
        Questions, feedback, or partnership ideas?
        We'd love to hear from you.
      </p>


      <div className="space-y-6">

        {/* Direct email */}

        <a
          href="mailto:washekfitness@gmail.com"
          className="
            relative
            z-10
            flex
            items-center
            gap-3
            rounded-xl
            border
            border-border
            bg-card
            p-4
            hover:border-primary/40
            active:bg-muted/50
            transition-colors
            pointer-events-auto
            touch-manipulation
          "
        >

          <div className="
            w-10
            h-10
            rounded-xl
            bg-primary/15
            flex
            items-center
            justify-center
            shrink-0
          ">

            <Mail className="
              w-5
              h-5
              text-primary
              pointer-events-none
            " />

          </div>


          <div>

            <p className="
              font-semibold
              text-sm
            ">
              Email
            </p>

            <p className="
              text-xs
              text-muted-foreground
            ">
              washekfitness@gmail.com
            </p>

          </div>

        </a>


        {/* Contact form */}

        <form
          onSubmit={
            handleSubmit
          }
          className="
            relative
            z-10
            space-y-4
            rounded-xl
            border
            border-border
            bg-card
            p-5
          "
        >

          <h2 className="
            font-heading
            font-semibold
            text-lg
          ">
            Send a Message
          </h2>


          <div className="
            grid
            sm:grid-cols-2
            gap-3
          ">

            <div>

              <label className="
                text-xs
                font-medium
                text-muted-foreground
                mb-1.5
                block
              ">
                Name
              </label>

              <Input
                required
                value={
                  form.name
                }
                onChange={
                  (event) =>
                    setForm(
                      (previous) => ({
                        ...previous,
                        name:
                          event.target.value,
                      })
                    )
                }
                placeholder="Your name"
                autoComplete="name"
              />

            </div>


            <div>

              <label className="
                text-xs
                font-medium
                text-muted-foreground
                mb-1.5
                block
              ">
                Email
              </label>

              <Input
                required
                type="email"
                value={
                  form.email
                }
                onChange={
                  (event) =>
                    setForm(
                      (previous) => ({
                        ...previous,
                        email:
                          event.target.value,
                      })
                    )
                }
                placeholder="you@example.com"
                autoComplete="email"
              />

            </div>

          </div>


          <div>

            <label className="
              text-xs
              font-medium
              text-muted-foreground
              mb-1.5
              block
            ">
              Message
            </label>


            <Textarea
              required
              value={
                form.message
              }
              onChange={
                (event) =>
                  setForm(
                    (previous) => ({
                      ...previous,
                      message:
                        event.target.value,
                    })
                  )
              }
              placeholder="How can we help?"
              className="
                min-h-[120px]
                resize-none
              "
            />

          </div>


          <Button
            type="submit"
            disabled={
              submitting
            }
            className="
              relative
              z-10
              w-full
              h-11
              pointer-events-auto
              touch-manipulation
            "
          >

            {submitting ? (

              <span className="
                flex
                items-center
                gap-2
              ">

                <span className="
                  w-4
                  h-4
                  border-2
                  border-primary-foreground
                  border-t-transparent
                  rounded-full
                  animate-spin
                " />

                Sending…

              </span>

            ) : (

              <>

                Send Message

                <Send className="
                  ml-2
                  w-4
                  h-4
                " />

              </>

            )}

          </Button>

        </form>

      </div>

    </div>
  );
}
