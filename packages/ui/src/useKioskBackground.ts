import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { WelcomeScreenPresentation } from '@jamanvaar/types';
import { DEFAULT_KIOSK_WELCOME_BACKGROUND, resolveMenuImage, welcomeLandscapeUrl, WelcomeImageCache } from '@jamanvaar/utils';

/** One cached portrait/landscape image lifecycle for kiosk welcome and language screens. */
export function useKioskBackground(settings: WelcomeScreenPresentation, backgroundUrl: string, preview: boolean, retainSources: string[] = []) {
  const container = useRef<HTMLElement>(null),
    [landscape, setLandscape] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      setLandscape(bounds.width > bounds.height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const wideSource = welcomeLandscapeUrl(backgroundUrl, settings.backgroundLandscapeImageUrl),
    selectedSource = landscape ? wideSource : backgroundUrl;
  const fallbackSource = landscape ? DEFAULT_KIOSK_WELCOME_BACKGROUND.landscapeImageUrl : DEFAULT_KIOSK_WELCOME_BACKGROUND.imageUrl,
    fallback = resolveMenuImage(fallbackSource)!;
  const [image, setImage] = useState(resolveMenuImage(backgroundUrl)),
    fallbackAttempted = useRef(false),
    activeSource = useRef(selectedSource),
    ownedUrls = useRef<string[]>([]),
    imageRequest = useRef(0);
  activeSource.current = selectedSource;
  const retainedKey = JSON.stringify(retainSources);
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    const request = ++imageRequest.current;
    ownedUrls.current = urls;
    fallbackAttempted.current = false;
    setImage(resolveMenuImage(selectedSource));
    if (!preview) {
      void WelcomeImageCache.source(selectedSource).then((source) => {
        if (active && !fallbackAttempted.current) {
          if (source.startsWith('blob:')) urls.push(source);
          setImage(source);
        } else if (source.startsWith('blob:')) URL.revokeObjectURL(source);
      });
      const retained = [
        backgroundUrl,
        wideSource,
        DEFAULT_KIOSK_WELCOME_BACKGROUND.imageUrl,
        DEFAULT_KIOSK_WELCOME_BACKGROUND.landscapeImageUrl,
        ...(JSON.parse(retainedKey) as string[])
      ];
      for (const asset of new Set(retained))
        if (asset !== selectedSource)
          void WelcomeImageCache.source(asset).then((source) => {
            if (source.startsWith('blob:')) URL.revokeObjectURL(source);
          });
      void WelcomeImageCache.retain(retained);
    }
    return () => {
      active = false;
      if (imageRequest.current === request) ++imageRequest.current;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [backgroundUrl, selectedSource, wideSource, preview, retainedKey]);
  const onImageError = () => {
    if (image === fallback || fallbackAttempted.current) return;
    fallbackAttempted.current = true;
    const request = imageRequest.current;
    if (preview) setImage(fallback);
    else
      void WelcomeImageCache.source(fallbackSource).then((source) => {
        if (imageRequest.current === request && activeSource.current === selectedSource) {
          if (source.startsWith('blob:')) ownedUrls.current.push(source);
          setImage(source);
        } else if (source.startsWith('blob:')) URL.revokeObjectURL(source);
      });
  };
  const imageStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: settings.backgroundFit || 'cover',
    objectPosition: `${settings.backgroundPositionX ?? 50}% ${settings.backgroundPositionY ?? 50}%`,
    transform: `scale(${settings.backgroundZoom ?? 1})`
  };
  return { container, image, fallback, imageStyle, onImageError };
}
