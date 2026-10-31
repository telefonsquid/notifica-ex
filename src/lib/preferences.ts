import z from 'zod';

// LABEL POSITION | which card edge the label tabs hang from, rendered into <html data-labels> like the theme
export const LABEL_POSITIONS = ['top', 'bottom'] as const;

export type LabelPosition = typeof LABEL_POSITIONS[number];
export const labelPositionSchema = z.enum(LABEL_POSITIONS);

export const DEFAULT_LABEL_POSITION: LabelPosition = 'top';
export const LABEL_POSITION_COOKIE = 'labels';

export function isLabelPosition(value: unknown): value is LabelPosition { return labelPositionSchema.safeParse(value).success }
