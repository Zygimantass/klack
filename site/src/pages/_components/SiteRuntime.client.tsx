'use client'

import { useEffect } from 'react'

import { initializeSite } from '../../../assets/site.js'

export function SiteRuntime() {
  useEffect(() => initializeSite(), [])
  return null
}
