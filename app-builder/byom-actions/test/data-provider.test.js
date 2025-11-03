/* 
* <license header>
*/

jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn()
  }
}))

const { Core } = require('@adobe/aio-sdk')
const mockLoggerInstance = {
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}
Core.Logger.mockReturnValue(mockLoggerInstance)

jest.mock('node-fetch')
const fetch = require('node-fetch')
const action = require('./../actions/data-provider/index.js')

const mockApiResponse = {
  results: [
    {
      gender: 'male',
      name: {
        title: 'Mr',
        first: 'John',
        last: 'Doe'
      },
      location: {
        street: {
          number: 123,
          name: 'Main Street'
        },
        city: 'San Francisco',
        state: 'California',
        country: 'United States',
        postcode: 94102,
        coordinates: {
          latitude: '37.7749',
          longitude: '-122.4194'
        },
        timezone: {
          offset: '-8:00',
          description: 'Pacific Time (US & Canada)'
        }
      },
      email: 'john.doe@example.com',
      login: {
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        username: 'johndoe123',
        password: 'password123',
        salt: 'salt123',
        md5: 'md5hash',
        sha1: 'sha1hash',
        sha256: 'sha256hash'
      },
      dob: {
        date: '1989-01-01T00:00:00.000Z',
        age: 35
      },
      registered: {
        date: '2020-03-15T00:00:00.000Z',
        age: 4
      },
      phone: '(555) 123-4567',
      cell: '(555) 987-6543',
      id: {
        name: 'SSN',
        value: '123-45-6789'
      },
      picture: {
        large: 'https://randomuser.me/api/portraits/men/1.jpg',
        medium: 'https://randomuser.me/api/portraits/med/men/1.jpg',
        thumbnail: 'https://randomuser.me/api/portraits/thumb/men/1.jpg'
      },
      nat: 'US'
    }
  ],
  info: {
    seed: 'test123',
    results: 1,
    page: 1,
    version: '1.4'
  }
}

beforeEach(() => {
  Core.Logger.mockClear()
  Object.values(mockLoggerInstance).forEach(fn => fn.mockReset())
  fetch.mockReset()
  
  // Default mock for API fetch - successful response
  fetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockApiResponse)
  })
})

const fakeParams = {}

describe('data-provider', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function)
  })

  test('should set logger to use LOG_LEVEL param', async () => {
    await action.main({ ...fakeParams, LOG_LEVEL: 'trace' })
    expect(Core.Logger).toHaveBeenCalledWith('data-provider', { level: 'trace' })
  })

  test('should check for overlay paths', async () => {
    const invalidParams = { ...fakeParams, __ow_path: '/invalid-path' }
    const response = await action.main(invalidParams)
    expect(response).toEqual({
      error: {
        statusCode: 404,
        body: { error: '/invalid-path is not an overlay path' }
      }
    })
  })

  test('should return HTML content with correct status code for valid path', async () => {
    const validParams = { ...fakeParams, __ow_path: '/byom-page/user' }
    const response = await action.main(validParams)
    expect(response.statusCode).toBe(200)
    expect(response.headers['Content-Type']).toBe('text/html')
    expect(typeof response.body).toBe('string')
  })

  test('should render HTML with hero block', async () => {
    const validParams = { ...fakeParams, __ow_path: '/byom-page/user' }
    const response = await action.main(validParams)
    expect(response.body).toContain('class="hero"')
    expect(response.body).toContain('Mr John Doe')
    expect(response.body).toContain('Professional team collaboration')
  })

  test('should include comprehensive metadata for indexing', async () => {
    const validParams = { ...fakeParams, __ow_path: '/byom-page/user' }
    const response = await action.main(validParams)
    
    // Check standard metadata
    expect(response.body).toContain('<meta name="description"')
    expect(response.body).toContain('<meta name="author"')
    
    // Check user-specific metadata
    expect(response.body).toContain('name="user-id"')
    expect(response.body).toContain('name="user-username"')
    expect(response.body).toContain('name="user-email"')
    expect(response.body).toContain('name="user-city"')
    expect(response.body).toContain('name="user-country"')
    expect(response.body).toContain('name="user-nationality"')
    expect(response.body).toContain('name="user-age"')
    expect(response.body).toContain('name="user-picture"')
    
    // Check Open Graph metadata
    expect(response.body).toContain('property="og:type" content="profile"')
    expect(response.body).toContain('property="og:title"')
    expect(response.body).toContain('property="profile:username"')
    
    // Check Twitter Card metadata
    expect(response.body).toContain('name="twitter:card"')
    expect(response.body).toContain('name="twitter:title"')
  })

  test('should render HTML with default content', async () => {
    const validParams = { ...fakeParams, __ow_path: '/byom-page/user' }
    const response = await action.main(validParams)
    expect(response.body).toContain('<h2>User Management Dashboard</h2>')
    expect(response.body).toContain('Welcome to the user profile overview')
  })

  test('should render HTML with user-profile block', async () => {
    const validParams = { ...fakeParams, __ow_path: '/byom-page/user' }
    const response = await action.main(validParams)
    expect(response.body).toContain('class="user-profile"')
    expect(response.body).toContain('johndoe123')
    expect(response.body).toContain('john.doe@example.com')
  })

  test('should fetch and render API user data', async () => {
    const validParams = { ...fakeParams, __ow_path: '/byom-page/user' }
    const response = await action.main(validParams)
    expect(fetch).toHaveBeenCalledWith('https://randomuser.me/api/')
    expect(response.body).toContain('Mr John Doe')
    expect(response.body).toContain('San Francisco')
    expect(response.body).toContain('john.doe@example.com')
  })

  test('should use nationality from x-user-location header if provided', async () => {
    const validParams = { 
      ...fakeParams, 
      __ow_path: '/byom-page/user',
      __ow_headers: {
        'x-user-location': 'GB'
      }
    }
    const response = await action.main(validParams)
    expect(fetch).toHaveBeenCalledWith('https://randomuser.me/api/?nat=GB')
    expect(response.statusCode).toBe(200)
  })

  test('should handle multiple nationalities in x-user-location header', async () => {
    const validParams = { 
      ...fakeParams, 
      __ow_path: '/byom-page/user',
      __ow_headers: {
        'x-user-location': 'US,GB,FR'
      }
    }
    const response = await action.main(validParams)
    expect(fetch).toHaveBeenCalledWith('https://randomuser.me/api/?nat=US,GB,FR')
    expect(response.statusCode).toBe(200)
  })

  test('should ignore invalid nationality format', async () => {
    const validParams = { 
      ...fakeParams, 
      __ow_path: '/byom-page/user',
      __ow_headers: {
        'x-user-location': 'INVALID-FORMAT!'
      }
    }
    const response = await action.main(validParams)
    expect(fetch).toHaveBeenCalledWith('https://randomuser.me/api/')
    expect(response.statusCode).toBe(200)
    expect(mockLoggerInstance.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid nationality format'))
  })

  test('should handle API failure gracefully with fallback data', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    })
    
    const validParams = { ...fakeParams, __ow_path: '/byom-page/user' }
    const response = await action.main(validParams)
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('John Doe')
    expect(response.body).toContain('johndoe')
    expect(mockLoggerInstance.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch from Random User API'))
  })

  test('if there is an error should return a 500 and log the error', async () => {
    const fakeError = new Error('template error')
    const fs = require('fs')
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw fakeError
    })
    
    const validParams = { ...fakeParams, __ow_path: '/byom-page/user' }
    const response = await action.main(validParams)
    expect(response).toEqual({
      error: {
        statusCode: 500,
        body: { error: 'server error' }
      }
    })
    expect(mockLoggerInstance.error).toHaveBeenCalledWith(fakeError)
    
    fs.readFileSync.mockRestore()
  })
})

