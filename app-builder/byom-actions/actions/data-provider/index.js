/*
* <license header>
*/

/**
 * Action: Data Provider
 * Purpose: Generates HTML content for overlay paths under `/byom-page/*` that the Helix Admin API consumes during
 *          preview. This action is invoked indirectly when the webhook action triggers a preview
 *          for a newly generated `/byom-page/<timestamp>` path.
 *
 * How it works:
 * - Validates that the requested `__ow_path` is an overlay path (`/byom-page/*`). If not, returns 404.
 * - Reads the optional nationality value from the `x-content-source-location` header. This header is set by the
 *   webhook action when calling the Helix Admin API, and is forwarded here by Helix.
 * - Calls the Random User API (`https://randomuser.me/api/`) and, if a nationality is present, adds `?nat=<value>`.
 * - Maps the API response to a simple data model and renders `templates/user-profile.html` using Handlebars.
 * - Returns `text/html` with the rendered user profile. If the API call fails, returns a deterministic fallback user.
 *
 * Inputs:
 * - params.__ow_path (string): Request path; must start with `/byom-page`.
 * - params.__ow_headers['x-content-source-location'] (string, optional): Nationality filter forwarded from webhook.
 *
 * Output:
 * - HTML page (Content-Type: text/html) suitable for indexing/publishing by Helix.
 *
 * Local/Direct testing example (deployed action URL shape may vary):
 *   curl "https://<runtime-host>/api/v1/web/<ns>/<pkg>/data-provider/byom-page/123" \
 *     -H "x-content-source-location: US"
 *
 * Related:
 * - Orchestrating action: `actions/webhook/index.js`
 * - Template: `actions/data-provider/templates/user-profile.html`
 */
const fetch = require('node-fetch')
const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../utils')
const Handlebars = require('handlebars')
const fs = require('fs')

const RANDOM_API_ENDPOINT = 'https://randomuser.me/api/'

async function main(params) {
  const logger = Core.Logger('data-provider', { level: params.LOG_LEVEL || 'debug' })

  try {
    logger.info('Invoked data-provider action')
    logger.info(params.__ow_headers)

    // check for overlay paths
    let path = params.__ow_path;
    if (!path.startsWith("/")) {
      path = "/" + path;
    }
    if (!path.startsWith("/byom-page")) {
      return errorResponse(404, `${path} is not an overlay path`, logger);
    }

    // Get nationality from custom header if provided
    const nationality = params.__ow_headers?.['x-content-source-location']

    // Build API URL with optional nationality parameter
    let apiUrl = RANDOM_API_ENDPOINT
    if (nationality) {
      apiUrl = `${RANDOM_API_ENDPOINT}?nat=${nationality}`
      logger.info(`Fetching user with nationality filter: ${nationality}`)
    } else {
      logger.warn(`Invalid nationality format: ${nationality}. Using default.`)
    }


    // Fetch user data from Random User API
    logger.info(`Fetching user data from Random User API: ${apiUrl}`)
    const apiRes = await fetch(apiUrl)

    let userData = null

    if (apiRes.ok) {
      const apiData = await apiRes.json()
      logger.debug(`Fetched ${apiData.results?.length || 0} user records from API`)

      // Transform the user data for the template
      if (apiData.results && apiData.results.length > 0) {
        const user = apiData.results[0]
        const fullName = `${user.name.title} ${user.name.first} ${user.name.last}`
        const address = `${user.location.street.number} ${user.location.street.name}`
        const dobDate = new Date(user.dob.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        const registeredDate = new Date(user.registered.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

        userData = {
          fullName,
          username: user.login.username,
          email: user.email,
          phone: user.phone,
          cell: user.cell,
          picture: user.picture.large,
          address,
          city: user.location.city,
          state: user.location.state,
          country: user.location.country,
          postcode: user.location.postcode,
          gender: user.gender.charAt(0).toUpperCase() + user.gender.slice(1),
          age: user.dob.age,
          dob: dobDate,
          registered: registeredDate,
          nationality: user.nat,
          uuid: user.login.uuid,
          idName: user.id.name || 'ID',
          idValue: user.id.value || 'N/A',
          timezone: `${user.location.timezone.offset} - ${user.location.timezone.description}`,
          path: path,
          nationality_header: nationality,
          timestamp: new Date().toISOString(),
          headers: JSON.stringify(params.__ow_headers, null, 2)
        }
      }
    } else {
      logger.warn(`Failed to fetch from Random User API: ${apiRes.status} ${apiRes.statusText}`)
    }

    // If API fails, use fallback data
    if (!userData) {
      userData = {
        fullName: 'John Doe',
        username: 'johndoe',
        email: 'john.doe@example.com',
        phone: '(555) 123-4567',
        cell: '(555) 987-6543',
        picture: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
        address: '123 Main Street',
        city: 'San Francisco',
        state: 'California',
        country: 'United States',
        postcode: '94102',
        gender: 'Male',
        age: 35,
        dob: 'January 1, 1989',
        registered: 'March 15, 2020',
        nationality: 'US',
        uuid: '00000000-0000-0000-0000-000000000000',
        idName: 'SSN',
        idValue: 'XXX-XX-1234',
        timezone: 'UTC-8:00 - Pacific Time',
        path,
        nationality_header: nationality,
        timestamp: new Date().toISOString()
      }
    }

    const pageData = {
      user: userData
    }

    logger.debug(`Page data: ${JSON.stringify(pageData)}`)

    // Load and compile the template
    const templateContent = fs.readFileSync(__dirname + '/templates/user-profile.html', 'utf-8')
    logger.debug(`Template content: ${templateContent}`)
    const template = Handlebars.compile(templateContent)

    logger.debug(`Template: ${template}`)

    // Render the template with the data
    logger.info('Rendering HTML template with sample data')
    const html = template(pageData)

    const response = {
      statusCode: 200,
      body: html,
      headers: {
        'Content-Type': 'text/html'
      }
    }

    logger.info(`${response.statusCode}: HTML rendered successfully`)
    return response
  } catch (error) {
    logger.error(error)
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main

