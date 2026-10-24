package com.pdfkagaz.pdfnative

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LauncherBindingTest {
  private val first = Any()
  private val recreated = Any()

  @Test
  fun unboundNeedsRegistration() {
    assertTrue(LauncherBinding().needsRegistration(first))
  }

  @Test
  fun boundActivityNeedsNoRegistration() {
    val binding = LauncherBinding()
    binding.bind(first)
    assertFalse(binding.needsRegistration(first))
  }

  @Test
  fun recreatedActivityNeedsRegistrationOnce() {
    val binding = LauncherBinding()
    binding.bind(first)
    assertTrue(binding.needsRegistration(recreated))
    binding.bind(recreated)
    assertFalse(binding.needsRegistration(recreated))
    assertTrue(binding.needsRegistration(first))
  }

  @Test
  fun comparesIdentityNotEquality() {
    val binding = LauncherBinding()
    binding.bind("activity")
    assertTrue(binding.needsRegistration(String(charArrayOf('a', 'c', 't', 'i', 'v', 'i', 't', 'y'))))
  }
}
