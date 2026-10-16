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

  const activeToasts = toasts.filter(t => t.open !== false);

  return (
    <ToastProvider>

      {activeToasts.map(
        toast => {

          const {
            id,
            title,
            description,
            action,
            onOpenChange,
            duration,
            ...props
          } = toast;

          return (
            <Toast
              key={id}
              {...props}
            >

              <div className="grid gap-1 pr-6">

                {title && (
                  <ToastTitle>
                    {title}
                  </ToastTitle>
                )}

                {description && (
                  <ToastDescription>
                    {description}
                  </ToastDescription>
                )}

              </div>

              {action}

              <ToastClose
                type="button"
                aria-label="Close notification"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (typeof onOpenChange === 'function') {
                    onOpenChange(false);
                  }
                  dismiss(id);
                }}
              />

            </Toast>
          );
        }
      )}

      <ToastViewport />

    </ToastProvider>
  );
}
