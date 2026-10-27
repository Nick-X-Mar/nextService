/**
 * Longest chat message (or photo caption) the API stores — the same cap as a
 * request's description. Without one, a body big enough to push the row past
 * DynamoDB's 400 KB item limit came back as a bare 500 instead of a 400.
 */
export const MAX_CHAT_MESSAGE_LENGTH = 2000
