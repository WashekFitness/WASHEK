import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import {
  Settings,
  X,
  Sun,
  Moon,
  Globe,
  Languages,
  Ruler,
  LockKeyhole,
  LogOut,
  Trash2,
  Dumbbell,
  Sparkles,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateNewProgram } from '@/lib/programService';

import {
  useAppSettings,
} from '@/lib/AppSettingsContext';

import {
  COUNTRIES,
  LANGUAGES,
  getCountryDefaults,
} from '@/lib/countries';

import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { supabaseApi } from '@/lib/supabaseApi';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';


function SearchableDropdown({
  value,
  onChange,
  options,
  placeholder,
}) {
  const [open, setOpen] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const filtered =
    options
      .filter((option) =>
        option
          .toLowerCase()
          .includes(
            search.toLowerCase()
          )
      )
      .slice(
        0,
        200
      );

  return (
    <div className="relative">

      <button
        type="button"
        onClick={() => {
          setOpen(
            (current) =>
              !current
          );

          setSearch('');
        }}
        className="
          w-full
          h-11
          px-3
          rounded-xl
          border
          border-border
          bg-muted/50
          text-sm
          text-left
          flex
          items-center
          justify-between
          hover:border-primary/40
          transition-all
          pointer-events-auto
          touch-manipulation
        "
      >

        <span
          className={
            value
              ? 'text-foreground'
              : 'text-muted-foreground'
          }
        >
          {
            value ||
            placeholder
          }
        </span>

        <span className="
          text-muted-foreground
          text-xs
        ">
          ▾
        </span>

      </button>


      {open && (
        <div className="
          absolute
          z-[10020]
          top-full
          left-0
          mt-1
          w-full
          bg-card
          border
          border-border
          rounded-xl
          shadow-2xl
          overflow-hidden
        ">

          <div className="
            p-2
            border-b
            border-border
          ">

            <input
              autoFocus
              value={
                search
              }
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search..."
              className="
                w-full
                h-8
                px-3
                text-sm
                bg-muted
                rounded-lg
                outline-none
                border-0
              "
            />

          </div>


          <div className="
            max-h-52
            overflow-y-auto
          ">

            {filtered.map(
              (option) => (

                <button
                  key={
                    option
                  }
                  type="button"
                  onClick={() => {
                    onChange(
                      option
                    );

                    setOpen(
                      false
                    );

                    setSearch('');
                  }}
                  className={cn(
                    `
                      w-full
                      px-3
                      py-2
                      text-sm
                      text-left
                      hover:bg-muted/80
                      transition-all
                      pointer-events-auto
                    `,
                    option ===
                      value &&
                      `
                        bg-primary/10
                        text-primary
                        font-semibold
                      `
                  )}
                >
                  {
                    option
                  }
                </button>

              )
            )}


            {filtered.length ===
              0 && (
              <p className="
                px-3
                py-3
                text-xs
                text-muted-foreground
              ">
                No results
              </p>
            )}

          </div>

        </div>
      )}

    </div>
  );
}


function CountryDropdown({
  value,
  onChange,
}) {
  const [open, setOpen] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const selected =
    COUNTRIES.find(
      (country) =>
        country.code ===
        value
    );

  const filtered =
    COUNTRIES.filter(
      (country) =>
        country.name
          .toLowerCase()
          .includes(
            search.toLowerCase()
          )
    );

  return (
    <div className="relative">

      <button
        type="button"
        onClick={() => {
          setOpen(
            (current) =>
              !current
          );

          setSearch('');
        }}
        className="
          w-full
          h-11
          px-3
          rounded-xl
          border
          border-border
          bg-muted/50
          text-sm
          text-left
          flex
          items-center
          justify-between
          hover:border-primary/40
          transition-all
          pointer-events-auto
          touch-manipulation
        "
      >

        <span
          className={
            selected
              ? 'text-foreground'
              : 'text-muted-foreground'
          }
        >
          {
            selected?.name ||
            'Select country…'
          }
        </span>

        <span className="
          text-muted-foreground
          text-xs
        ">
          ▾
        </span>

      </button>


      {open && (
        <div className="
          absolute
          z-[10020]
          top-full
          left-0
          mt-1
          w-full
          bg-card
          border
          border-border
          rounded-xl
          shadow-2xl
          overflow-hidden
        ">

          <div className="
            p-2
            border-b
            border-border
          ">

            <input
              autoFocus
              value={
                search
              }
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search country..."
              className="
                w-full
                h-8
                px-3
                text-sm
                bg-muted
                rounded-lg
                outline-none
                border-0
              "
            />

          </div>


          <div className="
            max-h-52
            overflow-y-auto
          ">

            {filtered.map(
              (country) => (

                <button
                  key={
                    country.code
                  }
                  type="button"
                  onClick={() => {
                    onChange(
                      country.code
                    );

                    setOpen(
                      false
                    );

                    setSearch('');
                  }}
                  className={cn(
                    `
                      w-full
                      px-3
                      py-2
                      text-sm
                      text-left
                      hover:bg-muted/80
                      transition-all
                      pointer-events-auto
                    `,
                    country.code ===
                      value &&
                      `
                        bg-primary/10
                        text-primary
                        font-semibold
                      `
                  )}
                >
                  {
                    country.name
                  }
                </button>

              )
            )}


            {filtered.length ===
              0 && (
              <p className="
                px-3
                py-3
                text-xs
                text-muted-foreground
              ">
                No results
              </p>
            )}

          </div>

        </div>
      )}

    </div>
  );
}


export default function AppSettingsModal({ triggerClassName, iconClassName } = {}) {
  const {
    settings,
    updateSettings,
  } =
    useAppSettings();

  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] =
    useState(false);

  const [local, setLocal] =
    useState(
      settings
    );

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Training program regeneration state
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [isRegeneratingProgram, setIsRegeneratingProgram] = useState(false);
  const [selectedTrainingType, setSelectedTrainingType] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    supabaseApi.auth
      .me()
      .then((p) => {
        if (mounted && p) {
          setUserProfile(p);
          if (!selectedTrainingType && p.training_type) {
            setSelectedTrainingType(p.training_type);
          }
        }
      })
      .catch((err) => {
        console.debug('[AppSettingsModal] me sync note:', err);
      });
    return () => {
      mounted = false;
    };
  }, [open]);

  const currentTrainingType =
    selectedTrainingType ||
    userProfile?.training_type ||
    user?.training_type ||
    user?.user_metadata?.training_type ||
    'calisthenics';

  const handleProceedToOnboarding = () => {
    setConfirmRegenerateOpen(false);
    closeModal();
    navigate('/onboarding');
  };


  const openModal = () => {
    setLocal(
      settings
    );

    setOpen(
      true
    );
  };


  const closeModal = () => {
    setLocal(
      settings
    );

    setOpen(
      false
    );
  };


  const handleCountryChange = (
    code
  ) => {
    const defaults =
      getCountryDefaults(
        code
      );

    setLocal(
      (previous) => ({
        ...previous,

        country:
          code,

        language:
          defaults.language,

        unit:
          defaults.unit,
      })
    );
  };


  const closeChangePassword = () => {
    setShowChangePassword(false);
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setChangingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success('Password changed successfully.');
      closeChangePassword();
    } catch (error) {
      toast.error(error?.message || 'Unable to change your password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      closeModal();
      await logout();
      try {
        await supabaseApi.auth.logout();
      } catch (err) {
        // Safe fallback
      }
      toast.success('Logged out successfully.');
      window.location.assign('/login');
    } catch (error) {
      console.error(
        '[SETTINGS] Logout failed:',
        error
      );
      closeModal();
      window.location.assign('/login');
    } finally {
      setLoggingOut(false);
    }
  };


  const handleDeleteAccount = async () => {
    if (deletingAccount) {
      return;
    }

    setDeletingAccount(true);

    try {
      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          'delete-account',
          {
            body: {},
          }
        );

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            'Failed to delete your account.'
        );
      }

      closeModal();
      await logout();
      try {
        await supabaseApi.auth.logout();
      } catch (err) {
        console.debug('[SETTINGS] Secondary auth cleanup error:', err);
      }

      toast.success(
        'Your account has been permanently deleted.'
      );

      window.location.assign('/login');
    } catch (error) {
      console.error(
        '[SETTINGS] Account deletion failed:',
        error
      );

      toast.error(
        error?.message ||
          'Failed to delete your account. Please try again.'
      );
    } finally {
      setDeletingAccount(false);
    }
  };


  const save = () => {
    updateSettings(
      {
        ...local,
      }
    );

    setOpen(
      false
    );
  };


  const modal =
    open &&
    typeof document !==
      'undefined'
      ? createPortal(
          <div
            className="
              fixed
              inset-0
              z-[10000]
              flex
              items-center
              justify-center
              p-0
              sm:p-4
              pointer-events-auto
            "
            role="dialog"
            aria-modal="true"
            aria-label="App Settings"
          >

            {/* Backdrop */}

            <button
              type="button"
              aria-label="Close settings"
              onClick={
                closeModal
              }
              className="
                absolute
                inset-0
                z-0
                bg-black/60
                backdrop-blur-sm
                pointer-events-auto
                cursor-default
              "
            />


            {/* Panel */}

            <section
              className="
                relative
                z-10
                flex
                flex-col
                w-full
                max-w-sm
                max-h-[calc(100dvh-1rem)]
                sm:max-h-[90vh]
                overflow-hidden
                rounded-3xl
                border
                border-border
                bg-card
                shadow-2xl
                pointer-events-auto
              "
              style={{
                marginBottom:
                  'env(safe-area-inset-bottom)',
              }}
            >

              {/* Header */}

              <header className="
                shrink-0
                flex
                items-center
                justify-between
                px-5
                pt-[max(1rem,env(safe-area-inset-top))]
                pb-4
                border-b
                border-border
                bg-card
              ">

                <h2 className="
                  font-heading
                  font-bold
                  text-lg
                ">
                  App Settings
                </h2>


                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  aria-label="Close settings"
                  className="
                    w-9
                    h-9
                    rounded-xl
                    bg-muted
                    flex
                    items-center
                    justify-center
                    pointer-events-auto
                    touch-manipulation
                  "
                >

                  <X className="
                    w-4
                    h-4
                  " />

                </button>

              </header>


              {/* Scrollable settings */}

              <div className="
                flex-1
                min-h-0
                overflow-y-auto
                overscroll-contain
                px-5
                py-4
                space-y-5
              ">

                {/* Appearance */}

                <div>

                  <p className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-muted-foreground
                    mb-2
                  ">
                    Appearance
                  </p>


                  <div className="
                    grid
                    grid-cols-2
                    gap-2
                  ">

                    {[
                      {
                        value:
                          'dark',
                        label:
                          'Dark',
                        icon:
                          Moon,
                      },

                      {
                        value:
                          'light',
                        label:
                          'Light',
                        icon:
                          Sun,
                      },
                    ].map(
                      ({
                        value,
                        label,
                        icon:
                          Icon,
                      }) => (

                        <button
                          key={
                            value
                          }
                          type="button"
                          onClick={() =>
                            setLocal(
                              (
                                previous
                              ) => ({
                                ...previous,
                                theme:
                                  value,
                              })
                            )
                          }
                          className={cn(
                            `
                              h-12
                              rounded-xl
                              border-2
                              flex
                              items-center
                              justify-center
                              gap-2
                              text-sm
                              font-semibold
                              pointer-events-auto
                              touch-manipulation
                            `,
                            local.theme ===
                              value
                              ? `
                                border-primary
                                bg-primary/10
                                text-foreground
                              `
                              : `
                                border-border
                                bg-muted/30
                                text-muted-foreground
                              `
                          )}
                        >

                          <Icon className="
                            w-4
                            h-4
                          " />

                          {
                            label
                          }

                        </button>

                      )
                    )}

                  </div>

                </div>


                {/* Country */}

                <div>

                  <p className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-muted-foreground
                    mb-2
                    flex
                    items-center
                    gap-1.5
                  ">

                    <Globe className="w-3 h-3" />

                    Country

                  </p>


                  <CountryDropdown
                    value={
                      local.country
                    }
                    onChange={
                      handleCountryChange
                    }
                  />

                </div>


                {/* Language */}

                <div>

                  <p className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-muted-foreground
                    mb-2
                    flex
                    items-center
                    gap-1.5
                  ">

                    <Languages className="w-3 h-3" />

                    Language

                  </p>


                  <SearchableDropdown
                    value={
                      local.language
                    }
                    onChange={
                      (value) =>
                        setLocal(
                          (
                            previous
                          ) => ({
                            ...previous,
                            language:
                              value,
                          })
                        )
                    }
                    options={
                      LANGUAGES
                    }
                    placeholder="Select language…"
                  />

                </div>


                {/* Units */}

                <div>

                  <p className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-muted-foreground
                    mb-2
                    flex
                    items-center
                    gap-1.5
                  ">

                    <Ruler className="w-3 h-3" />

                    Measurement System

                  </p>


                  <div className="
                    grid
                    grid-cols-2
                    gap-2
                  ">

                    {[
                      {
                        value:
                          'metric',
                        label:
                          'Metric (kg, cm)',
                      },

                      {
                        value:
                          'imperial',
                        label:
                          'Imperial (lbs, ft)',
                      },
                    ].map(
                      ({
                        value,
                        label,
                      }) => (

                        <button
                          key={
                            value
                          }
                          type="button"
                          onClick={() =>
                            setLocal(
                              (
                                previous
                              ) => ({
                                ...previous,
                                unit:
                                  value,
                              })
                            )
                          }
                          className={cn(
                            `
                              h-12
                              rounded-xl
                              border-2
                              px-2
                              text-xs
                              font-semibold
                              pointer-events-auto
                              touch-manipulation
                            `,
                            local.unit ===
                              value
                              ? `
                                border-primary
                                bg-primary/10
                                text-foreground
                              `
                              : `
                                border-border
                                bg-muted/30
                                text-muted-foreground
                              `
                          )}
                        >
                          {
                            label
                          }
                        </button>

                      )
                    )}

                  </div>

                </div>

                {/* Training Program */}
                {/* Training Program */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Dumbbell className="w-3 h-3 text-primary" />
                    Training Program
                  </p>

                  <button
                    type="button"
                    onClick={() => setConfirmRegenerateOpen(true)}
                    className="
                      w-full
                      h-12
                      rounded-xl
                      border
                      border-border
                      bg-muted/30
                      text-sm
                      font-semibold
                      hover:border-primary/40
                      hover:bg-muted
                      transition-all
                      pointer-events-auto
                      touch-manipulation
                      flex
                      items-center
                      justify-center
                      gap-2
                    "
                  >
                    <RefreshCw className="w-4 h-4 text-primary" />
                    <span>Generate New Program</span>
                  </button>
                  <p className="text-[11px] text-muted-foreground mt-1.5 px-0.5 leading-normal">
                    Return to onboarding to update your goals and create a new plan. All photos, chats, and logs remain safe.
                  </p>
                </div>

                {/* Change Password */}

                <div>

                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <LockKeyhole className="w-3 h-3" />
                    Security
                  </p>

                  <button
                    type="button"
                    onClick={() => setShowChangePassword(true)}
                    className="w-full h-12 rounded-xl border border-border bg-muted/30 text-sm font-semibold hover:border-primary/40 hover:bg-muted transition-all pointer-events-auto touch-manipulation"
                  >
                    Change Password
                  </button>

                </div>


                {/* Account Actions */}

                <div>

                  <p className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-muted-foreground
                    mb-2
                    flex
                    items-center
                    gap-1.5
                  ">
                    Account
                  </p>


                  <div className="
                    space-y-2
                  ">

                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={deletingAccount || loggingOut}
                      className="
                        w-full
                        h-12
                        rounded-xl
                        border
                        border-border
                        bg-muted/30
                        text-sm
                        font-semibold
                        hover:border-primary/40
                        hover:bg-muted
                        transition-all
                        pointer-events-auto
                        touch-manipulation
                        flex
                        items-center
                        justify-center
                        gap-2
                      "
                    >
                      {loggingOut ? (
                        <>
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span>Logging out...</span>
                        </>
                      ) : (
                        <>
                          <LogOut className="w-4 h-4" />
                          <span>Log Out</span>
                        </>
                      )}
                    </button>


                    <AlertDialog>

                      <AlertDialogTrigger
                        asChild
                      >

                        <button
                          type="button"
                          disabled={deletingAccount}
                          className="
                            w-full
                            h-12
                            rounded-xl
                            border
                            border-border
                            bg-muted/30
                            text-sm
                            font-semibold
                            text-destructive/70
                            hover:border-destructive/40
                            hover:bg-muted
                            hover:text-destructive
                            transition-all
                            pointer-events-auto
                            touch-manipulation
                            flex
                            items-center
                            justify-center
                            gap-2
                          "
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Account
                        </button>

                      </AlertDialogTrigger>


                      <AlertDialogContent>

                        <AlertDialogHeader>

                          <AlertDialogTitle>
                            Delete Account
                          </AlertDialogTitle>

                          <AlertDialogDescription>
                            This will permanently delete your account
                            and all associated data including your workout
                            programs, logs, nutrition entries, and progress
                            photos. This action cannot be undone.
                          </AlertDialogDescription>

                        </AlertDialogHeader>


                        <AlertDialogFooter>

                          <AlertDialogCancel
                            disabled={deletingAccount}
                          >
                            Cancel
                          </AlertDialogCancel>


                          <AlertDialogAction
                            className="
                              bg-destructive
                              text-destructive-foreground
                              hover:bg-destructive/90
                            "
                            onClick={
                              handleDeleteAccount
                            }
                            disabled={
                              deletingAccount
                            }
                          >
                            {deletingAccount
                              ? 'Deleting...'
                              : 'Delete My Account'}
                          </AlertDialogAction>

                        </AlertDialogFooter>

                      </AlertDialogContent>

                    </AlertDialog>

                  </div>

                </div>


              </div>


              {/* =================================================
                  FIXED / NON-SCROLLING SAVE FOOTER
                  ================================================= */}

              <footer
                className="
                  shrink-0
                  border-t
                  border-border
                  bg-card
                  px-5
                  pt-3
                "
                style={{
                  paddingBottom:
                    'max(0.875rem, env(safe-area-inset-bottom))',
                }}
              >

                <Button
                  type="button"
                  onClick={
                    save
                  }
                  className="
                    w-full
                    h-12
                    min-h-12
                    font-heading
                    font-semibold
                    pointer-events-auto
                    touch-manipulation
                  "
                >
                  Save Settings
                </Button>

              </footer>

            </section>

          </div>,

          document.body
        )
      : null;


  const changePasswordModal =
    showChangePassword &&
    typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[11000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Change Password"
          >
            <section className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-heading font-bold text-lg">Change Password</h2>
                <button
                  type="button"
                  onClick={closeChangePassword}
                  aria-label="Close change password"
                  className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center"
                  disabled={changingPassword}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <Input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />

                <Input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />

                <Button
                  type="submit"
                  className="w-full h-12"
                  disabled={changingPassword}
                >
                  {changingPassword ? 'Updating…' : 'Update Password'}
                </Button>
              </form>
            </section>
          </div>,
          document.body
        )
      : null;

  const confirmRegenerateModal =
    confirmRegenerateOpen &&
    typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Generate New Program Confirmation"
          >
            <section className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>New Program Onboarding</span>
                  </div>
                  <h2 className="font-heading font-bold text-xl text-foreground">
                    Generate a New Program?
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmRegenerateOpen(false)}
                  aria-label="Close dialog"
                  className="w-9 h-9 rounded-xl bg-muted hover:bg-muted/80 flex items-center justify-center shrink-0 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                This will send you back to onboarding so if your goals change, you can update all your new preferences, experience, and training style just like when you started out.
              </p>

              {/* Data Safety Card */}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs space-y-2">
                <p className="font-bold text-primary flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-primary" />
                  Your existing data is completely safe and untouched:
                </p>
                <ul className="space-y-1.5 text-muted-foreground list-disc list-inside text-xs leading-relaxed">
                  <li>
                    <strong className="text-foreground">Progress photos</strong>, custom labels, and date tags remain exactly where they are
                  </li>
                  <li>
                    <strong className="text-foreground">Coach Kael</strong> chat history and guidance memory stay fully preserved
                  </li>
                  <li>
                    <strong className="text-foreground">Past workout logs</strong> and nutrition tracking remain intact
                  </li>
                  <li>
                    <strong className="text-foreground">Profile &amp; stats</strong> stay as they were before
                  </li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmRegenerateOpen(false)}
                  className="w-full sm:w-1/2 h-12 rounded-xl text-xs font-semibold order-2 sm:order-1"
                >
                  Keep Current Program
                </Button>
                <Button
                  type="button"
                  onClick={handleProceedToOnboarding}
                  className="w-full sm:w-1/2 h-12 rounded-xl font-heading font-semibold text-xs shadow-md order-1 sm:order-2"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Continue to Onboarding
                </Button>
              </div>
            </section>
          </div>,
          document.body
        )
      : null;


  return (
    <>

      {/* Header trigger */}

      <button
        type="button"
        onClick={
          openModal
        }
        aria-label="App Settings"
        className={cn(
          `
            relative
            z-[110]
            flex
            items-center
            justify-center
            w-11
            h-11
            min-w-11
            min-h-11
            rounded-xl
            bg-card
            border
            border-border
            shadow-lg
            hover:bg-muted
            active:bg-muted
            transition-all
            pointer-events-auto
            touch-manipulation
            shrink-0
          `,
          triggerClassName
        )}
      >

        <Settings className={cn("w-5 h-5 text-muted-foreground pointer-events-none", iconClassName)} />

      </button>


      {modal}
      {changePasswordModal}
      {confirmRegenerateModal}

    </>
  );
}
