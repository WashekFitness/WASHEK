import {
  useToast,
} from '@/components/ui/use-toast';

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';

export function Toaster() {
  const {
    toasts,
    dismiss,
  } =
    useToast();

  return (
    <ToastProvider>

      {toasts.map(
        toast => {

          const {
            id,
            title,
            description,
            action,
            ...props
          } = toast;

          return (
            <Toast
              key={
                id
              }
              {...props}
            >

              <div className="grid gap-1 pr-2">

                {title && (
                  <ToastTitle>
                    {
                      title
                    }
                  </ToastTitle>
                )}

                {description && (
                  <ToastDescription>
                    {
                      description
                    }
                  </ToastDescription>
                )}

              </div>

              {action}

              <ToastClose
                type="button"
                aria-label="Close notification"
                onClick={() =>
                  dismiss(
                    id
                  )
                }
              />

            </Toast>
          );
        }
      )}

      <ToastViewport />

    </ToastProvider>
  );
}
