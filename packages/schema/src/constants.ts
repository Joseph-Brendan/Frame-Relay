export const KIT_VERSION = '1.0';
export const SUPPORTED_KIT_VERSIONS = ['1.0'] as const;

export const MANIFEST_FILENAME = 'frame-relay.json';
export const KIT_FOLDER_NAME = 'frame-relay-kit';

export const STATE_NAMES = [
  'Default',
  'Hover',
  'Focus',
  'Pressed',
  'Disabled',
  'Loading',
  'Error',
] as const;

export type StateName = (typeof STATE_NAMES)[number];

export const STANDARD_VARIANT_PROPERTIES = ['Variant', 'Size', 'State'] as const;
export type StandardVariantProperty = (typeof STANDARD_VARIANT_PROPERTIES)[number];

// Regexes
export const COMPONENT_NAME_REGEX = /^[A-Z][a-zA-Z0-9]*$/;
export const PART_NAME_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const PROP_NAME_REGEX = /^[a-z][a-zA-Z0-9]*$/;
export const TOKEN_PATH_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;
export const TOKEN_REFERENCE_REGEX = /^\{[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\}$/;
