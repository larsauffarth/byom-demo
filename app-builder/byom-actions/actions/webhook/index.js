/*
* <license header>
*/

/**
 * Webhook action that demonstrates a simple preview → publish pipeline for Helix projects.
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

    // Every invocation publishes a fresh page, so we derive a unique path using the current timestamp.
    const pagePath = generatePagePath()

    // Collect any configuration gaps before attempting network calls.
    const missingFields = []
    if (!projectCoords) missingFields.push('PROJECT_COORDS')
    if (!token) missingFields.push('TOKEN')
    if (missingFields.length > 0) {
      return errorResponse(400, `missing parameter(s) '${missingFields.join(', ')}'`, logger)
    }

    let previewSuccessful = false
    const previewAttempts = []

    // Preview is retried a few times because upstream builds can be eventually consistent.
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
 * @param {string} path - Fragment path to publish.
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
