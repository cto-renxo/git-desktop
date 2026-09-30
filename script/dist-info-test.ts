import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  getExecutableName,
  getUpdatesURL,
  getWindowsIdentifierName,
  shouldMakeDelta,
} from './dist-info'
import { getBundleID, getProductName } from '../app/package-info'

describe('local distribution identity and updates', () => {
  let original: Record<string, string | undefined>
  const keys = ['NODE_ENV', 'RELEASE_CHANNEL', 'DESKTOP_UPDATES_URL']
  beforeEach(() => {
    original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
    process.env.NODE_ENV = 'production'
    process.env.RELEASE_CHANNEL = 'production'
    delete process.env.DESKTOP_UPDATES_URL
  })
  afterEach(() => {
    for (const key of keys) {
      if (original[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original[key]
      }
    }
  })

  it('uses Git Desktop production and development names with compatible bundle IDs', () => {
    assert.equal(getProductName(), 'Git Desktop')
    assert.equal(getBundleID(), 'com.github.GitHubClient')
    assert.equal(getWindowsIdentifierName(), 'GitDesktop')
    if (process.platform === 'win32') {
      assert.equal(getExecutableName(), 'GitDesktop')
    }
    process.env.NODE_ENV = 'development'
    assert.equal(getProductName(), 'Git Desktop-dev')
    assert.equal(getBundleID(), 'com.github.GitHubClientDev')
  })

  it('disables updates and delta downloads without a fork feed', () => {
    assert.equal(getUpdatesURL(), '')
    assert.equal(shouldMakeDelta(), false)
  })

  it('rejects the upstream feed and insecure feeds', () => {
    process.env.DESKTOP_UPDATES_URL =
      'https://central.github.com/api/deployments/desktop/desktop/latest'
    assert.throws(getUpdatesURL, /owned by this fork/)
    process.env.DESKTOP_UPDATES_URL = 'http://updates.example.com/latest'
    assert.throws(getUpdatesURL, /HTTPS/)
  })

  it('accepts an explicitly configured HTTPS fork feed', () => {
    process.env.DESKTOP_UPDATES_URL =
      'https://updates.example.com/custom/latest'
    assert.equal(getUpdatesURL(), process.env.DESKTOP_UPDATES_URL)
    assert.equal(shouldMakeDelta(), true)
  })
})
