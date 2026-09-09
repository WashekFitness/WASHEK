import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createClient,
} from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

Deno.serve(
  async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        }
      );
    }

    if (req.method !== "POST") {
      return jsonResponse(
        {
          success: false,
          error:
            "Method not allowed.",
        },
        405
      );
    }

    try {
      const supabaseUrl =
        Deno.env.get(
          "SUPABASE_URL"
        );

      const serviceRoleKey =
        Deno.env.get(
          "SERVICE_ROLE_KEY"
        ) ||
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY"
        );

      const stripeSecretKey =
        Deno.env.get(
          "STRIPE_SECRET_KEY"
        );

      if (
        !supabaseUrl ||
        !serviceRoleKey
      ) {
        throw new Error(
          "Supabase server configuration is incomplete."
        );
      }

      /*
       * ----------------------------------------------------------
       * AUTHENTICATE THE REQUEST
       * ----------------------------------------------------------
       */

      const authHeader =
        req.headers.get(
          "Authorization"
        );

      if (!authHeader) {
        return jsonResponse(
          {
            success: false,
            error:
              "Authentication is required.",
          },
          401
        );
      }

      const supabaseAdmin =
        createClient(
          supabaseUrl,
          serviceRoleKey,
          {
            auth: {
              autoRefreshToken:
                false,
              persistSession:
                false,
            },
          }
        );

      const token =
        authHeader.replace(
          /^Bearer\s+/i,
          ""
        );

      const {
        data: {
          user: authUser,
        },
        error: authError,
      } =
        await supabaseAdmin.auth.getUser(
          token
        );

      if (
        authError ||
        !authUser
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Your login session is invalid or has expired.",
          },
          401
        );
      }

      const userId =
        authUser.id;

      /*
       * ----------------------------------------------------------
       * LOAD PROFILE
       * ----------------------------------------------------------
       */

      const {
        data: profile,
        error: profileError,
      } =
        await supabaseAdmin
          .from("profiles")
          .select(
            "id, stripe_customer_id, stripe_subscription_id"
          )
          .eq(
            "id",
            userId
          )
          .maybeSingle();

      if (profileError) {
        throw new Error(
          `Unable to load your account: ${profileError.message}`
        );
      }

      /*
       * ----------------------------------------------------------
       * CANCEL STRIPE SUBSCRIPTION
       *
       * Account deletion must not leave a live subscription
       * charging the user after their account is gone.
       * ----------------------------------------------------------
       */

      if (
        profile?.stripe_subscription_id
      ) {
        if (!stripeSecretKey) {
          throw new Error(
            "Stripe server configuration is incomplete. Your account was not deleted."
          );
        }

        const subscriptionId =
          profile.stripe_subscription_id;

        const stripeResponse =
          await fetch(
            `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(
              subscriptionId
            )}`,
            {
              method:
                "DELETE",
              headers: {
                Authorization:
                  `Bearer ${stripeSecretKey}`,
              },
            }
          );

        if (
          !stripeResponse.ok
        ) {
          let stripeBody =
            "";

          try {
            stripeBody =
              await stripeResponse.text();
          } catch {
            stripeBody =
              "";
          }

          console.error(
            "[DELETE ACCOUNT] Stripe cancellation failed:",
            stripeResponse.status,
            stripeBody
          );

          throw new Error(
            "We could not cancel your subscription, so your account was not deleted. Please try again."
          );
        }
      }

      /*
       * ----------------------------------------------------------
       * DELETE PRIVATE USER STORAGE
       *
       * Files are stored under the user's UUID directory.
       * Remove every file under that directory before deleting
       * the Auth user.
       * ----------------------------------------------------------
       */

      const bucket =
        Deno.env.get(
          "SUPABASE_MEDIA_BUCKET"
        ) ||
        "user-media";

      async function removeStorageFolder(
        prefix: string
      ) {
        const pathsToDelete:
          string[] = [];

        let offset =
          0;

        const pageSize =
          100;

        while (true) {
          const {
            data: files,
            error: listError,
          } =
            await supabaseAdmin.storage
              .from(bucket)
              .list(
                prefix,
                {
                  limit:
                    pageSize,
                  offset,
                }
              );

          if (listError) {
            throw new Error(
              `Unable to inspect your uploaded files: ${listError.message}`
            );
          }

          if (
            !files ||
            files.length === 0
          ) {
            break;
          }

          for (
            const file of files
          ) {
            /*
             * Supabase Storage returns folders as entries without
             * an id. Recurse into those folders.
             */
            if (
              !file.id &&
              file.name
            ) {
              await removeStorageFolder(
                `${prefix}/${file.name}`
              );
            } else if (
              file.name
            ) {
              pathsToDelete.push(
                `${prefix}/${file.name}`
              );
            }
          }

          if (
            files.length <
            pageSize
          ) {
            break;
          }

          offset +=
            pageSize;
        }

        if (
          pathsToDelete.length
        ) {
          const {
            error:
              removeError,
          } =
            await supabaseAdmin.storage
              .from(bucket)
              .remove(
                pathsToDelete
              );

          if (
            removeError
          ) {
            throw new Error(
              `Unable to remove your uploaded files: ${removeError.message}`
            );
          }
        }
      }

      await removeStorageFolder(
        userId
      );

      /*
       * ----------------------------------------------------------
       * DELETE AUTH USER
       *
       * Your database schema uses ON DELETE CASCADE for the
       * user's main records, so deleting the Auth user removes
       * the associated profile/workout/nutrition/etc. records.
       * ----------------------------------------------------------
       */

      const {
        error:
          deleteError,
      } =
        await supabaseAdmin.auth.admin.deleteUser(
          userId
        );

      if (
        deleteError
      ) {
        throw new Error(
          `Unable to permanently delete your account: ${deleteError.message}`
        );
      }

      return jsonResponse({
        success: true,
        message:
          "Your account has been permanently deleted.",
      });
    } catch (error) {
      console.error(
        "[DELETE ACCOUNT] Unexpected error:",
        error
      );

      return jsonResponse(
        {
          success: false,
          error:
            error?.message ||
            "Unable to delete your account.",
        },
        500
      );
    }
  }
);
