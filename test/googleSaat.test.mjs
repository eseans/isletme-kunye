import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saatCevir } from '../scripts/google_birlestir.mjs'

test('Google saatleri site bicimine (gun basina tek aralik, kapali gun yok)', () => {
  assert.equal(saatCevir([
    { day: 'Pazartesi', hours: '09:00–12:00, 13:00–19:00' }, { day: 'Salı', hours: '10:00–00:00' },
    { day: 'Pazar', hours: 'Kapalı' }, { day: 'Cumartesi', hours: '24 saat açık' },
  ]), 'Mo 09:00-19:00; Tu 10:00-24:00; Sa 00:00-24:00')
  assert.equal(saatCevir([]), null)
})
