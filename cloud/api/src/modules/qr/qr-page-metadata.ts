/** HTML returned only after the public page's existing license/publication checks. */
const esc = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export function restaurantPageHead(
  page: {
    restaurantName: string;
    branchName: string;
    content: {
      title: string;
      welcome: string;
      address: string;
      phone: string;
      instagram: string;
      heroUrl: string;
      logoUrl: string;
      seo?: { title: string; description: string; imageUrl: string };
      businessHours?: {
        weekly: Array<{ day: number; intervals: Array<{ start: string; end: string }> }>;
        exceptions: Array<{ date: string; intervals: Array<{ start: string; end: string }> }>;
      } | null;
    };
    items?: Array<{ imageUrl?: string }>;
  },
  canonical: string
) {
  const c = page.content,
    title = c.seo?.title || `${page.restaurantName} · ${page.branchName}`,
    description = (c.seo?.description || c.welcome).slice(0, 180);
  const imageRef = c.seo?.imageUrl || c.heroUrl || c.logoUrl || page.items?.find((item) => item.imageUrl)?.imageUrl || '';
  let image = '';
  try {
    const url = new URL(imageRef.startsWith('/assets/') ? '/q' + imageRef : imageRef, canonical);
    if (imageRef && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) image = url.href;
  } catch {
    /* Omit invalid public images. */
  }
  const closed = [{ start: '00:00', end: '00:00' }];
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: page.restaurantName,
    description,
    url: canonical,
    ...(image ? { image } : {}),
    ...(c.address ? { address: c.address } : {}),
    ...(c.phone ? { telephone: c.phone } : {}),
    ...(c.instagram ? { sameAs: [c.instagram] } : {}),
    ...(c.businessHours
      ? {
          openingHoursSpecification: c.businessHours.weekly.flatMap((row) =>
            (row.intervals.length ? row.intervals : closed).map((interval) => ({
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: 'https://schema.org/' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][row.day],
              opens: interval.start,
              closes: interval.end
            }))
          ),
          specialOpeningHoursSpecification: c.businessHours.exceptions.flatMap((row) =>
            (row.intervals.length ? row.intervals : closed).map((interval) => ({
              '@type': 'OpeningHoursSpecification',
              validFrom: row.date,
              validThrough: row.date,
              opens: interval.start,
              closes: interval.end
            }))
          )
        }
      : {})
  };
  return `<title>${esc(title)}</title>\n<meta name="description" content="${esc(description)}">\n<link rel="canonical" href="${esc(canonical)}">\n<meta property="og:type" content="website">\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:description" content="${esc(description)}">\n<meta property="og:url" content="${esc(canonical)}">\n${image ? `<meta property="og:image" content="${esc(image)}">\n<meta property="og:image:alt" content="${esc(page.restaurantName)}">` : ''}\n<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">\n<meta name="twitter:title" content="${esc(title)}">\n<meta name="twitter:description" content="${esc(description)}">\n${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}\n<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script>`;
}
