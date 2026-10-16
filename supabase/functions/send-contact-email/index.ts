const corsHeaders = {
  'Access-Control-Allow-Origin': '*',

  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',

  'Access-Control-Allow-Methods':
    'POST, OPTIONS',

  'Content-Type':
    'application/json',
};

function json(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers:
        corsHeaders,
    }
  );
}

function escapeHtml(
  value: string
) {
  return value
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );
}

Deno.serve(
  async (req) => {
    if (
      req.method ===
      'OPTIONS'
    ) {
      return new Response(
        'ok',
        {
          status: 200,
          headers:
            corsHeaders,
        }
      );
    }

    if (
      req.method !==
      'POST'
    ) {
      return json(
        {
          success:
            false,

          error:
            'Method not allowed.',
        },
        405
      );
    }

    try {
      const resendApiKey =
        Deno.env.get(
          'RESEND_API_KEY'
        );

      if (
        !resendApiKey
      ) {
        return json(
          {
            success:
              false,

            error:
              'RESEND_API_KEY is not configured in Supabase.',
          },
          500
        );
      }

      const body =
        await req.json();

      const name =
        typeof body?.name === 'string'
          ? body.name.trim()
          : '';

      const senderEmail =
        typeof body?.email === 'string'
          ? body.email.trim()
          : typeof body?.reply_to === 'string'
            ? body.reply_to.trim()
            : '';

      const to =
        typeof body?.to ===
        'string' && body.to.trim()
          ? body.to.trim()
          : 'washekfitness@gmail.com';

      const subject =
        typeof body?.subject ===
        'string' && body.subject.trim()
          ? body.subject.trim()
          : name
            ? `WASHEK Contact Message from ${name}`
            : 'WASHEK Contact Message';

      const message =
        typeof body?.body ===
        'string' && body.body.trim()
          ? body.body.trim()
          : typeof body?.message ===
            'string' && body.message.trim()
            ? body.message.trim()
            : '';

      if (
        !subject
      ) {
        return json(
          {
            success:
              false,

            error:
              'Email subject is required.',
          },
          400
        );
      }

      if (
        !message
      ) {
        return json(
          {
            success:
              false,

            error:
              'Email message is required.',
          },
          400
        );
      }

      /*
       * Always deliver Contact messages to
       * your WASHEK inbox.
       */
      const destination =
        'washekfitness@gmail.com';

      /*
       * Resend's testing sender works without
       * requiring you to verify your own domain.
       *
       * Once you verify a Washek domain in Resend,
       * you can change this to your own address.
       */
      const fromAddress =
        Deno.env.get(
          'CONTACT_EMAIL_FROM'
        ) ||
        'WASHEK <onboarding@resend.dev>';

      const safeSubject =
        escapeHtml(
          subject
        );

      const safeMessage =
        escapeHtml(
          message
        ).replace(
          /\n/g,
          '<br />'
        );

      const emailPayload: Record<string, unknown> = {
        from:
          fromAddress,

        to: [
          destination,
        ],

        subject:
          safeSubject,

        text:
          message,

        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
            <h2 style="color: #0f172a; margin-bottom: 12px;">WASHEK Contact Message</h2>
            ${name ? `<p><strong>Sender Name:</strong> ${escapeHtml(name)}</p>` : ''}
            ${senderEmail ? `<p><strong>Sender Email:</strong> <a href="mailto:${escapeHtml(senderEmail)}">${escapeHtml(senderEmail)}</a></p>` : ''}
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
            <div style="white-space: pre-wrap;">${safeMessage}</div>
          </div>
        `,
      };

      if (senderEmail) {
        emailPayload.reply_to = senderEmail;
      }

      const response =
        await fetch(
          'https://api.resend.com/emails',
          {
            method:
              'POST',

            headers: {
              Authorization:
                `Bearer ${resendApiKey}`,

              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify(emailPayload),
          }
        );

      const result =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (
        !response.ok
      ) {
        console.error(
          'Resend error:',
          result
        );

        return json(
          {
            success:
              false,

            error:
              result?.message ||
              result?.error ||
              'Resend rejected the email.',
          },
          502
        );
      }

      return json({
        success:
          true,

        id:
          result?.id ||
          null,
      });
    } catch (
      error
    ) {
      console.error(
        'send-contact-email error:',
        error
      );

      return json(
        {
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : 'Unable to send contact email.',
        },
        500
      );
    }
  }
);
