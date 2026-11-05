// LABEL POSITION | which card edge the label tabs hang from, rendered into <html data-labels> like the theme
export const LABEL_POSITIONS = ['top', 'bottom'] as const;

export type LabelPosition = typeof LABEL_POSITIONS[number];

export const DEFAULT_LABEL_POSITION: LabelPosition = 'top';
export const LABEL_POSITION_COOKIE = 'labels';

export function isLabelPosition(value: unknown): value is LabelPosition { return LABEL_POSITIONS.some((position) => position === value) }

// IMAGE FIT | cropped to fill the card, or whole with plain ground around it, rendered into <html data-images>
export const IMAGE_FITS = ['cropped', 'whole'] as const;

export type ImageFit = typeof IMAGE_FITS[number];

export const DEFAULT_IMAGE_FIT: ImageFit = 'cropped';
export const IMAGE_FIT_COOKIE = 'images';

export function isImageFit(value: unknown): value is ImageFit { return IMAGE_FITS.some((fit) => fit === value) }
