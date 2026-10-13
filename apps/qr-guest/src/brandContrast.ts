function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}
export function accentInk(hex: string): '#0b253a' | '#ffffff' | '#000000' {
  if (!/^#[\da-f]{6}$/i.test(hex)) return '#ffffff';
  const background = luminance(hex), navy = luminance('#0b253a');
  const whiteContrast = 1.05 / (background + 0.05);
  const navyContrast = (Math.max(background, navy) + 0.05) / (Math.min(background, navy) + 0.05);
  if (navyContrast < 4.5 && whiteContrast < 4.5) return '#000000';
  return navyContrast > whiteContrast ? '#0b253a' : '#ffffff';
}
export function accentText(hex: string): string {
  if (!/^#[\da-f]{6}$/i.test(hex)) return '#0b253a';
  return 1.05 / (luminance(hex) + 0.05) >= 4.5 ? hex : '#0b253a';
}
