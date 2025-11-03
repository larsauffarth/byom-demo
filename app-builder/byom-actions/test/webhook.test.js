/* 
* <license header>
*/

jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn()
  }
}))

const { Core } = require('@adobe/aio-sdk')
const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() }
Core.Logger.mockReturnValue(mockLoggerInstance)

jest.mock('node-fetch')
const fetch = require('node-fetch')
const action = require('./../actions/webhook/index.js')

const FIXED_TIME = 1730457600000
const fixedPath = `/byom-page/${FIXED_TIME}`

beforeEach(() => {
  Core.Logger.mockClear()
  mockLoggerInstance.info.mockReset()
  mockLoggerInstance.debug.mockReset()
  mockLoggerInstance.error.mockReset()
  fetch.mockReset()
  jest.spyOn(Date, 'now').mockReturnValue(FIXED_TIME)
})

afterEach(() => {
  jest.restoreAllMocks()
})

const baseParams = {
  LOG_LEVEL: 'info',
  PROJECT_COORDS: 'owner/repo/main',
  TOKEN: 'aem-token'
}

describe('webhook', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function)
  })

  test('should set logger to use LOG_LEVEL param', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ preview: { status: 200 } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ status: 200 }) })

    await action.main({ ...baseParams, LOG_LEVEL: 'trace' })

    expect(Core.Logger).toHaveBeenCalledWith(expect.any(String), { level: 'trace' })
  })

  test('should return 400 when required params missing', async () => {
    const response = await action.main({ PROJECT_COORDS: 'owner/repo/main' })
    expect(response).toEqual({
      error: {
        statusCode: 400,
        body: { error: "missing parameter(s) 'TOKEN'" }
      }
    })
  })

  test('should attempt preview up to 3 times before succeeding and then publish', async () => {
    const previewFailure = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ preview: { status: 500 } })
    }
    const previewSuccess = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ preview: { status: 200 } })
    }
    const publishSuccess = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 200 })
    }

    fetch
      .mockResolvedValueOnce(previewFailure)
      .mockResolvedValueOnce(previewFailure)
      .mockResolvedValueOnce(previewSuccess)
      .mockResolvedValueOnce(publishSuccess)

    const response = await action.main(baseParams)

    expect(response.statusCode).toBe(200)
    expect(response.body.previewSuccessful).toBe(true)
    expect(response.body.publishSuccessful).toBe(true)
    expect(response.body.previewAttempts).toHaveLength(3)
    expect(response.body.pagePath).toBe(fixedPath)
    expect(fetch).toHaveBeenCalledTimes(4)

    const [previewUrl, previewOptions] = fetch.mock.calls[0]
    expect(previewUrl).toBe(`https://admin.hlx.page/preview/${baseParams.PROJECT_COORDS}${fixedPath}`)
    expect(previewOptions.headers.authorization).toBe(`token ${baseParams.TOKEN}`)
    expect(previewOptions.headers['x-user-location']).toBeUndefined()

    const publishUrl = fetch.mock.calls[3][0]
    expect(publishUrl).toBe(`https://admin.hlx.page/live/${baseParams.PROJECT_COORDS}${fixedPath}`)
  })

  test('should set x-user-location header when nationality URL parameter is provided', async () => {
    const previewSuccess = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ preview: { status: 200 } })
    }
    const publishSuccess = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 200 })
    }

    fetch
      .mockResolvedValueOnce(previewSuccess)
      .mockResolvedValueOnce(publishSuccess)

    const paramsWithNationality = { 
      ...baseParams, 
      NATIONALITY: 'GB,FR,DE'
    }
    const response = await action.main(paramsWithNationality)

    expect(response.statusCode).toBe(200)
    expect(response.body.previewSuccessful).toBe(true)
    expect(response.body.publishSuccessful).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)

    // Check preview request has nationality header set
    const [, previewOptions] = fetch.mock.calls[0]
    expect(previewOptions.headers['x-user-location']).toBe('GB,FR,DE')

    // Check publish request has nationality header set
    const [, publishOptions] = fetch.mock.calls[1]
    expect(publishOptions.headers['x-user-location']).toBe('GB,FR,DE')
  })

  test('should parse nationality from POST request body', async () => {
    const previewSuccess = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ preview: { status: 200 } })
    }
    const publishSuccess = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 200 })
    }

    fetch
      .mockResolvedValueOnce(previewSuccess)
      .mockResolvedValueOnce(publishSuccess)

    // Simulate POST request with JSON body containing NATIONALITY
    const bodyJson = { NATIONALITY: 'ES' }
    const bodyBase64 = Buffer.from(JSON.stringify(bodyJson)).toString('base64')
    
    const paramsWithBody = { 
      ...baseParams,
      __ow_body: bodyBase64,
      __ow_method: 'post'
    }
    const response = await action.main(paramsWithBody)

    expect(response.statusCode).toBe(200)
    expect(response.body.previewSuccessful).toBe(true)
    expect(response.body.publishSuccessful).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)

    // Check preview request has nationality header set from body
    const [, previewOptions] = fetch.mock.calls[0]
    expect(previewOptions.headers['x-user-location']).toBe('ES')

    // Check publish request has nationality header set from body
    const [, publishOptions] = fetch.mock.calls[1]
    expect(publishOptions.headers['x-user-location']).toBe('ES')
  })

  test('should return 500 when preview never succeeds', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ preview: { status: 500 } })
    })

    const response = await action.main(baseParams)

    expect(response.statusCode).toBe(500)
    expect(response.body.previewSuccessful).toBe(false)
    expect(response.body.publishSuccessful).toBe(false)
    expect(response.body.pagePath).toBe(fixedPath)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  test('should return 500 and log error when publish fails', async () => {
    const previewSuccess = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ preview: { status: 200 } })
    }
    const publishFailure = {
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: () => Promise.resolve('failure')
    }

    fetch
      .mockResolvedValueOnce(previewSuccess)
      .mockResolvedValueOnce(publishFailure)

    const response = await action.main(baseParams)

    expect(response.statusCode).toBe(500)
    expect(response.body.previewSuccessful).toBe(true)
    expect(response.body.publishSuccessful).toBe(false)
    expect(response.body.pagePath).toBe(fixedPath)
    expect(mockLoggerInstance.error).toHaveBeenCalledWith(`Publish failed for path: ${fixedPath}`)
  })
})
