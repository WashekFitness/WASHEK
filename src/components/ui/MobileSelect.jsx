import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const isMobile = () => window.innerWidth < 640;

/**
 * MobileSelect — uses a bottom Drawer on small screens, standard Select on desktop.
 * Props: value, onValueChange, placeholder, options: [{value, label}], triggerClassName
 */
export default function MobileSelect({ value, onValueChange, placeholder, options = [], triggerClassName }) {
  const [open, setOpen] = useState(false);

  if (!isMobile()) {
    return (
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const selected = options.find(o => o.value === value);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm h-9',
          triggerClassName
        )}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected?.label ?? placeholder ?? 'Select…'}
        </span>
        <svg className="w-4 h-4 opacity-50 ml-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{placeholder ?? 'Select'}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-8 space-y-2">
            {options.map(o => (
              <Button
                key={o.value}
                variant={o.value === value ? 'default' : 'ghost'}
                className="w-full h-12 justify-start text-base"
                onClick={() => { onValueChange(o.value); setOpen(false); }}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}