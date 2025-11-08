/*
* <license header>
*/

/**
 * Action: Webhook
 * Purpose: Orchestrates an automated preview → publish pipeline for Helix projects (Edge Delivery Services).
 *
 * How it works (high level):
 * 1) This action is invoked by an external webhook (e.g., via HTTP POST).
 * 2) It generates a unique overlay path (e.g., `/byom-page/1731000000000`) and calls the Helix Admin API to preview
 *    that path. The request includes an admin token and optional metadata such as a nationality filter.
 * 3) The Helix Admin API, when resolving content for that overlay path, invokes the "data-provider" action in this
 *    repository (see `actions/data-provider/index.js`). That action returns HTML built from `templates/user-profile.html`.
 * 4) If preview succeeds, this action triggers a live publish for the same path, finalizing the page.
 *
 * Why the overlay path?
 * - Paths under `/byom-page/*` are treated as dynamic/overlay content resolved by the data provider action.
 *   This keeps the demo isolated and makes every run produce a fresh page URL.
 *
 * Inputs (params and env):
 * - PROJECT_COORDS (string, required): Helix project coordinates `owner/repo/ref`.
 *   - Can be provided as an action parameter or via environment variable.
 * - TOKEN (string, required): Helix admin API token.
 *   - Can be provided as an action parameter or via environment variable.
 * - NATIONALITY (string, optional): Nationality code(s) for the Random User API (e.g., `US`, `GB`, `US,GB,FR`).
 *   - May be passed in the JSON body, or as a query parameter; it will be forwarded to the data provider as a header.
 *
 * Output:
 * - JSON with a summary of preview attempts, publish result, and the generated page path.
 *
 * Example invocation (JSON body):
 *   curl -X POST "https://<runtime-host>/api/v1/web/<ns>/<pkg>/webhook" \
 *     -H "Content-Type: application/json" \
 *     -H "Authorization: Bearer <your_aio_token_if_required>" \
 *     -d '{
 *           "PROJECT_COORDS":"<owner>/<repo>/<ref>",
 *           "TOKEN":"<helix_admin_token>",
 *           "NATIONALITY":"US"
 *         }'
 *
 * The code intentionally contains verbose comments to make the control flow easy to follow for demo purposes.
 */
const fetch = require('node-fetch')
const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../utils')

const MAX_PREVIEW_ATTEMPTS = 3

/**
 * Entry point invoked by Adobe I/O Runtime.
 *
 * @param {Object} params - Action parameters, including runtime-provided metadata.
 * @param {string} [params.PROJECT_COORDS] - Helix project coordinates (e.g. owner/repo/ref).
 * @param {string} [params.TOKEN] - Helix admin token used to authenticate preview/publish requests.
 * @param {string} [params.NATIONALITY] - Optional nationality code(s) as URL parameter for user generation (e.g. 'US', 'GB', or 'US,GB,FR').
 * @returns {Promise<Object>} - HTTP response compatible object.
 */
async function main(params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info("Invoked webhook action")

    // Parse request body if present (for POST requests with JSON payload)
    let bodyParams = {}
    if (params.__ow_body) {
      try {
        const bodyString = Buffer.from(params.__ow_body, 'base64').toString('utf-8')
        logger.debug('Decoded body:', bodyString)
        bodyParams = JSON.parse(bodyString)
        logger.debug('Parsed body params:', JSON.stringify(bodyParams))
      } catch (error) {
        logger.warn('Failed to parse request body:', error.message)
      }
    }

    // Resolve essential configuration, falling back to environment variables to keep the example flexible.
    const projectCoords = params.PROJECT_COORDS || process.env.PROJECT_COORDS
    const token = params.TOKEN || process.env.TOKEN

    // Get nationality from body params first, then URL params, check both uppercase and lowercase
    const nationality = bodyParams.NATIONALITY || bodyParams.nationality || params.NATIONALITY || params.nationality
    logger.debug('Nationality value:', nationality)


    // Collect any configuration gaps before attempting network calls.
    const missingFields = []
    if (!projectCoords) missingFields.push('PROJECT_COORDS')
    if (!token) missingFields.push('TOKEN')
    if (missingFields.length > 0) {
      return errorResponse(400, `missing parameter(s) '${missingFields.join(', ')}'`, logger)
    }
    
    // Every invocation publishes a fresh page, so we derive a unique path using the current timestamp.
    const pagePath = generatePagePath()

    let previewSuccessful = false
    const previewAttempts = []

    // Preview is retried three times.
    for (let attempt = 0; attempt < MAX_PREVIEW_ATTEMPTS; attempt++) {
      const attemptNumber = attempt + 1
      const result = await processEvent(token, 'preview', projectCoords, pagePath, 'publish', nationality, logger)
      previewAttempts.push({ attempt: attemptNumber, success: result.success, status: result.status })

      if (result.success) {
        previewSuccessful = true
        logger.debug(`Preview successful for path: ${pagePath}`)
        break
      } else {
        logger.info(`Preview attempt ${attemptNumber} failed for path: ${pagePath}`)
      }
    }

    let publishSuccessful = false
    if (previewSuccessful) {
      // Only attempt a live publish after preview succeeds; this mirrors typical Helix workflows.
      const publishResult = await processEvent(token, 'live', projectCoords, pagePath, 'publish', nationality, logger)
      publishSuccessful = publishResult.success
      if (publishSuccessful) {
        logger.debug(`Publish successful for path: ${pagePath}`)
      } else {
        logger.error(`Publish failed for path: ${pagePath}`)
      }
    }

    const success = previewSuccessful && publishSuccessful
    return {
      statusCode: success ? 200 : 500,
      body: {
        previewSuccessful,
        publishSuccessful,
        previewAttempts,
        pagePath
      }
    }
  } catch (error) {
    // Any unexpected exception is mapped to a generic server error to keep the API predictable.
    logger.error(error)
    return errorResponse(500, error.message || 'server error', logger)
  }
}

/**
 * Builds a unique page path using the current timestamp.
 *
 * In real integrations you might reuse a stable fragment path, but for demos this guarantees isolation.
 *
 * @returns {string} A path like "/1699363200000" which Helix accepts as a fragment identifier.
 */
function generatePagePath() {
  return `/byom-page/${Date.now()}`
}

/**
 * Helper to call the Helix admin API for either preview or live environments.
 *
 * @param {string} token - Helix admin token.
 * @param {'preview'|'live'} uriEnv - Target environment.
 * @param {string} projectCoords - Helix project coordinates.
 * @param {string} path - Path to run this action against.
 * @param {'publish'|'delete'} action - Desired action.
 * @param {string} [nationality] - Optional nationality code(s) to pass to data provider.
 * @param {Object} logger - Structured logger instance.
 * @returns {Promise<{success: boolean, status?: number, body?: *, error?: Error}>}
 */
async function processEvent(token, uriEnv, projectCoords, path, action, nationality, logger) {
  const url = `https://admin.hlx.page/${uriEnv}/${projectCoords}${path}`
  const headers = {
    authorization: `token ${token}`
  }

  // Pass nationality to data provider via custom header if specified
  if (nationality) {
    headers['x-content-source-location'] = nationality
    // headers[x-content-source-authorization] would be routed through to the data provider as well
  }

  const options = {
    method: action === 'publish' ? 'POST' : 'DELETE',
    headers
  }

  try {
    const res = await fetch(url, options)

    if (!res.ok) {
      // Capture the upstream error payload (if any) to aid debugging during demos.
      const errorText = await safeRead(res)
      logger.info(`Request not successful: ${res.status} ${res.statusText || ''} - ${errorText}`.trim())
      return { success: false, status: res.status, statusText: res.statusText }
    }

    let payload = null
    try {
      payload = await res.json()
    } catch (parseError) {
      // Some Helix endpoints respond with empty bodies; logging at debug helps future troubleshooting.
      logger.debug(`No JSON payload returned for ${uriEnv} ${path}`)
    }

    logger.debug(`Request for ${uriEnv} successful on ${path}`)

    if (uriEnv === 'preview') {
      const previewStatus = payload?.preview?.status
      if (typeof previewStatus === 'number') {
        return { success: previewStatus === 200, status: res.status, body: payload }
      }
    }

    return { success: true, status: res.status, body: payload }
  } catch (error) {
    logger.error(`Failed to process event for ${uriEnv} on ${path}`, error)
    return { success: false, error }
  }
}

/**
 * Reads a response body as text while tolerating stream errors.
 *
 * @param {Response} res - Fetch response.
 * @returns {Promise<string>} - The raw body or an empty string if it cannot be read.
 */
async function safeRead(res) {
  try {
    return await res.text()
  } catch (error) {
    return ''
  }
}

exports.main = main
exports.processEvent = processEvent
exports.generatePagePath = generatePagePath
