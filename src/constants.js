// ID pattern: 2-8 word-chars (letters, digits, underscores), hyphen, 3-5 digits
// Examples: ABC-123, PROJ-12345, 380sqb-139, MY_PROJ-4567
// \w covers [a-zA-Z0-9_], case-insensitive per spec
export const ID_REGEX = /\b(\w{2,8}-\d{3,5})\b/gi;

export const STORAGE_KEYS = {
  RESOURCES:     'pbf_resources_v1',
  URL_INDEX:     'pbf_url_index_v1',
  TAG_GROUPS:    'pbf_tag_groups_v1',
  PENDING_TAGS:  'pbf_pending_tags_v1',
  SETTINGS:      'pbf_settings_v1',
  IMPORT_STATE:  'pbf_import_state_v1',
};

/**
 * Legacy storage keys (used before the rename from RIM → PBF).
 * Read once during migration, then deleted.
 */
export const LEGACY_STORAGE_KEYS = {
  RESOURCES:  'rim_resources_v1',
  URL_INDEX:  'rim_url_index_v1',
  TAG_GROUPS: 'rim_tag_groups_v1',
  SETTINGS:   'rim_settings_v1',
};

export const DEFAULT_SETTINGS = {
  priorityDomains:    [],   // ordered list of preferred domains
  migrationRules:     [],   // { id, name, sourcePattern, targetTemplate }
  titleFetchEnabled:  true,
  titleFetchDelay:    3000, // ms between background title fetches
};

export const MSG = {
  PING:                  'PING',
  ADD_TITLE:             'ADD_TITLE',
  SCHEDULE_TITLE_FETCH:  'SCHEDULE_TITLE_FETCH',
  GET_PENDING_TAGS:      'GET_PENDING_TAGS',
  CLEAR_PENDING_TAG:     'CLEAR_PENDING_TAG',
};