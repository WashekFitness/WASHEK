import { useRef } from 'react';
import { Video, Upload, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VideoInput({ onVideoSelected, disabled }) {
  const recordRef = useRef(null);
  const uploadRef = useRef(null);

  return (
    <div className="grid grid-cols-2 gap-3">
      <input
        ref={recordRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onVideoSelected(f); e.target.value = ''; }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="video/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onVideoSelected(f); e.target.value = ''; }}
      />

      <Button
        variant="outline"
        className="h-20 flex-col gap-1.5 rounded-2xl border-2"
        disabled={disabled}
        onClick={() => recordRef.current?.click()}
      >
        <Camera className="w-5 h-5 text-primary" />
        <span className="text-xs font-semibold">Record</span>
      </Button>
      <Button
        variant="outline"
        className="h-20 flex-col gap-1.5 rounded-2xl border-2"
        disabled={disabled}
        onClick={() => uploadRef.current?.click()}
      >
        <Upload className="w-5 h-5 text-primary" />
        <span className="text-xs font-semibold">Upload</span>
      </Button>
    </div>
  );
}