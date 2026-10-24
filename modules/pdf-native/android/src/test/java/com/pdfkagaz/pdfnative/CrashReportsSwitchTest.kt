package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Stands in for FirebaseCrashlytics: the same static getInstance() and Boolean setter. */
class FakeCrashlytics {
  var collection: Boolean? = null

  fun setCrashlyticsCollectionEnabled(enabled: java.lang.Boolean?) {
    collection = enabled?.booleanValue()
  }

  companion object {
    @JvmField val shared = FakeCrashlytics()

    @JvmStatic fun getInstance(): FakeCrashlytics = shared
  }
}

class CrashReportsSwitchTest {
  @Before
  fun reset() {
    FakeCrashlytics.shared.collection = null
  }

  @Test
  fun `is a no-op returning false when Firebase is not on the classpath`() {
    assertFalse(CrashReportsSwitch.disableNow("com.google.firebase.crashlytics.FirebaseCrashlytics"))
  }

  @Test
  fun `turns collection off on the Crashlytics instance when it is present`() {
    assertTrue(CrashReportsSwitch.disableNow(FakeCrashlytics::class.java.name))
    assertEquals(false, FakeCrashlytics.shared.collection)
  }

  @Test
  fun `returns false when the class lacks the API`() {
    assertFalse(CrashReportsSwitch.disableNow(String::class.java.name))
  }
}
