/**
 * Microsoft Graph API utility
 *
 * All functions accept a valid access_token as their first argument.
 * Base URL: https://graph.microsoft.com/v1.0/me
 */

const axios = require('axios');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0/me';

/**
 * Well-known mail folder names accepted by the Microsoft Graph API.
 * User-supplied folder identifiers are validated against this set or
 * the opaque Graph folder-ID pattern before being interpolated into URLs.
 */
const WELL_KNOWN_FOLDERS = new Set([
  'inbox', 'sentItems', 'drafts', 'deletedItems', 'junkEmail',
  'outbox', 'archive', 'searchfolders', 'clutter',
]);

/**
 * Validate a folder identifier before using it in a URL path.
 * Accepts well-known names or Graph folder IDs (alphanumeric + = / + - _).
 * Throws if the value looks unsafe.
 *
 * @param {string} folderName
 * @returns {string} The validated folder name
 */
function validateFolderName(folderName) {
  if (WELL_KNOWN_FOLDERS.has(folderName)) return folderName;
  // Graph folder IDs are Base64-like strings
  if (/^[A-Za-z0-9+/=_-]{1,256}$/.test(folderName)) return folderName;
  throw new Error(`Invalid folder name: ${folderName}`);
}

/**
 * Validate a Graph message ID before using it in a URL path.
 * Graph message IDs are opaque Base64-like strings.
 *
 * @param {string} messageId
 * @returns {string} The validated message ID
 */
function validateMessageId(messageId) {
  if (/^[A-Za-z0-9+/=_-]{1,512}$/.test(messageId)) return messageId;
  throw new Error('Invalid message ID');
}

/**
 * Build a pre-configured Axios instance for a given access token.
 */
function graphClient(accessToken) {
  return axios.create({
    baseURL: GRAPH_BASE,
    headers: { Authorization: 'Bearer ' + accessToken },
    timeout: 15000,
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * List messages in the user's inbox.
 *
 * @param {string} accessToken
 * @param {number} top    - Max results (default 20)
 * @param {number} skip   - Offset for paging
 * @param {string|null} search - Optional OData search term
 */
async function getInboxMessages(accessToken, top = 20, skip = 0, search = null) {
  const client = graphClient(accessToken);
  const params = {
    $top: top,
    $skip: skip,
    $select: 'id,subject,from,receivedDateTime,isRead,bodyPreview,hasAttachments',
    $orderby: 'receivedDateTime desc',
  };
  if (search) params.$search = `"${search}"`;

  const response = await client.get('/mailFolders/inbox/messages', { params });
  return response.data;
}

/**
 * List messages in any named mail folder.
 *
 * @param {string} accessToken
 * @param {string} folderName - Folder display name or well-known name (e.g. 'sentItems', 'drafts')
 * @param {number} top
 * @param {number} skip
 * @param {string|null} search
 */
async function getFolderMessages(accessToken, folderName, top = 20, skip = 0, search = null) {
  const safeFolder = validateFolderName(folderName);
  const client = graphClient(accessToken);
  const params = {
    $top: top,
    $skip: skip,
    $select: 'id,subject,from,receivedDateTime,isRead,bodyPreview,hasAttachments',
    $orderby: 'receivedDateTime desc',
  };
  if (search) params.$search = `"${search}"`;

  const response = await client.get(`/mailFolders/${safeFolder}/messages`, { params });
  return response.data;
}

/**
 * Get full content of a single message including attachments metadata.
 *
 * @param {string} accessToken
 * @param {string} messageId
 */
async function getMessage(accessToken, messageId) {
  const safeId = validateMessageId(messageId);
  const client = graphClient(accessToken);
  const response = await client.get(`/messages/${safeId}`, {
    params: {
      $select: 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,hasAttachments',
    },
  });
  return response.data;
}

/**
 * Send an email on behalf of the authenticated user.
 *
 * @param {string} accessToken
 * @param {{ to: string|string[], subject: string, body: string, contentType?: string }} emailData
 */
async function sendEmail(accessToken, emailData) {
  const client = graphClient(accessToken);

  const toRecipients = (Array.isArray(emailData.to) ? emailData.to : [emailData.to]).map(
    (address) => ({ emailAddress: { address } })
  );

  const message = {
    subject: emailData.subject,
    body: {
      contentType: emailData.contentType || 'HTML',
      content: emailData.body,
    },
    toRecipients,
  };

  await client.post('/sendMail', { message, saveToSentItems: true });
}

/**
 * List the user's mail folders.
 *
 * @param {string} accessToken
 */
async function getMailFolders(accessToken) {
  const client = graphClient(accessToken);
  const response = await client.get('/mailFolders', {
    params: { $select: 'id,displayName,totalItemCount,unreadItemCount' },
  });
  return response.data;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

/**
 * List the user's contacts.
 *
 * @param {string} accessToken
 * @param {number} top - Max results
 */
async function getContacts(accessToken, top = 50) {
  const client = graphClient(accessToken);
  const response = await client.get('/contacts', {
    params: {
      $top: top,
      $select: 'id,displayName,emailAddresses,phones,jobTitle,companyName',
      $orderby: 'displayName',
    },
  });
  return response.data;
}

module.exports = {
  getInboxMessages,
  getFolderMessages,
  getMessage,
  sendEmail,
  getMailFolders,
  getContacts,
};
