import React, { useEffect, useRef, useState } from 'react';
import { ImageCache, resolveMenuImage, menuDishImage } from '@jamanvaar/utils';

/**
 * An <img> that keeps working with no internet: when the picture cannot load it is replaced by the copy
 * saved on this device (see ImageCache). Online behaviour is unchanged.
 */
export const CachedImg: React.FC<React.ImgHTMLAttributes<HTMLImageElement> & { dishName?: string }> = ({ src, dishName, alt, onError, ...rest }) => {
  const resolved = resolveMenuImage(menuDishImage(src, dishName ?? alt));
  const currentSource = useRef(resolved);
  currentSource.current = resolved;
  const [local, setLocal] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setLocal(null); setFailed(false); }, [resolved]);
  const fallback = resolveMenuImage('/assets/menu/common/menu-placeholder-v2.svg');
  return (
    <img
      {...rest}
      alt={alt}
      src={local ?? (failed || !resolved ? fallback : resolved)}
      onError={(e) => {
        if (failed) return; // A missing fallback must not cause an error loop.
        const element = e.currentTarget;
        void (resolved ? ImageCache.localUrl(resolved) : Promise.resolve(null)).then((u) => {
          if (!element.isConnected || currentSource.current !== resolved) return;
          if (u && !local) setLocal(u);
          else {
            setLocal(null); setFailed(true); onError?.(e);
            // Consumers must not send an app-relative photo to Super Admin's root assets.
            if (fallback) element.src = fallback;
          }
        });
      }}
    />
  );
};
