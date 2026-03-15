"use client"

import { forwardRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export const ReplyInput = forwardRef<HTMLTextAreaElement, {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  placeholder: string;
}>(function ReplyInput({ value, onChange, onSubmit, submitting, placeholder }, ref) {
  const [focused, setFocused] = useState(false);
  const tc = useTranslations('common');

  return (
    <div className="flex gap-2 items-end py-1.5">
      <Textarea
        ref={ref}
        rows={focused ? 3 : 1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { if (!value) setFocused(false); }}
        placeholder={placeholder}
        className="flex-1 text-xs resize-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
        }}
      />
      {(focused || value) && (
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={!value.trim() || submitting}
        >
          {submitting ? tc('submitting') : tc('send')}
        </Button>
      )}
    </div>
  );
});
