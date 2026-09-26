import React, { useEffect, useState } from 'react';
import { ImageCache } from '@jamanvaar/utils';

/**
 * An <img> that keeps working with no internet: when the picture cannot load it is replaced by the copy
 * saved on this device (see ImageCache). Online behaviour is unchanged.
 */
export const CachedImg: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({ src, onError, ...rest }) => {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => setLocal(null), [src]);
  return (
    <img
      {...rest}
      src={local ?? src}
      onError={(e) => {
        onError?.(e);
        if (src && !local) void ImageCache.localUrl(src).then((u) => u && setLocal(u));
      }}
    />
  );
};
