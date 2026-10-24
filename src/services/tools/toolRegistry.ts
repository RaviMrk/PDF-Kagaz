import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';

import { IMAGES_MAX } from './limits';

export type ToolId =
  | 'merge'
  | 'split'
  | 'organize'
  | 'images-to-pdf'
  | 'scan'
  | 'pdf-to-images'
  | 'ocr'
  | 'compress'
  | 'protect'
  | 'unlock'
  | 'watermark'
  | 'page-numbers'
  | 'sign'
  | 'metadata';
export type RunnableToolId =
  | 'merge'
  | 'split'
  | 'organize'
  | 'images-to-pdf'
  | 'scan'
  | 'compress'
  | 'protect'
  | 'unlock'
  | 'pdf-to-images'
  | 'watermark'
  | 'page-numbers'
  | 'sign';
export type ToolGroup = 'organise' | 'convert' | 'optimise' | 'security' | 'edit';

export type ToolDef = {
  id: ToolId;
  specId: string;
  group: ToolGroup;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  labelKey: string;
  descriptionKey: string;
  available: boolean;
  minInputs: number;
  maxInputs: number;
  href: Href;
};

const GROUP_ORDER: readonly ToolGroup[] = ['organise', 'convert', 'optimise', 'security', 'edit'];

function camel(id: string): string {
  return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function def(
  id: ToolId,
  specId: string,
  group: ToolGroup,
  icon: ToolDef['icon'],
  available = false,
  maxInputs = 1,
  minInputs = 1,
): ToolDef {
  return {
    id,
    specId,
    group,
    icon,
    labelKey: `tools.${camel(id)}`,
    descriptionKey: `tools.desc.${camel(id)}`,
    available,
    minInputs,
    maxInputs,
    href: id === 'scan' ? '/scan' : { pathname: '/tool/[toolId]', params: { toolId: id } },
  };
}

export const TOOLS: readonly ToolDef[] = [
  def('merge', 'T-01', 'organise', 'file-multiple-outline', true, 50, 2),
  def('split', 'T-02', 'organise', 'content-cut', true),
  def('organize', 'T-03', 'organise', 'file-arrow-up-down-outline', true),
  def('images-to-pdf', 'T-04', 'convert', 'image-multiple-outline', true, IMAGES_MAX),
  def('scan', 'T-05', 'convert', 'camera-outline', true),
  def('compress', 'T-06', 'optimise', 'arrow-collapse-vertical', true),
  def('protect', 'T-07', 'security', 'lock-outline'),
  def('unlock', 'T-08', 'security', 'lock-open-outline'),
  def('pdf-to-images', 'T-09', 'convert', 'file-image-outline'),
  def('watermark', 'T-10', 'edit', 'water-outline'),
  def('page-numbers', 'T-11', 'edit', 'numeric'),
  def('sign', 'T-12', 'edit', 'draw'),
  def('ocr', 'T-13', 'convert', 'text-recognition'),
  def('metadata', 'T-14', 'edit', 'tag-outline'),
];

export const QUICK_TOOL_IDS: readonly ToolId[] = ['scan', 'merge', 'compress', 'images-to-pdf'];

export function toolById(id: string): ToolDef | null {
  return TOOLS.find((t) => t.id === id) ?? null;
}

export function toolsByGroup(): { group: ToolGroup; tools: ToolDef[] }[] {
  return GROUP_ORDER.map((group) => ({ group, tools: TOOLS.filter((t) => t.group === group) }));
}
