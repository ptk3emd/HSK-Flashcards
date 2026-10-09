import React from 'react';
import { Loader2 } from 'lucide-react';

/** Placeholder while a view's code chunk downloads (usually a fraction of a second). */
export const ViewLoading: React.FC = () => (
  <div className="w-full flex justify-center py-16" role="status">
    <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none opacity-60" aria-hidden="true" />
    <span className="sr-only">Carregando</span>
  </div>
);
