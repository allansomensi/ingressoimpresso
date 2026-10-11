/**
 * The pictures of the templates in public/modelos (ADR 0062): one JPEG per template, its first
 * palette filled with the sample event, captured by `just template-images` from /modelos/<slug>.
 */

import { templateById, type TemplateId } from "./catalog";

/** Width of the captured pictures, in pixels. */
export const TEMPLATE_IMAGE_WIDTH = 1200;

/** Pixel size of a template's picture: the ticket's proportions (body plus stub). */
export function templateImageSize(id: TemplateId): { width: number; height: number } {
  const template = templateById(id);
  const palette = template?.palettes[0];
  if (template === undefined || palette === undefined) {
    return { width: TEMPLATE_IMAGE_WIDTH, height: Math.round(TEMPLATE_IMAGE_WIDTH / 3) };
  }
  const { design } = template.build(palette);
  const total = design.widthMm + (design.stub?.widthMm ?? 0);
  return { width: TEMPLATE_IMAGE_WIDTH, height: Math.round((TEMPLATE_IMAGE_WIDTH * design.heightMm) / total) };
}
