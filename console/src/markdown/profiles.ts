import type { MarkdownCompatibilityProfile } from "./types";

export const DEFAULT_MARKDOWN_PROFILE: MarkdownCompatibilityProfile =
  "bytemd-v1";

export const isBytemdProfile = (
  profile: MarkdownCompatibilityProfile
): boolean => profile === "bytemd-v1";

export const usesHardBreaks = (
  profile: MarkdownCompatibilityProfile
): boolean => profile === "legacy";
