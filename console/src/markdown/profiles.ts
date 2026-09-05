import type { MarkdownCompatibilityProfile } from "./types";

export const DEFAULT_MARKDOWN_PROFILE: MarkdownCompatibilityProfile =
  "mason-v1";

export const isMasonProfile = (
  profile: MarkdownCompatibilityProfile
): boolean => profile === "mason-v1";

export const usesHardBreaks = (
  profile: MarkdownCompatibilityProfile
): boolean => profile === "legacy";
