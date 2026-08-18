import type { MarkdownCompatibilityProfile } from "./types";

export const DEFAULT_MARKDOWN_PROFILE: MarkdownCompatibilityProfile =
  "luogu-v1";

export const isLuoguProfile = (
  profile: MarkdownCompatibilityProfile
): boolean => profile === "luogu-v1";

export const usesHardBreaks = (
  profile: MarkdownCompatibilityProfile
): boolean => profile === "legacy";
